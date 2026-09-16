import {
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_CHUNK, FOG_CHUNK, CAUSTIC_CHUNK, TERRAIN_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// Reef rocks. v2 swaps the procedural icosahedron base for two real GLB rock
// models (config.underwater.rockModels — served from the host's public root).
// Each model is still drawn in a SINGLE instanced draw call with per-instance
// yaw + non-uniform scale, exactly as before — the two models plus the scale
// variation give the visual variety ("multiply it using scale so it looks
// different"). The scatter layout, camera, and seeded RNG order are UNCHANGED,
// so kelp/fish/turtles/particles downstream keep their identical placement.
//
// Lighting: the scene has no real lights (everything underwater is shaded by a
// faked sun in custom shaders), so we do NOT use the GLB's PBR material. We
// sample only its base-color texture and run it through the same underwater
// response as before — fog, caustics, sun + fake AO, and the depth-mood fog
// from UnderwaterWorld.setDepth(). The GLB's normal/roughness maps are skipped
// (they'd need tangents + a lighting rig this scene doesn't have); the vertex
// normals carry the shading.

const VERT = /* glsl */ `
${'__NOISE__'}
${'__TERRAIN__'}
uniform float uFloorDepth;

attribute vec3 aOffset;   // world x, embed (partial burial), world z
attribute vec3 aScale;
attribute float aRot;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  float c = cos(aRot);
  float s = sin(aRot);
  mat3 rot = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);

  // Sit on the ACTUAL seabed (dunes + drop-off shelf), not a flat plane — same
  // terrainHeight() the floor uses, so rocks never float where the floor dips.
  float groundY = -uFloorDepth + terrainHeight(vec2(aOffset.x, aOffset.z));
  vec3 center = vec3(aOffset.x, groundY + aOffset.y, aOffset.z);

  vec3 p = rot * (position * aScale) + center;
  // Non-uniform scale: divide the normal by the scale to keep it correct.
  vNormal = normalize(rot * (normal / aScale));
  vUv = uv;
  vWorldPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
${'__NOISE__'}
${'__FOG__'}
${'__CAUSTIC__'}
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform float uAmbient;
uniform float uCausticScale;
uniform float uCausticStrength;
uniform vec3 uCausticColor;
uniform sampler2D uBaseColorMap;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec3 N = normalize(vNormal);
  // The base-color map is tagged sRGB (see _loadModel), so on WebGL2 the
  // sampler hardware-decodes it to linear — no manual decode here, or it
  // would darken twice. Everything else in the scene is linear too.
  vec3 base = texture2D(uBaseColorMap, vUv).rgb;

  // Faked sun + fake AO (darker toward down-facing surfaces), same as the
  // procedural rock used — keeps the rocks sitting in the same light.
  float light = clamp(dot(N, normalize(vec3(uSunDir.x, 1.2, uSunDir.z))), 0.0, 1.0);
  float ao = 0.55 + 0.45 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = base * (uAmbient + (1.0 - uAmbient) * light) * ao;

  // Animated caustic web on up-facing surfaces.
  float c = caustic(vWorldPos.xz * uCausticScale, uTime) * clamp(N.y, 0.0, 1.0);
  col += uCausticColor * c * uCausticStrength;

  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Rocks {
  constructor(config, quality, sunDir, rng) {
    const uw = config.underwater;
    const count = Math.round(uw.rockCount * quality.underwaterScale);

    // ---------------------------------------------------------------------
    // 1) Consume the shared RNG in the EXACT same order/amount as the old
    //    procedural version, so every system built after Rocks in
    //    UnderwaterWorld keeps its identical seeded layout. The only new
    //    logic (model selection) reuses an already-drawn value (aRot) and
    //    draws NO extra rng.
    // ---------------------------------------------------------------------
    const modelCount = (uw.rockModels ?? ['/fd-rock.glb', '/rock.glb']).length;
    const instances = [];
    for (let i = 0; i < count; i++) {
      const z = -uw.restZ - rng() * uw.areaLength;
      const side = rng() < 0.5 ? -1 : 1;
      // 18% become huge reef mounds framing the valley; the rest are boulders.
      const big = rng() < 0.18;
      const x = big
        ? side * (16 + rng() * uw.areaWidth * 0.35)
        : side * (6 + rng() * rng() * uw.areaWidth * 0.5);
      const s = big ? 7 + rng() * 9 : 0.7 + rng() * rng() * 3.4;
      // aOffset.y now carries just the partial-burial embed; the seabed height
      // is resolved per-instance in the vertex shader (terrain-aware).
      const embed = s * 0.25;
      const sx = s * (0.8 + rng() * 0.5);
      const sy = s * (0.6 + rng() * 0.5);
      const sz = s * (0.8 + rng() * 0.5);
      const rot = rng() * Math.PI * 2;
      // Split across the two models with NO extra rng: rotation is already
      // uniform-random in [0, 2π), so its halves give a stable ~50/50 spatial
      // mix — both models appear as mounds and as boulders. Swap this rule to
      // e.g. `big ? 0 : 1` if you want one model to BE the big mounds.
      const model = Math.floor((rot / (Math.PI * 2)) * modelCount) % modelCount;
      instances.push({ off: [x, embed, z], scale: [sx, sy, sz], rot, model });
    }
    this._instances = instances;

    // ---------------------------------------------------------------------
    // 2) Group + one material per model up front, so UnderwaterWorld can add
    //    this.mesh and call setDepth()/update() immediately — before the async
    //    GLB load resolves. Meshes are added to the group once loaded.
    // ---------------------------------------------------------------------
    this.mesh = new Group();
    this.mesh.frustumCulled = false;
    this._textures = [];
    this.materials = [];
    for (let k = 0; k < modelCount; k++) {
      this.materials.push(this._makeMaterial(config, uw, sunDir));
    }

    // 3) Load the GLB models, then build + attach the instanced meshes.
    this._debug = config.debug;
    this._load(uw);
  }

  _makeMaterial(config, uw, sunDir) {
    return new ShaderMaterial({
      vertexShader: VERT.replace('__NOISE__', NOISE_CHUNK).replace('__TERRAIN__', TERRAIN_CHUNK),
      fragmentShader: FRAG
        .replace(/__NOISE__/g, NOISE_CHUNK)
        .replace('__FOG__', FOG_CHUNK)
        .replace('__CAUSTIC__', CAUSTIC_CHUNK),
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new Vector3() },
        uSunDir: { value: sunDir.clone() },
        uAmbient: { value: uw.ambient ?? 0.55 },
        uCausticScale: { value: uw.causticScale ?? 0.85 },
        uCausticStrength: { value: (uw.causticStrength ?? 0.35) * 0.8 },
        uCausticColor: { value: linearColor(uw.colors.caustic) },
        uBaseColorMap: { value: null }, // set when its GLB texture resolves
        uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
        uFogDensity: { value: uw.fogDensity },
        // Terrain-follow (must match SandFloor's drop-off values exactly).
        uFloorDepth: { value: uw.floorDepth },
        uDropOffZ: { value: uw.dropOffZ ?? -230 },
        uDropOffDepth: { value: uw.dropOffDepth ?? 90 },
        uDropOffWidth: { value: uw.dropOffWidth ?? 70 },
        uDropOffWaver: { value: uw.dropOffWaver ?? 40 },
      },
    });
  }

  async _load(uw) {
    const urls = uw.rockModels ?? ['/fd-rock.glb', '/rock.glb'];
    const targetSize = uw.rockModelSize ?? 2; // normalized extent ≈ old base rock
    const loader = new GLTFLoader();

    try {
      const bases = await Promise.all(
        urls.map((url) => this._loadModel(loader, url, targetSize))
      );

      for (let k = 0; k < bases.length; k++) {
        const forThisModel = this._instances.filter((o) => o.model === k);
        if (!forThisModel.length) continue;

        const geometry = this._buildInstanced(bases[k].geometry, forThisModel);
        this.materials[k].uniforms.uBaseColorMap.value = bases[k].texture;
        if (bases[k].texture) this._textures.push(bases[k].texture);

        const mesh = new Mesh(geometry, this.materials[k]);
        mesh.frustumCulled = false;
        this.mesh.add(mesh);
      }
      this._loaded = true;
    } catch (err) {
      if (this._debug) console.warn('[OceanIntro] rock GLB load failed:', err);
    }
  }

  /** Load one GLB → { geometry (position/normal/uv, centered + normalized), texture }. */
  async _loadModel(loader, url, targetSize) {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateWorldMatrix(true, true);

    const geos = [];
    let texture = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld); // bake the node transform into the verts
      // Keep only what the instanced shader consumes so mergeGeometries
      // (and the shared-attribute assignment below) stay well-defined.
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') {
          g.deleteAttribute(name);
        }
      }
      geos.push(g);
      if (!texture && o.material && o.material.map) {
        texture = o.material.map;
        texture.colorSpace = SRGBColorSpace; // hardware-decoded to linear on sample
      }
    });

    let geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();

    // Normalize: center at origin and scale so the largest axis matches the
    // old base rock's extent, so the existing per-instance scale + floor
    // offset math lands the models in the same place.
    geometry.computeBoundingBox();
    const size = new Vector3();
    geometry.boundingBox.getSize(size);
    const scale = targetSize / Math.max(size.x, size.y, size.z);
    geometry.scale(scale, scale, scale);
    geometry.center();

    return { geometry, texture };
  }

  _buildInstanced(base, instances) {
    const n = instances.length;
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes.position = base.attributes.position;
    geometry.attributes.normal = base.attributes.normal;
    geometry.attributes.uv = base.attributes.uv;
    geometry.instanceCount = n;

    const offsets = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);
    const rots = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      offsets.set(instances[i].off, i * 3);
      scales.set(instances[i].scale, i * 3);
      rots[i] = instances[i].rot;
    }
    geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('aScale', new InstancedBufferAttribute(scales, 3));
    geometry.setAttribute('aRot', new InstancedBufferAttribute(rots, 1));
    return geometry;
  }

  update(time, cameraPos) {
    for (const m of this.materials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uCameraPos.value.copy(cameraPos);
    }
  }

  dispose() {
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    for (const t of this._textures) t.dispose();
  }
}