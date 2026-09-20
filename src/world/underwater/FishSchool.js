import {
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_CHUNK, FOG_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// Fish and sharks both come from GLB models now. Each fish species in
// config.underwater.fishModels gets its OWN instanced mesh — its own texture,
// its own share of the population — so species can differ in look, size and
// behaviour while still costing one draw call apiece.

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aOrbit;    // radius, vertical bob amplitude
attribute vec2 aMotion;   // angular speed (signed), phase
attribute float aScale;
attribute float aHueShift;
attribute float aLightShift;
attribute vec3 aForm;     // place in the wedge: (along, vertical, lateral)
attribute vec3 color;     // per-vertex colour (not auto-declared by ShaderMaterial)

uniform float uTime;

uniform vec3 uPointer;
uniform float uFleeRadius;
uniform float uFleeForce;
uniform float uWagFront;
uniform float uWagBack;
uniform float uHeadingOffset;  // radians, if the model's nose isn't at +X

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vBaseColor;
varying vec2 vUv;
varying float vBelly;
varying float vHueShift;
varying float vLightShift;

void main() {
  float ang = aMotion.y * 6.2831 + uTime * aMotion.x;

  float r = aOrbit.x * (0.85 + 0.15 * sin(uTime * 0.21 + aMotion.y * 9.0));
  vec3 orbitPos = aCenter + vec3(cos(ang) * r, sin(uTime * 0.5 + aMotion.y * 6.2831) * aOrbit.y, sin(ang) * r);

  vec3 away = orbitPos - uPointer;
  float pd = length(away);
  float flee = smoothstep(uFleeRadius, uFleeRadius * 0.2, pd);
  orbitPos += (away / max(pd, 0.001)) * flee * uFleeForce;

  vec3 p = position * aScale;
  float tail = smoothstep(uWagFront, uWagBack, position.x);
  float wag = (6.0 + abs(aMotion.x) * 2.0) * (1.0 + flee * 1.5);
  p.z += sin(uTime * wag + aMotion.y * 20.0 + position.x * 2.2) * tail * 0.28 * aScale * (1.0 + flee * 0.8);

  // Heading. The rotation below points a +X nose along (cos h, sin h) in the
  // XZ plane; the orbit's tangent at angle ang is (-sin ang, cos ang) when
  // travelling forward, so h = ang + PI/2. The previous formula (-ang - PI/2)
  // only matched at isolated angles — which is why SOME fish swam backwards.
  // It went unnoticed with the SVG because that geometry was mirrored by
  // scale(1,-1,1), which flipped the handedness and hid the error.
  float heading = ang + (aMotion.x > 0.0 ? 1.5708 : -1.5708) + uHeadingOffset;
  float c = cos(heading);
  float s = sin(heading);
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);

  // Formation offset, rotated by the SAME heading as the body. Baking the
  // wedge into aCenter instead would leave it locked to the world axes while
  // the school turned — the shape would shear as it came round the orbit.
  orbitPos += vec3(c * aForm.x - s * aForm.z, aForm.y, s * aForm.x + c * aForm.z);

  vNormal = normalize(vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z));
  vBelly = normal.y;
  vBaseColor = color;
  vUv = uv;
  vHueShift = aHueShift;
  vLightShift = aLightShift;
  vWorldPos = orbitPos + p;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

const HSL_CHUNK = /* glsl */ `
vec3 rgb2hsl(vec3 c) {
  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float l = (maxc + minc) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = maxc - minc;
  if (d > 0.0001) {
    s = l > 0.5 ? d / (2.0 - maxc - minc) : d / (maxc + minc);
    if (maxc == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (maxc == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y < 0.0001) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(hue2rgb(p, q, hsl.x + 1.0 / 3.0), hue2rgb(p, q, hsl.x), hue2rgb(p, q, hsl.x - 1.0 / 3.0));
}
`;

const FRAG = /* glsl */ `
${'__NOISE__'}
${'__FOG__'}
${'__HSL__'}
uniform vec3 uCameraPos;
uniform sampler2D uMap;
uniform float uHasMap;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vBaseColor;
varying vec2 vUv;
varying float vBelly;
varying float vHueShift;
varying float vLightShift;

void main() {
  // Base colour comes from the model's baseColorTexture when it has one —
  // which is how most GLB exports carry their colour. Falling back to the
  // material's flat colour (as the SVG path did) renders a textured model
  // pure white, because its baseColorFactor is white by definition.
  vec3 src = vBaseColor;
  if (uHasMap > 0.5) {
    vec4 tex = texture2D(uMap, vUv);
    // ShaderMaterial does no automatic sRGB decode, so do it by hand.
    src = pow(tex.rgb, vec3(2.2)) * vBaseColor;
  }

  vec3 hsl = rgb2hsl(src);
  hsl.x = fract(hsl.x + vHueShift);
  hsl.z = clamp(hsl.z + vLightShift, 0.0, 1.0);
  vec3 species = hsl2rgb(hsl);

  vec3 back = species * 0.45;
  vec3 belly = species * 1.0;
  vec3 col = mix(back, belly, clamp(-vBelly * 0.5 + 0.5, 0.0, 1.0));
  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

// Sharks: unchanged. Slower, no flee, no schooling — wide lazy loops.
const SHARK_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aOrbit;
attribute vec2 aMotion;
attribute float aScale;
attribute float aHueShift;
attribute float aLightShift;
attribute vec3 color;

uniform float uTime;
uniform float uWagFront;
uniform float uWagBack;
uniform float uHeadingOffset;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vBaseColor;
varying vec2 vUv;
varying float vBelly;
varying float vHueShift;
varying float vLightShift;

void main() {
  float ang = aMotion.y * 6.2831 + uTime * aMotion.x;
  float r = aOrbit.x * (0.9 + 0.1 * sin(uTime * 0.09 + aMotion.y * 6.0));
  vec3 orbitPos = aCenter + vec3(cos(ang) * r, sin(uTime * 0.2 + aMotion.y * 6.2831) * aOrbit.y, sin(ang) * r);

  vec3 p = position * aScale;
  float tail = smoothstep(uWagFront, uWagBack, position.x);
    p.z += sin(uTime * 2.2 + aMotion.y * 20.0 + position.x * 1.4) * tail * 0.35 * aScale;

  // Corrected heading, matching the fish. The old formula only worked because
  // the SVG geometry was mirrored by scale(1,-1,1); a GLB is not mirrored, so
  // reusing it would swim half the sharks backwards.
  float heading = ang + (aMotion.x > 0.0 ? 1.5708 : -1.5708) + uHeadingOffset;
  float c = cos(heading);
  float s = sin(heading);
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);

   float roll = sin(uTime * 0.31 + aMotion.y * 5.0) * 0.10;
  p = vec3(p.x, p.y * cos(roll) - p.z * sin(roll), p.y * sin(roll) + p.z * cos(roll));


  vNormal = normalize(vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z));
  vBelly = normal.y;
  vBaseColor = color;
  vUv = uv;
  vHueShift = aHueShift;
  vLightShift = aLightShift;
  vWorldPos = orbitPos + p;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

const SHARK_FRAG = /* glsl */ `
${'__NOISE__'}
${'__FOG__'}
${'__HSL__'}
uniform vec3 uCameraPos;
uniform sampler2D uMap;
uniform float uHasMap;

uniform vec3 uBackColor;
uniform vec3 uBellyColor;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vBaseColor;
varying vec2 vUv;
varying float vBelly;
varying float vHueShift;
varying float vLightShift;

void main() {
  vec3 src = vBaseColor;
  if (uHasMap > 0.5) {
    src = pow(texture2D(uMap, vUv).rgb, vec3(2.2)) * vBaseColor;
  }
  vec3 hsl = rgb2hsl(src);
  hsl.x = fract(hsl.x + vHueShift);
  hsl.z = clamp(hsl.z + vLightShift, 0.0, 1.0);
  vec3 base = hsl2rgb(hsl);

  vec3 tint = mix(uBackColor, uBellyColor, clamp(-vBelly * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = base * tint;
  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

const compile = (src) => src
  .replace(/__NOISE__/g, NOISE_CHUNK)
  .replace('__FOG__', FOG_CHUNK)
  .replace('__HSL__', HSL_CHUNK);

/**
 * Collapse a loaded GLB into one geometry the instanced shader can draw,
 * and hand back its base-colour texture.
 *
 * `uv` is KEPT here, unlike the other attributes — a textured export carries
 * all of its colour there, and dropping it is what renders the model white.
 */
function geometryFromGLB(gltf, targetLength, rotation) {
  const subs = [];
  let map = null;
  let tint = new Color(1, 1, 1);

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    let geo = child.geometry.clone();
    geo.applyMatrix4(child.matrixWorld);
    geo = geo.index ? geo.toNonIndexed() : geo;

    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!map && mat?.map) map = mat.map;
    if (mat?.color) tint = mat.color.clone();

    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'color', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    if (!geo.attributes.color) {
      const c = mat?.color ?? new Color(1, 1, 1);
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
    }
    subs.push(geo);
  });

  if (!subs.length) throw new Error('no meshes in model');
  const geometry = subs.length === 1 ? subs[0] : mergeGeometries(subs, false);
  if (subs.length > 1) subs.forEach((g) => g.dispose());

  // The shader assumes the nose points +X. Most exports face +/-Z.
  if (rotation) {
    geometry.rotateX(rotation[0] ?? 0);
    geometry.rotateY(rotation[1] ?? 0);
    geometry.rotateZ(rotation[2] ?? 0);
  }

  geometry.computeBoundingBox();
  const size = new Vector3();
  geometry.boundingBox.getSize(size);
  geometry.scale(
    targetLength / Math.max(size.x, size.y, size.z),
    targetLength / Math.max(size.x, size.y, size.z),
    targetLength / Math.max(size.x, size.y, size.z),
  );
  geometry.center();
  geometry.computeVertexNormals();
  return { geometry, map, tint };
}

export class FishSchool {
  constructor(config, quality, rng) {
    const uw = config.underwater;
    let total = Math.round(uw.fishCount * quality.underwaterScale);

    this.mesh = new Group();
    this.fishMaterials = [];

    // Species list. Each entry becomes its own instanced mesh and its own
    // child Group, so a species can be shown, hidden or retextured on its own.
    const species = uw.fishModels ?? [
      { url: uw.fishModel ?? '/fish.glb', weight: 1 },
    ];
    const weightSum = species.reduce((n, s) => n + (s.weight ?? 1), 0);

    // ---- Instance data, built synchronously -------------------------------
    // The GLB has to load async, but the LAYOUT must not wait: keeping this
    // here consumes the shared rng in the same order as before, so rocks and
    // kelp still lay out identically for a given seed.
    // Schools travel as UNITS: every member shares one orbit (radius, speed,
    // phase) and differs only by its place in the group. Give each fish its
    // own orbit — as the original did — and no formation can hold, because
    // they all drift apart at different rates.
    //
    // Placement follows the JOURNEY PATH rather than scattering across the
    // whole corridor. The corridor is 160m wide and 800m long; the camera
    // only covers about 40m of that width, so a uniform scatter puts most
    // schools permanently off-screen. Sampling the waypoints keeps every
    // school somewhere the camera actually goes.
    const wps = config.journey?.waypoints ?? [];
    const landZ = uw.sheetAnchorZ ?? -126;
    const atDz = (dz) => {
      if (!wps.length) {
        return [0, -uw.floorDepth + 14, landZ - dz];
      }
      let a = wps[0];
      let b = wps[wps.length - 1];
      for (let k = 0; k < wps.length - 1; k++) {
        if (dz >= wps[k].dz && dz <= wps[k + 1].dz) { a = wps[k]; b = wps[k + 1]; break; }
      }
      const span = Math.max(b.dz - a.dz, 1e-6);
      const t = Math.min(Math.max((dz - a.dz) / span, 0), 1);
      return [
        a.x + (b.x - a.x) * t,
        -(uw.floorDepth - (a.h + (b.h - a.h) * t)),
        landZ - dz,
      ];
    };

    // Group sizes cycle through a set list, so you get a genuine mix rather
    // than every school landing on the same average.
    const sizeMix = uw.fishGroupSizes ?? [8, 16, 22, 10, 18, 7, 14];
    const clusterCount = uw.fishClusters ?? 10;
    const dzFrom = uw.fishFromDz ?? 10;
    const dzTo = uw.fishToDz ?? (wps.length ? wps[wps.length - 1].dz : 600);
    const sideMin = uw.fishSideMin ?? 5;
    const sideMax = uw.fishSideMax ?? 22;
    const speedSlow = uw.fishSpeedSlow ?? 0.05;
    const speedFast = uw.fishSpeedFast ?? 0.40;

    const clusters = [];
    for (let s = 0; s < clusterCount; s++) {
      // Even spacing along the journey, jittered — so schools appear steadily
      // from the moment you arrive through to the end, not clumped.
      const t = (s + 0.15 + rng() * 0.7) / clusterCount;
      const dz = dzFrom + (dzTo - dzFrom) * t;
      const base = atDz(dz);
      // Off to one side of the path, alternating, at a distance that keeps
      // them in frame rather than on top of the camera or lost in fog.
      const side = (s % 2 === 0 ? 1 : -1) * (sideMin + rng() * (sideMax - sideMin));
      // One species per school. Picking per-FISH mixed two models inside a
      // single group, which no real shoal does.
      let spick = rng() * weightSum;
      let sspecies = 0;
      for (; sspecies < species.length - 1; sspecies++) {
        spick -= species[sspecies].weight ?? 1;
        if (spick <= 0) break;
      }
      clusters.push({
        species: sspecies,
        pos: [base[0] + side, base[1] + (rng() - 0.5) * 25, base[2] + (rng() - 0.5) * 30],
        orbit: [8 + rng() * 16, 0.6 + rng() * 1.6],
        // Speed spread is wide and deliberate: some schools cruise, some dart.
        motion: [
          (rng() < 0.5 ? -1 : 1) * (speedSlow + rng() * (speedFast - speedSlow)),
          rng(),
        ],
        size: sizeMix[s % sizeMix.length],
        n: 0,
      });
    }
    // Fish are handed out in order so each school gets exactly its size.
    const clusterOrder = [];
    for (let s = 0; s < clusters.length; s++) {
      for (let k = 0; k < clusters[s].size; k++) clusterOrder.push(s);
    }

    // The count now DERIVES from the schools rather than capping them. With a
    // fixed fishCount, any shortfall silently starved the LAST schools in the
    // list — which are the ones furthest along the journey, so the back half
    // of the swim came out empty with no obvious cause.
    const needed = clusterOrder.length;
    if (needed > total) total = needed;

    // One bucket of instance data per species.
    const buckets = species.map(() => ({
      centers: [], orbits: [], motions: [], scales: [], hue: [], light: [], form: [],
    }));
    // Formation shape. 'cloud' is a loose blob — the members share one
    // heading and one orbit so they travel as a unit, but their places inside
    // the group are scattered. 'wedge' is the rigid triangle; real shoals
    // almost never hold one, and it reads as geometry rather than as fish.
    const fm = uw.fishFormation ?? {};
    const shape = fm.shape ?? 'cloud';
    const cloudW = fm.width ?? 4.5;       // across the direction of travel
    const cloudH = fm.height ?? 2.6;      // vertical
    const cloudD = fm.depth ?? 5.0;       // front to back
    const cloudBias = fm.bias ?? 0.7;     // <1 packs toward the centre
    const rowGap = fm.rowGap ?? 1.8;      // wedge only
    const colGap = fm.colGap ?? 1.5;      // wedge only
    const formJitter = fm.jitter ?? 0.35;
    let formIndex = 0;

    for (let i = 0; i < total; i++) {
      // Species comes from the SCHOOL, so a group is never half one model
      // and half the other.
      const si = clusters[clusterOrder[formIndex % clusterOrder.length]].species;
      const bk = buckets[si];

      const sc = clusters[clusterOrder[formIndex % clusterOrder.length]];
      formIndex++;
      const m = sc.n++;
      if (shape === 'wedge') {
        // Triangular wedge. Row r holds r+1 fish, so slot m sits in the row
        // where the triangular numbers cross it — that inverse is the sqrt.
        const r = Math.floor((Math.sqrt(8 * m + 1) - 1) / 2);
        const col = m - (r * (r + 1)) / 2;
        bk.form.push(
          -r * rowGap + (rng() - 0.5) * formJitter,
          (rng() - 0.5) * formJitter * 2,
          (col - r * 0.5) * colGap + (rng() - 0.5) * formJitter,
        );
      } else {
        // Cloud. A signed pow() keeps the density higher in the middle and
        // thins it at the edges, so the group has a core instead of ending
        // on a hard box — that soft boundary is most of what makes a blob
        // of fish read as one shoal rather than as scattered individuals.
        const sp = (v, ext) => {
          const t = v * 2 - 1;
          return Math.sign(t) * Math.pow(Math.abs(t), 1 / cloudBias) * ext * 0.5;
        };
        bk.form.push(sp(rng(), cloudD), sp(rng(), cloudH), sp(rng(), cloudW));
      }
      bk.centers.push(sc.pos[0], sc.pos[1], sc.pos[2]);
      bk.orbits.push(sc.orbit[0], sc.orbit[1]);
      bk.motions.push(sc.motion[0], sc.motion[1]);
      bk.scales.push(0.35 + rng() * 0.45);
      const family = rng() < 0.6 ? 0.0 : 0.09;
      bk.hue.push(family + (rng() - 0.5) * 0.05);
      bk.light.push((rng() - 0.5) * 0.12);
    }

    // ---- One instanced mesh per species, built as each model arrives ------
    species.forEach((spec, si) => {
      const bk = buckets[si];
      const n = bk.scales.length;
      if (!n) return;

      const material = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: compile(FRAG),
        uniforms: {
          uTime: { value: 0 },
          uCameraPos: { value: new Vector3() },
          uPointer: { value: new Vector3(0, -9999, 0) },
          uFleeRadius: { value: uw.fleeRadius },
          uFleeForce: { value: uw.fleeForce },
          uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
          uFogDensity: { value: uw.fogDensity },
          uMap: { value: null },
          uHasMap: { value: 0 },
          // Tail-wag zone, in model units. Wrong values ripple the HEAD.
          uWagFront: { value: spec.wagFront ?? uw.fishWagFront ?? 0.9 },
          uWagBack: { value: spec.wagBack ?? uw.fishWagBack ?? -1.4 },
          uHeadingOffset: { value: spec.headingOffset ?? 0 },
        },
      });
      this.fishMaterials.push(material);
      this.materials = [...this.fishMaterials, this.sharkMaterial].filter(Boolean);

      const group = new Group();
      group.name = spec.name ?? `fish-${si}`;
      this.mesh.add(group);

      const url = spec.url ?? '/fish.glb';
      new GLTFLoader().load(
        url,
        (gltf) => {
          let built;
          try {
            built = geometryFromGLB(
              gltf,
              spec.size ?? uw.fishModelSize ?? 3,
              spec.rotation ?? uw.fishModelRotation,
            );
          } catch (err) {
            console.warn('[OceanIntro] fish model unusable:', url, err);
            return;
          }

          if (built.map) {
            material.uniforms.uMap.value = built.map;
            material.uniforms.uHasMap.value = 1;
          }

          const g = new InstancedBufferGeometry();
          g.index = built.geometry.index;
          g.attributes.position = built.geometry.attributes.position;
          g.attributes.normal = built.geometry.attributes.normal;
          g.attributes.color = built.geometry.attributes.color;
          g.attributes.uv = built.geometry.attributes.uv;
          g.instanceCount = n;
          g.setAttribute('aCenter', new InstancedBufferAttribute(new Float32Array(bk.centers), 3));
          g.setAttribute('aOrbit', new InstancedBufferAttribute(new Float32Array(bk.orbits), 2));
          g.setAttribute('aMotion', new InstancedBufferAttribute(new Float32Array(bk.motions), 2));
          g.setAttribute('aScale', new InstancedBufferAttribute(new Float32Array(bk.scales), 1));
          g.setAttribute('aHueShift', new InstancedBufferAttribute(new Float32Array(bk.hue), 1));
          g.setAttribute('aLightShift', new InstancedBufferAttribute(new Float32Array(bk.light), 1));
          g.setAttribute('aForm', new InstancedBufferAttribute(new Float32Array(bk.form), 3));

          const m = new Mesh(g, material);
          m.frustumCulled = false;
          group.add(m);
        },
        undefined,
        (err) => console.warn('[OceanIntro] fish model failed to load:', url, err),
      );
    });

    // ---- Sharks (still SVG) ----------------------------------------------
    const sharkCount = uw.sharkCount ?? 0;

    if (sharkCount > 0) {
      // Instance data first, synchronously — same reasoning as the fish: the
      // GLB is async but the layout must not be, or the shared rng falls out
      // of order and every other seeded system shifts.
      const sCenters = new Float32Array(sharkCount * 3);
      const sOrbits = new Float32Array(sharkCount * 2);
      const sMotions = new Float32Array(sharkCount * 2);
      const sScales = new Float32Array(sharkCount);
      const sHueShifts = new Float32Array(sharkCount);
      const sLightShifts = new Float32Array(sharkCount);
      for (let k = 0; k < sharkCount; k++) {
        sCenters.set([
          (rng() - 0.5) * uw.areaWidth * 0.6,
          -uw.floorDepth + 18 + rng() * 14,
          -uw.restZ - 40 - rng() * (uw.areaLength - 60),
        ], k * 3);
        sOrbits.set([16 + rng() * 18, 1.2 + rng() * 1.2], k * 2);
        sMotions.set([(rng() < 0.5 ? -1 : 1) * (0.05 + rng() * 0.05), rng()], k * 2);
        sScales[k] = 0.85 + rng() * 0.35;
        sHueShifts[k] = (rng() - 0.5) * 0.04;
        sLightShifts[k] = -0.05 + (rng() - 0.5) * 0.05;
      }

      this.sharkMaterial = new ShaderMaterial({
        vertexShader: SHARK_VERT,
        fragmentShader: compile(SHARK_FRAG),
         uniforms: {
          uTime: { value: 0 },
          uCameraPos: { value: new Vector3() },
          uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
          uFogDensity: { value: uw.fogDensity },
          uMap: { value: null },
          uHasMap: { value: 0 },
          uBackColor: { value: linearColor(uw.colors.sharkBack ?? '#3d5a72') },
          uBellyColor: { value: linearColor(uw.colors.sharkBelly ?? '#e8f1f4') },
          uWagFront: { value: uw.sharkWagFront ?? 2.7 },
          uWagBack: { value: uw.sharkWagBack ?? -4.2 },
          uHeadingOffset: { value: uw.sharkHeadingOffset ?? 0 },
        },
      });

      const sharkUrl = uw.sharkModel ?? '/shark.glb';
      new GLTFLoader().load(
        sharkUrl,
        (gltf) => {
          let built;
          try {
            built = geometryFromGLB(gltf, uw.sharkModelSize ?? 9, uw.sharkModelRotation);
          } catch (err) {
            console.warn('[OceanIntro] shark model unusable:', sharkUrl, err);
            return;
          }
          if (built.map) {
            this.sharkMaterial.uniforms.uMap.value = built.map;
            this.sharkMaterial.uniforms.uHasMap.value = 1;
          }

          const sharkGeometry = new InstancedBufferGeometry();
          sharkGeometry.index = built.geometry.index;
          sharkGeometry.attributes.position = built.geometry.attributes.position;
          sharkGeometry.attributes.normal = built.geometry.attributes.normal;
          sharkGeometry.attributes.color = built.geometry.attributes.color;
          sharkGeometry.attributes.uv = built.geometry.attributes.uv;
          sharkGeometry.instanceCount = sharkCount;
          sharkGeometry.setAttribute('aCenter', new InstancedBufferAttribute(sCenters, 3));
          sharkGeometry.setAttribute('aOrbit', new InstancedBufferAttribute(sOrbits, 2));
          sharkGeometry.setAttribute('aMotion', new InstancedBufferAttribute(sMotions, 2));
          sharkGeometry.setAttribute('aScale', new InstancedBufferAttribute(sScales, 1));
          sharkGeometry.setAttribute('aHueShift', new InstancedBufferAttribute(sHueShifts, 1));
          sharkGeometry.setAttribute('aLightShift', new InstancedBufferAttribute(sLightShifts, 1));

          const sharkMesh = new Mesh(sharkGeometry, this.sharkMaterial);
          sharkMesh.frustumCulled = false;
          this.mesh.add(sharkMesh);
        },
        undefined,
        (err) => console.warn('[OceanIntro] shark model failed to load:', sharkUrl, err),
      );
    }

    // Generic access for code outside this file that needs every shader's
    // uniforms (e.g. UnderwaterWorld.setDepth adjusting fog) without knowing
    // how many materials FishSchool happens to have.
    this.materials = [...this.fishMaterials, this.sharkMaterial].filter(Boolean);
  }

  update(time, cameraPos, pointerWorld) {
    for (const m of this.fishMaterials) {
      m.uniforms.uTime.value = time;
      m.uniforms.uCameraPos.value.copy(cameraPos);
      if (pointerWorld) m.uniforms.uPointer.value.copy(pointerWorld);
    }
    if (this.sharkMaterial) {
      this.sharkMaterial.uniforms.uTime.value = time;
      this.sharkMaterial.uniforms.uCameraPos.value.copy(cameraPos);
      // Sharks don't flee the pointer — no uPointer uniform on this material.
    }
  }

  dispose() {
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    for (const m of this.fishMaterials) {
      m.uniforms.uMap.value?.dispose();
      m.dispose();
    }
    if (this.sharkMaterial) this.sharkMaterial.dispose();
  }
}