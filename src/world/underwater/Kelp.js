// import {
//   Box3,
//   BufferGeometry,
//   DoubleSide,
//   Float32BufferAttribute,
//   Group,
//   InstancedBufferAttribute,
//   InstancedBufferGeometry,
//   Mesh,
//   ShaderMaterial,
//   SRGBColorSpace,
//   Vector3,
// } from 'three';
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// import { NOISE_CHUNK, FOG_CHUNK, TERRAIN_CHUNK } from './chunks.js';
// import { linearColor } from '../../utils/math.js';

// // Seabed plants — three GLB models (config.underwater.kelpModels), each one
// // instanced. Distributed by weight (first = most common, last = rarest). Real
// // plant GLBs vary a lot, so the loader handles all of these:
// //   • textured OR untextured meshes (untextured → solid color from config)
// //   • multiple materials/textures per model (one instanced draw per material)
// //   • alpha-mask leaf cutouts, webp textures, and KHR_mesh_quantization
// // Placement, terrain-follow, sway, and the seeded RNG order are unchanged.

// const VERT = /* glsl */ `
// ${'__NOISE__'}
// ${'__TERRAIN__'}
// uniform float uTime;
// uniform float uFloorDepth;
// uniform float uSway;

// attribute vec3 aOffset;   // world x, base embed, world z
// attribute float aScale;   // uniform plant size (meters)
// attribute float aRot;     // yaw
// attribute float aPhase;   // sway phase (0..1)

// varying vec3 vWorldPos;
// varying vec3 vNormal;
// varying vec2 vUv;

// void main() {
//   vUv = uv;
//   // Model normalized to unit height, base at y=0 → position.y IS the height
//   // fraction (drives the sway weight).
//   float hf = clamp(position.y, 0.0, 1.0);

//   vec3 p = position * aScale;

//   float w = hf * hf;
//   float sway = sin(uTime * 0.7 + aPhase * 6.2831 + hf * 2.2) * 0.9
//              + sin(uTime * 1.55 + aPhase * 12.0 + hf * 4.0) * 0.22;
//   p.x += sway * w * aScale * uSway;
//   p.z += cos(uTime * 0.5 + aPhase * 6.2831) * w * aScale * uSway * 0.5;

//   float c = cos(aRot);
//   float s = sin(aRot);
//   vec3 rp = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
//   vNormal = normalize(vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z));
//   float groundY = -uFloorDepth + terrainHeight(vec2(aOffset.x, aOffset.z));
//   vec3 world = rp + vec3(aOffset.x, groundY + aOffset.y, aOffset.z);

//   vWorldPos = world;
//   gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
// }
// `;

// const FRAG_HEAD = /* glsl */ `
// ${'__FOG__'}
// uniform vec3 uCameraPos;
// uniform vec3 uSunDir;
// uniform float uAmbient;
// varying vec3 vWorldPos;
// varying vec3 vNormal;
// varying vec2 vUv;

// // Same lighting the rocks use: ambient floor + faked sun + gentle AO, so
// // nothing renders black. Double-sided leaves stay lit via the ambient floor.
// vec3 litPlant(vec3 base) {
//   vec3 N = normalize(vNormal);
//   float light = clamp(dot(N, normalize(vec3(uSunDir.x, 1.2, uSunDir.z))), 0.0, 1.0);
//   float ao = 0.6 + 0.4 * (N.y * 0.5 + 0.5);
//   return base * (uAmbient + (1.0 - uAmbient) * light) * ao;
// }
// `;

// const FRAG_TEX = FRAG_HEAD + /* glsl */ `
// uniform sampler2D uBaseColorMap;
// uniform float uAlphaTest;
// void main() {
//   vec4 t = texture2D(uBaseColorMap, vUv);
//   if (uAlphaTest > 0.0 && t.a < uAlphaTest) discard; // leaf-card cutout
//   vec3 col = litPlant(t.rgb);
//   col = underFog(col, distance(uCameraPos, vWorldPos));
//   gl_FragColor = vec4(col, 1.0);
// }
// `;

// const FRAG_SOLID = FRAG_HEAD + /* glsl */ `
// uniform vec3 uSolidColor;
// void main() {
//   vec3 col = litPlant(uSolidColor);
//   col = underFog(col, distance(uCameraPos, vWorldPos));
//   gl_FragColor = vec4(col, 1.0);
// }
// `;

// const DEFAULT_MODELS = [
//   { url: '/seaweed.glb', weight: 60, color: '#3f6f52' }, // untextured → solid color
//   { url: '/meshn.glb', weight: 30 },
//   { url: '/mushroom.glb', weight: 2 },
// ];

// export class Kelp {
//   constructor(config, quality, sunDir, rng) {
//     const uw = config.underwater;
//     this._config = config;
//     this._sunDir = sunDir;
//     const count = Math.round(uw.kelpCount * quality.underwaterScale);
//     const models = uw.kelpModels ?? DEFAULT_MODELS;
//     this._models = models;

//     // Cumulative weight thresholds for the model split.
//     const weights = models.map((m) => m.weight ?? 1);
//     const totalW = weights.reduce((a, b) => a + b, 0) || 1;
//     const thresh = [];
//     let acc = 0;
//     for (const w of weights) { acc += w / totalW; thresh.push(acc); }

//     // Draw RNG in the SAME order/amount as the old kelp loop so downstream
//     // systems keep their seeded layout. Model choice is a per-index hash (no
//     // rng draw), so it doesn't correlate plant type with sway/rotation.
//     const instances = [];
//     for (let i = 0; i < count; i++) {
//       const z = -uw.restZ - rng() * uw.areaLength;
//       const side = rng() < 0.5 ? -1 : 1;
//       const x = side * (4 + rng() * rng() * uw.areaWidth * 0.45) + (rng() - 0.5) * 6;
//       const size = 3.5 + rng() * rng() * 9;
//       const rot = rng() * Math.PI * 2;
//       const phase = rng();

//       const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
//       let model = models.length - 1;
//       for (let k = 0; k < thresh.length; k++) { if (h < thresh[k]) { model = k; break; } }

//       instances.push({ x, z, size, rot, phase, model });
//     }
//     this._instances = instances;

//     this.mesh = new Group();
//     this.mesh.frustumCulled = false;
//     this.materials = []; // filled as models load (one per material group)
//     this._textures = [];

//     this._load(uw);
//   }

//   async _load(uw) {
//     const loader = new GLTFLoader();
//     const results = await Promise.allSettled(
//       this._models.map((m) => this._loadModel(loader, m))
//     );

//     results.forEach((res, k) => {
//       const url = this._models[k].url;
//       if (res.status === 'rejected') {
//         console.warn(`[OceanIntro] kelp model failed to load: ${url}\n`, res.reason);
//         return;
//       }
//       const groups = res.value;
//       if (!groups || !groups.length) {
//         console.warn(`[OceanIntro] kelp model has no renderable geometry: ${url}`);
//         return;
//       }
//       const inst = this._instances.filter((o) => o.model === k);
//       if (!inst.length) return;

//       const attribs = this._instanceAttribs(inst, uw);
//       for (const group of groups) {
//         const geometry = new InstancedBufferGeometry();
//         geometry.attributes.position = group.geometry.attributes.position;
//         if (group.geometry.attributes.normal) geometry.attributes.normal = group.geometry.attributes.normal;
//         if (group.geometry.attributes.uv) geometry.attributes.uv = group.geometry.attributes.uv;
//         geometry.instanceCount = inst.length;
//         geometry.setAttribute('aOffset', attribs.aOffset);
//         geometry.setAttribute('aScale', attribs.aScale);
//         geometry.setAttribute('aRot', attribs.aRot);
//         geometry.setAttribute('aPhase', attribs.aPhase);

//         const mat = this._makeMaterial(uw, group);
//         this.materials.push(mat);
//         if (group.texture) this._textures.push(group.texture);

//         const mesh = new Mesh(geometry, mat);
//         mesh.frustumCulled = false;
//         this.mesh.add(mesh);
//       }
//     });
//     this._loaded = true;
//   }

//   /** Load one plant GLB → array of render groups (one per material). */
//   async _loadModel(loader, model) {
//     const gltf = await loader.loadAsync(model.url);
//     gltf.scene.updateWorldMatrix(true, true);

//     // 1) Collect every mesh primitive as world-baked, de-quantized float geo.
//     const prims = [];
//     gltf.scene.traverse((o) => {
//       if (o.isMesh && o.geometry && o.geometry.attributes.position) {
//         prims.push({ geo: this._prepGeo(o), material: o.material });
//       }
//     });
//     if (!prims.length) return null;

//     // 2) Normalize the whole model together: xz-centered, base at y=0, unit
//     //    height — so per-instance aScale sets the real height for every part.
//     const box = new Box3();
//     for (const p of prims) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
//     const size = new Vector3();
//     box.getSize(size);
//     const s = 1 / Math.max(size.y, 1e-4);
//     const cx = (box.max.x + box.min.x) / 2;
//     const cz = (box.max.z + box.min.z) / 2;
//     for (const p of prims) {
//       p.geo.translate(-cx, -box.min.y, -cz);
//       p.geo.scale(s, s, s);
//     }

//     // 3) Group primitives by material → one instanced draw each.
//     const byMat = new Map();
//     for (const p of prims) {
//       const key = p.material ? p.material.uuid : 'none';
//       if (!byMat.has(key)) byMat.set(key, { material: p.material, geos: [] });
//       byMat.get(key).geos.push(p.geo);
//     }

//     const groups = [];
//     for (const { material, geos } of byMat.values()) {
//       const map = material && material.map ? material.map : null;
//       const textured = !!map && geos.every((g) => g.attributes.uv);

//       const cleaned = geos.map((g) => {
//         for (const name of Object.keys(g.attributes)) {
//           if (name !== 'position' && name !== 'normal' && !(textured && name === 'uv')) {
//             g.deleteAttribute(name);
//           }
//         }
//         return g;
//       });
//       let geometry = cleaned.length === 1 ? cleaned[0] : mergeGeometries(cleaned, false);
//       if (!geometry) continue;

//       if (textured) map.colorSpace = SRGBColorSpace;
//       groups.push({
//         geometry,
//         textured,
//         texture: textured ? map : null,
//         // three maps glTF alphaMode:MASK → material.alphaTest (>0); OPAQUE → 0.
//         alphaTest: material && material.alphaTest ? material.alphaTest : 0.0,
//         color: model.color ?? this._config.underwater.colors.kelp,
//       });
//     }
//     return groups;
//   }

//   /** Clone a mesh's geometry as world-baked Float32 position/normal (+uv), de-quantized. */
//   _prepGeo(mesh) {
//     const src = mesh.geometry;
//     const pos = src.attributes.position;
//     const n = pos.count;
//     const geo = new BufferGeometry();

//     const fp = new Float32Array(n * 3);
//     for (let i = 0; i < n; i++) { fp[i * 3] = pos.getX(i); fp[i * 3 + 1] = pos.getY(i); fp[i * 3 + 2] = pos.getZ(i); }
//     geo.setAttribute('position', new Float32BufferAttribute(fp, 3));

//     const nrm = src.attributes.normal;
//     if (nrm) {
//       const fn = new Float32Array(n * 3);
//       for (let i = 0; i < n; i++) { fn[i * 3] = nrm.getX(i); fn[i * 3 + 1] = nrm.getY(i); fn[i * 3 + 2] = nrm.getZ(i); }
//       geo.setAttribute('normal', new Float32BufferAttribute(fn, 3));
//     }

//     const uv = src.attributes.uv;
//     if (uv) {
//       const fu = new Float32Array(n * 2);
//       for (let i = 0; i < n; i++) { fu[i * 2] = uv.getX(i); fu[i * 2 + 1] = uv.getY(i); }
//       geo.setAttribute('uv', new Float32BufferAttribute(fu, 2));
//     }
//     if (src.index) geo.setIndex(src.index.clone());
//     geo.applyMatrix4(mesh.matrixWorld); // transforms position AND normal correctly
//     if (!geo.attributes.normal) geo.computeVertexNormals();
//     return src.index ? geo.toNonIndexed() : geo; // non-indexed → merge-safe
//   }

//   _instanceAttribs(inst, uw) {
//     const n = inst.length;
//     const embed = uw.kelpEmbed ?? 0.0;
//     const off = new Float32Array(n * 3);
//     const sc = new Float32Array(n);
//     const ro = new Float32Array(n);
//     const ph = new Float32Array(n);
//     for (let i = 0; i < n; i++) {
//       const o = inst[i];
//       off[i * 3] = o.x; off[i * 3 + 1] = embed; off[i * 3 + 2] = o.z;
//       sc[i] = o.size; ro[i] = o.rot; ph[i] = o.phase;
//     }
//     return {
//       aOffset: new InstancedBufferAttribute(off, 3),
//       aScale: new InstancedBufferAttribute(sc, 1),
//       aRot: new InstancedBufferAttribute(ro, 1),
//       aPhase: new InstancedBufferAttribute(ph, 1),
//     };
//   }

//   _makeMaterial(uw, group) {
//     const frag = (group.textured ? FRAG_TEX : FRAG_SOLID).replace('__FOG__', FOG_CHUNK);
//     const uniforms = {
//       uTime: { value: 0 },
//       uCameraPos: { value: new Vector3() },
//       uSway: { value: uw.kelpSway ?? 0.18 },
//       uSunDir: { value: this._sunDir.clone() },
//       uAmbient: { value: uw.ambient ?? 0.55 },
//       uFogColor: { value: linearColor(this._config.palette.fogNearUnderwater) },
//       uFogDensity: { value: uw.fogDensity },
//       uFloorDepth: { value: uw.floorDepth },
//       uDropOffZ: { value: uw.dropOffZ ?? -230 },
//       uDropOffDepth: { value: uw.dropOffDepth ?? 90 },
//       uDropOffWidth: { value: uw.dropOffWidth ?? 70 },
//       uDropOffWaver: { value: uw.dropOffWaver ?? 40 },
//     };
//     if (group.textured) {
//       uniforms.uBaseColorMap = { value: group.texture };
//       uniforms.uAlphaTest = { value: group.alphaTest };
//     } else {
//       uniforms.uSolidColor = { value: linearColor(group.color) };
//     }
//     return new ShaderMaterial({
//       vertexShader: VERT.replace('__NOISE__', NOISE_CHUNK).replace('__TERRAIN__', TERRAIN_CHUNK),
//       fragmentShader: frag,
//       side: DoubleSide,
//       uniforms,
//     });
//   }

//   update(time, cameraPos) {
//     for (const m of this.materials) {
//       m.uniforms.uTime.value = time;
//       m.uniforms.uCameraPos.value.copy(cameraPos);
//     }
//   }

//   dispose() {
//     this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
//     for (const m of this.materials) m.dispose();
//     for (const t of this._textures) t.dispose();
//   }
// }

import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
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
import { NOISE_CHUNK, FOG_CHUNK, TERRAIN_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// Seabed plants — three GLB models (config.underwater.kelpModels), each one
// instanced. Distributed by weight (first = most common, last = rarest). Real
// plant GLBs vary a lot, so the loader handles all of these:
//   • textured OR untextured meshes (untextured → solid color from config)
//   • multiple materials/textures per model (one instanced draw per material)
//   • alpha-mask leaf cutouts, webp textures, and KHR_mesh_quantization
// Placement, terrain-follow, sway, and the seeded RNG order are unchanged.

const VERT = /* glsl */ `
${'__NOISE__'}
${'__TERRAIN__'}
uniform float uTime;
uniform float uFloorDepth;
uniform float uSway;

attribute vec3 aOffset;   // world x, base embed, world z
attribute float aScale;   // uniform plant size (meters)
attribute float aRot;     // yaw
attribute float aPhase;   // sway phase (0..1)

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  // Model normalized to unit height, base at y=0 → position.y IS the height
  // fraction (drives the sway weight).
  float hf = clamp(position.y, 0.0, 1.0);

  vec3 p = position * aScale;

  float w = hf * hf;
  float sway = sin(uTime * 0.7 + aPhase * 6.2831 + hf * 2.2) * 0.9
             + sin(uTime * 1.55 + aPhase * 12.0 + hf * 4.0) * 0.22;
  p.x += sway * w * aScale * uSway;
  p.z += cos(uTime * 0.5 + aPhase * 6.2831) * w * aScale * uSway * 0.5;

  float c = cos(aRot);
  float s = sin(aRot);
  vec3 rp = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  vNormal = normalize(vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z));
  float groundY = -uFloorDepth + terrainHeight(vec2(aOffset.x, aOffset.z));
  vec3 world = rp + vec3(aOffset.x, groundY + aOffset.y, aOffset.z);

  vWorldPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG_HEAD = /* glsl */ `
${'__FOG__'}
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform float uAmbient;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

// Same lighting the rocks use: ambient floor + faked sun + gentle AO, so
// nothing renders black. Double-sided leaves stay lit via the ambient floor.
vec3 litPlant(vec3 base) {
  vec3 N = normalize(vNormal);
  float light = clamp(dot(N, normalize(vec3(uSunDir.x, 1.2, uSunDir.z))), 0.0, 1.0);
  float ao = 0.6 + 0.4 * (N.y * 0.5 + 0.5);
  return base * (uAmbient + (1.0 - uAmbient) * light) * ao;
}
`;

const FRAG_TEX = FRAG_HEAD + /* glsl */ `
uniform sampler2D uBaseColorMap;
uniform float uAlphaTest;
void main() {
  vec4 t = texture2D(uBaseColorMap, vUv);
  if (uAlphaTest > 0.0 && t.a < uAlphaTest) discard; // leaf-card cutout
  vec3 col = litPlant(t.rgb);
  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_SOLID = FRAG_HEAD + /* glsl */ `
uniform vec3 uSolidColor;
void main() {
  vec3 col = litPlant(uSolidColor);
  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_MODELS = [
  { url: '/seaweed.glb', weight: 60, color: '#3f6f52' }, // untextured → solid color
  { url: '/meshn.glb', weight: 30 },
  { url: '/mashroom.glb', weight: 2 },
];

export class Kelp {
  constructor(config, quality, sunDir, rng) {
    const uw = config.underwater;
    this._config = config;
    this._sunDir = sunDir;
    const count = Math.round(uw.kelpCount * quality.underwaterScale * (quality.kelpBoost ?? 1));
    const models = uw.kelpModels ?? DEFAULT_MODELS;
    this._models = models;

    // Cumulative weight thresholds for the model split.
    const weights = models.map((m) => m.weight ?? 1);
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const thresh = [];
    let acc = 0;
    for (const w of weights) { acc += w / totalW; thresh.push(acc); }

    // Draw RNG in the SAME order/amount as the old kelp loop so downstream
    // systems keep their seeded layout. Model choice is a per-index hash (no
    // rng draw), so it doesn't correlate plant type with sway/rotation.
    const instances = [];
    for (let i = 0; i < count; i++) {
      // Model pick first (per-index hash, no rng) so its scale can size the plant.
      const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
      let model = models.length - 1;
      for (let k = 0; k < thresh.length; k++) { if (h < thresh[k]) { model = k; break; } }

      // RNG drawn in the SAME order/amount as the old kelp loop (downstream-safe).
      const z = -uw.restZ - rng() * uw.areaLength;
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (4 + rng() * rng() * uw.areaWidth * 0.45) + (rng() - 0.5) * 6;
      const size = (3.5 + rng() * rng() * 9) * (models[model].scale ?? 1);
      const rot = rng() * Math.PI * 2;
      const phase = rng();

      instances.push({ x, z, size, rot, phase, model });
    }
    this._instances = instances;

    this.mesh = new Group();
    this.mesh.frustumCulled = false;
    this.materials = []; // filled as models load (one per material group)
    this._textures = [];

    this._load(uw);
  }

  async _load(uw) {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(
      this._models.map((m) => this._loadModel(loader, m))
    );

    results.forEach((res, k) => {
      const url = this._models[k].url;
      if (res.status === 'rejected') {
        console.warn(`[OceanIntro] kelp model failed to load: ${url}\n`, res.reason);
        return;
      }
      const groups = res.value;
      if (!groups || !groups.length) {
        console.warn(`[OceanIntro] kelp model has no renderable geometry: ${url}`);
        return;
      }
      const inst = this._instances.filter((o) => o.model === k);
      if (!inst.length) return;

      const attribs = this._instanceAttribs(inst, uw);
      for (const group of groups) {
        const geometry = new InstancedBufferGeometry();
        geometry.attributes.position = group.geometry.attributes.position;
        if (group.geometry.attributes.normal) geometry.attributes.normal = group.geometry.attributes.normal;
        if (group.geometry.attributes.uv) geometry.attributes.uv = group.geometry.attributes.uv;
        geometry.instanceCount = inst.length;
        geometry.setAttribute('aOffset', attribs.aOffset);
        geometry.setAttribute('aScale', attribs.aScale);
        geometry.setAttribute('aRot', attribs.aRot);
        geometry.setAttribute('aPhase', attribs.aPhase);

        const mat = this._makeMaterial(uw, group);
        this.materials.push(mat);
        if (group.texture) this._textures.push(group.texture);

        const mesh = new Mesh(geometry, mat);
        mesh.frustumCulled = false;
        this.mesh.add(mesh);
      }
    });
    this._loaded = true;
  }

  /** Load one plant GLB → array of render groups (one per material). */
  async _loadModel(loader, model) {
    const gltf = await loader.loadAsync(model.url);
    gltf.scene.updateWorldMatrix(true, true);

    // 1) Collect every mesh primitive as world-baked, de-quantized float geo.
    const prims = [];
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) {
        prims.push({ geo: this._prepGeo(o), material: o.material });
      }
    });
    if (!prims.length) return null;

    // 2) Normalize the whole model together: xz-centered, base at y=0, unit
    //    height — so per-instance aScale sets the real height for every part.
    const box = new Box3();
    for (const p of prims) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    const size = new Vector3();
    box.getSize(size);
    const s = 1 / Math.max(size.y, 1e-4);
    const cx = (box.max.x + box.min.x) / 2;
    const cz = (box.max.z + box.min.z) / 2;
    for (const p of prims) {
      p.geo.translate(-cx, -box.min.y, -cz);
      p.geo.scale(s, s, s);
    }

    // 3) Group primitives by material → one instanced draw each.
    const byMat = new Map();
    for (const p of prims) {
      const key = p.material ? p.material.uuid : 'none';
      if (!byMat.has(key)) byMat.set(key, { material: p.material, geos: [] });
      byMat.get(key).geos.push(p.geo);
    }

    const groups = [];
    for (const { material, geos } of byMat.values()) {
      const map = material && material.map ? material.map : null;
      const textured = !!map && geos.every((g) => g.attributes.uv);

      const cleaned = geos.map((g) => {
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && !(textured && name === 'uv')) {
            g.deleteAttribute(name);
          }
        }
        return g;
      });
      let geometry = cleaned.length === 1 ? cleaned[0] : mergeGeometries(cleaned, false);
      if (!geometry) continue;

      if (textured) map.colorSpace = SRGBColorSpace;
      groups.push({
        geometry,
        textured,
        texture: textured ? map : null,
        // three maps glTF alphaMode:MASK → material.alphaTest (>0); OPAQUE → 0.
        alphaTest: material && material.alphaTest ? material.alphaTest : 0.0,
        color: model.color ?? this._config.underwater.colors.kelp,
      });
    }
    return groups;
  }

  /** Clone a mesh's geometry as world-baked Float32 position/normal (+uv), de-quantized. */
  _prepGeo(mesh) {
    const src = mesh.geometry;
    const pos = src.attributes.position;
    const n = pos.count;
    const geo = new BufferGeometry();

    const fp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { fp[i * 3] = pos.getX(i); fp[i * 3 + 1] = pos.getY(i); fp[i * 3 + 2] = pos.getZ(i); }
    geo.setAttribute('position', new Float32BufferAttribute(fp, 3));

    const nrm = src.attributes.normal;
    if (nrm) {
      const fn = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { fn[i * 3] = nrm.getX(i); fn[i * 3 + 1] = nrm.getY(i); fn[i * 3 + 2] = nrm.getZ(i); }
      geo.setAttribute('normal', new Float32BufferAttribute(fn, 3));
    }

    const uv = src.attributes.uv;
    if (uv) {
      const fu = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { fu[i * 2] = uv.getX(i); fu[i * 2 + 1] = uv.getY(i); }
      geo.setAttribute('uv', new Float32BufferAttribute(fu, 2));
    }
    if (src.index) geo.setIndex(src.index.clone());
    geo.applyMatrix4(mesh.matrixWorld); // transforms position AND normal correctly
    if (!geo.attributes.normal) geo.computeVertexNormals();
    return src.index ? geo.toNonIndexed() : geo; // non-indexed → merge-safe
  }

  _instanceAttribs(inst, uw) {
    const n = inst.length;
    const embed = uw.kelpEmbed ?? 0.0;
    const off = new Float32Array(n * 3);
    const sc = new Float32Array(n);
    const ro = new Float32Array(n);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = inst[i];
      off[i * 3] = o.x; off[i * 3 + 1] = embed; off[i * 3 + 2] = o.z;
      sc[i] = o.size; ro[i] = o.rot; ph[i] = o.phase;
    }
    return {
      aOffset: new InstancedBufferAttribute(off, 3),
      aScale: new InstancedBufferAttribute(sc, 1),
      aRot: new InstancedBufferAttribute(ro, 1),
      aPhase: new InstancedBufferAttribute(ph, 1),
    };
  }

  _makeMaterial(uw, group) {
    const frag = (group.textured ? FRAG_TEX : FRAG_SOLID).replace('__FOG__', FOG_CHUNK);
    const uniforms = {
      uTime: { value: 0 },
      uCameraPos: { value: new Vector3() },
      uSway: { value: uw.kelpSway ?? 0.18 },
      uSunDir: { value: this._sunDir.clone() },
      uAmbient: { value: uw.ambient ?? 0.55 },
      uFogColor: { value: linearColor(this._config.palette.fogNearUnderwater) },
      uFogDensity: { value: uw.fogDensity },
      uFloorDepth: { value: uw.floorDepth },
      uDropOffZ: { value: uw.dropOffZ ?? -230 },
      uDropOffDepth: { value: uw.dropOffDepth ?? 90 },
      uDropOffWidth: { value: uw.dropOffWidth ?? 70 },
      uDropOffWaver: { value: uw.dropOffWaver ?? 40 },
    };
    if (group.textured) {
      uniforms.uBaseColorMap = { value: group.texture };
      uniforms.uAlphaTest = { value: group.alphaTest };
    } else {
      uniforms.uSolidColor = { value: linearColor(group.color) };
    }
    return new ShaderMaterial({
      vertexShader: VERT.replace('__NOISE__', NOISE_CHUNK).replace('__TERRAIN__', TERRAIN_CHUNK),
      fragmentShader: frag,
      side: DoubleSide,
      uniforms,
    });
  }

  update(time, cameraPos) {
    for (const m of this.materials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uCameraPos.value.copy(cameraPos);
    }
  }

  dispose() {
    this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    for (const t of this._textures) t.dispose();
  }
}