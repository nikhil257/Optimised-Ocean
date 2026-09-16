// import {
//   DoubleSide,
//   Mesh,
//   PlaneGeometry,
//   ShaderMaterial,
//   Vector3,
//   Vector4,
// } from 'three';
// import { SKY_CHUNK } from '../shared/skyChunk.js';
// import { linearColor } from '../../utils/math.js';

// // ---------------------------------------------------------------------------
// // Vertex: 4-wave Gerstner stack with analytic tangent/binormal accumulation
// // (Catlike-Coding formulation) and distance-based amplitude falloff so far
// // water flattens instead of aliasing. The grid follows the camera, snapped to
// // cell size to avoid vertex swimming.
// // ---------------------------------------------------------------------------
// const VERT = /* glsl */ `
// uniform float uTime;
// uniform vec4 uWaves[4];      // dirX, dirZ, steepness, wavelength
// uniform vec3 uCameraPos;

// varying vec3 vWorldPos;
// varying vec3 vNormal;
// varying float vCrest;

// vec3 gerstner(vec4 w, vec3 p, float t, inout vec3 tangent, inout vec3 binormal, float atten) {
//   float k = 6.2831853 / w.w;
//   float c = sqrt(9.8 / k);
//   vec2 d = normalize(w.xy);
//   float f = k * (dot(d, p.xz) - c * t);
//   float steep = w.z * atten;
//   float a = steep / k;

//   float sinf = sin(f);
//   float cosf = cos(f);

//   tangent += vec3(-d.x * d.x * steep * sinf, d.x * steep * cosf, -d.x * d.y * steep * sinf);
//   binormal += vec3(-d.x * d.y * steep * sinf, d.y * steep * cosf, -d.y * d.y * steep * sinf);
//   return vec3(d.x * a * cosf, a * sinf, d.y * a * cosf);
// }



// void main() {
//   vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;

//   float dist = distance(worldBase.xz, uCameraPos.xz);
//   float atten = smoothstep(1200.0, 120.0, dist); // fade waves toward horizon

//   vec3 tangent = vec3(1.0, 0.0, 0.0);
//   vec3 binormal = vec3(0.0, 0.0, 1.0);
//   vec3 p = worldBase;
//   vec3 offset = vec3(0.0);
//   for (int i = 0; i < 4; i++) {
//     offset += gerstner(uWaves[i], p, uTime, tangent, binormal, atten);
//   }
//   p += offset;

//   vWorldPos = p;
//   vNormal = normalize(cross(binormal, tangent));
//   // Normalized crest height for the subsurface-scatter tint.
//   // vCrest = clamp(offset.y * 1.6, 0.0, 1.0);
//   vCrest = smoothstep(-0.05, 0.62, offset.y);

//   gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
// }
// `;

// // ---------------------------------------------------------------------------
// // Fragment: the custom water response. Components, in order of visual weight:
// //  1. Fresnel-blended sky reflection (shared analytic sky → always matches)
// //  2. Fake subsurface scatter on backlit crests — makes water read translucent
// //  3. Cold-white sun glitter (high-exponent spec × sparkle noise)
// //  4. Depth base color + horizon fog into the sky
// //  5. Procedural detail normals (two scrolling noise octaves — no textures)
// // ---------------------------------------------------------------------------
// const FRAG = /* glsl */ `
// uniform float uTime;
// uniform vec3 uCameraPos;
// uniform vec3 uSunDir;
// uniform vec3 uZenith;
// uniform vec3 uHorizon;
// uniform vec3 uSunTint;
// uniform vec3 uWaterBase;
// uniform vec3 uScatterColor;
// uniform float uDetailStrength;
// uniform float uScatterStrength;
// uniform float uGlitterStrength;

// uniform vec3 uUnderNear;
// uniform vec3 uUnderDeep;

// varying vec3 vWorldPos;
// varying vec3 vNormal;
// varying float vCrest;

// ${'__SKY__'}

// float hash(vec2 p) {
//   return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
// }

// float vnoise(vec2 p) {
//   vec2 i = floor(p);
//   vec2 f = fract(p);
//   vec2 u = f * f * (3.0 - 2.0 * f);
//   return mix(
//     mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
//     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
//     u.y
//   );
// }

// void main() {
//   vec3 V = normalize(uCameraPos - vWorldPos);
//   float dist = distance(uCameraPos.xz, vWorldPos.xz);

//   // --- detail normal perturbation (fades with distance to avoid shimmer)
//   float detailFade = smoothstep(700.0, 60.0, dist);
//   vec2 uv = vWorldPos.xz;
//   float n1 = vnoise(uv * 0.55 + vec2(uTime * 0.06, uTime * 0.045));
//   float n2 = vnoise(uv * 1.9 - vec2(uTime * 0.085, uTime * 0.06));
//   vec3 N = normalize(vNormal + vec3(n1 - 0.5, 0.0, n2 - 0.5) * uDetailStrength * detailFade);

//   // ==== UNDERSIDE: the surface seen from below (dive + underwater phases) ====
//   if (!gl_FrontFacing) {
//     vec3 E = normalize(vWorldPos - uCameraPos); // view ray, E.y > 0 = looking up

//     // Snell window: sky is visible only through a cone overhead; outside it,
//     // total internal reflection returns the water column's own color.
//     float window = smoothstep(0.35, 0.78, E.y);
//     vec3 through = skyColor(normalize(vec3(E.x, max(E.y, 0.06) * 1.5, E.z)),
//                             uSunDir, uZenith, uHorizon, uSunTint);
//     through *= vec3(0.72, 0.88, 0.95); // absorption tint on transmitted light

//     vec3 col = mix(uUnderDeep * 1.15, through, window);

//     // Wave-driven shimmer: the surface texture read from beneath.
//     col += uScatterColor * ((n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.3) * (0.4 + window);
//     col += uSunTint * pow(max(dot(N, normalize(vec3(uSunDir.x, 1.0, uSunDir.z))), 0.0), 30.0) * window * 0.35;

//     // Water-column fog toward the camera.
//     float ufog = smoothstep(18.0, 150.0, length(vWorldPos - uCameraPos));
//     col = mix(col, uUnderNear, ufog * 0.85);

//     gl_FragColor = vec4(col, 1.0);
//     return;
//   }
//   // ==== TOPSIDE (unchanged) ====

//   // --- fresnel
//   float NdotV = clamp(dot(N, V), 0.0, 1.0);
//   float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

//   // --- sky reflection
//   vec3 R = reflect(-V, N);
//   R.y = abs(R.y) * 0.96 + 0.02; // keep reflections above horizon
//   vec3 reflection = skyColor(normalize(R), uSunDir, uZenith, uHorizon, uSunTint);

//   // --- water body: base + crest scatter (the translucency trick)
//   float towardSun = pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 3.0);
//   vec3 body = uWaterBase + uScatterColor * (vCrest * towardSun * uScatterStrength);

//   vec3 col = mix(body, reflection, fresnel);

//   // --- sun glitter: tight spec lobe broken up by sparkle noise
//   vec3 H = normalize(V + uSunDir);
//   float spec = pow(max(dot(N, H), 0.0), 340.0);
//   float sparkle = smoothstep(0.55, 1.0, vnoise(uv * 5.0 + uTime * 0.35));
//   col += uSunTint * spec * sparkle * uGlitterStrength * 3.0;

//   // --- horizon fog: dissolve into the sky at distance
//   vec3 horizonCol = skyColor(normalize(vec3(V.x, 0.02, V.z) * -1.0), uSunDir, uZenith, uHorizon, uSunTint);
//   float fog = smoothstep(280.0, 1600.0, dist);
//   col = mix(col, horizonCol, fog);

//   gl_FragColor = vec4(col, 1.0);
// }
// `;

// export class OceanSurface {
//   constructor(config, quality, sunDir) {
//     const { palette, ocean } = config;

//     const geometry = new PlaneGeometry(
//       ocean.size,
//       ocean.size,
//       quality.oceanSegments,
//       quality.oceanSegments
//     );
//     geometry.rotateX(-Math.PI / 2);

//     this.cellSize = ocean.size / quality.oceanSegments;

//     this.material = new ShaderMaterial({
//       vertexShader: VERT,
//       fragmentShader: FRAG.replace('__SKY__', SKY_CHUNK),
//       side: DoubleSide, // underside is rendered during the dive / underwater
//       uniforms: {
//         uTime: { value: 0 },
//         uWaves: { value: ocean.waves.map((w) => new Vector4(w[0], w[1], w[2], w[3])) },
//         uCameraPos: { value: new Vector3() },
//         uSunDir: { value: sunDir.clone() },
//         uZenith: { value: linearColor(palette.skyZenith) },
//         uHorizon: { value: linearColor(palette.skyHorizon) },
//         uSunTint: { value: linearColor(palette.sunTint) },
//         uWaterBase: { value: linearColor(palette.waterBase) },
//         uScatterColor: { value: linearColor(palette.waterScatter) },
//         uDetailStrength: { value: ocean.detailStrength },
//         uScatterStrength: { value: ocean.scatterStrength },
//         uGlitterStrength: { value: ocean.glitterStrength },
//         uUnderNear: { value: linearColor(palette.fogNearUnderwater) },
//         uUnderDeep: { value: linearColor(palette.deepFog) },
//       },
//     });

//     this.mesh = new Mesh(geometry, this.material);
//     this.mesh.frustumCulled = false; // the grid always fills the view
//   }

//   update(time, cameraPosition) {
//     const u = this.material.uniforms;
//     u.uTime.value = time;
//     u.uCameraPos.value.copy(cameraPosition);

//     // Follow the camera, snapped to grid cells so vertices don't swim.
//     this.mesh.position.x = Math.round(cameraPosition.x / this.cellSize) * this.cellSize;
//     this.mesh.position.z = Math.round(cameraPosition.z / this.cellSize) * this.cellSize;
//   }

//   /** Reduced-motion accessibility: calm the sea. */
//   setMotionScale(scale) {
//     const waves = this.material.uniforms.uWaves.value;
//     for (const w of waves) w.z *= scale;
//   }

//   dispose() {
//     this.mesh.geometry.dispose();
//     this.material.dispose();
//   }
// }


import {
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { SKY_CHUNK } from '../shared/skyChunk.js';
import { linearColor } from '../../utils/math.js';

// ---------------------------------------------------------------------------
// Vertex: 4-wave Gerstner stack with analytic tangent/binormal accumulation
// (Catlike-Coding formulation) and distance-based amplitude falloff so far
// water flattens instead of aliasing. The grid follows the camera, snapped to
// cell size to avoid vertex swimming.
// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[4];      // dirX, dirZ, steepness, wavelength
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec3 vNormal;

vec3 gerstner(vec4 w, vec3 p, float t, inout vec3 tangent, inout vec3 binormal, float atten) {
  float k = 6.2831853 / w.w;
  float c = sqrt(22.8 / k);
  vec2 d = normalize(w.xy);
  float f = k * (dot(d, p.xz) - c * t);
  float steep = w.z * atten;
  float a = steep / k;

  float sinf = sin(f);
  float cosf = cos(f);

  tangent += vec3(-d.x * d.x * steep * sinf, d.x * steep * cosf, -d.x * d.y * steep * sinf);
  binormal += vec3(-d.x * d.y * steep * sinf, d.y * steep * cosf, -d.y * d.y * steep * sinf);
  return vec3(d.x * a * cosf, a * sinf, d.y * a * cosf);
}

void main() {
  vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;

  float dist = distance(worldBase.xz, uCameraPos.xz);
  float atten = smoothstep(1200.0, 120.0, dist); // fade waves toward horizon

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 p = worldBase;
  vec3 offset = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    offset += gerstner(uWaves[i], p, uTime, tangent, binormal, atten);
  }
  p += offset;

  vWorldPos = p;
  vNormal = normalize(cross(binormal, tangent));

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Fragment: the custom water response. Components, in order of visual weight:
//  1. Fresnel-blended sky reflection (shared analytic sky → always matches)
//  2. Fake subsurface scatter on backlit crests — makes water read translucent
//  3. Cold-white sun glitter (high-exponent spec × sparkle noise)
//  4. Depth base color + horizon fog into the sky
//  5. Procedural detail normals (two scrolling noise octaves — no textures)
// ---------------------------------------------------------------------------
const FRAG = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[4];      // dirX, dirZ, steepness, wavelength — same stack as the vertex shader
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;
uniform vec3 uWaterBase;
uniform vec3 uScatterColor;
uniform float uDetailStrength;
uniform float uScatterStrength;
uniform float uGlitterStrength;

uniform vec3 uUnderNear;
uniform vec3 uUnderDeep;
uniform float uUnderFogFar;
uniform float uCausticScale;
uniform float uCausticSpeed;
uniform float uCausticStrength;
uniform float uCausticFadeStart;
uniform float uCausticFadeEnd;

varying vec3 vWorldPos;
varying vec3 vNormal;

${'__SKY__'}

// Height-only Gerstner sum (no tangent/binormal — this just needs the y
// displacement), evaluated PER PIXEL instead of per vertex. The old version
// computed crest height once per vertex and let it interpolate linearly
// across each mesh triangle — on the coarse ocean grid that made the crest
// highlight bloom out as a soft square/diamond blob shaped like the
// underlying quad instead of following the actual wave surface. This
// recomputes it at full pixel resolution so it hugs the real wave shape.
float waveHeight(vec2 xz, float t, float atten) {
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.w;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(w.xy);
    float f = k * (dot(d, xz) - c * t);
    float steep = w.z * atten;
    float a = steep / k;
    h += a * sin(f);
  }
  return h;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Interlocking caustic cells — the lattice you see looking UP at a wave
// surface from just beneath it. Two counter-drifting Worley-ish layers made
// from ridged noise; multiplying them is what produces the closed cell walls
// rather than plain blobs.
float causticCells(vec2 p, float t) {
  float a = 1.0 - abs(vnoise(p * 0.85 + vec2(t * 0.05, -t * 0.037)) * 2.0 - 1.0);
  float b = 1.0 - abs(vnoise(p * 1.35 - vec2(t * 0.031, t * 0.058)) * 2.0 - 1.0);
  float c = 1.0 - abs(vnoise(p * 2.6 + vec2(-t * 0.07, t * 0.045)) * 2.0 - 1.0);
  float cells = pow(a * b, 2.2) + pow(c, 3.5) * 0.35;
  return clamp(cells, 0.0, 1.5);
}

void main() {
  vec3 V = normalize(uCameraPos - vWorldPos);
  float dist = distance(uCameraPos.xz, vWorldPos.xz);

  // --- detail normal perturbation (fades with distance to avoid shimmer)
  float detailFade = smoothstep(700.0, 60.0, dist);
  vec2 uv = vWorldPos.xz;
  float n1 = vnoise(uv * 0.55 + vec2(uTime * 0.06, uTime * 0.045));
  float n2 = vnoise(uv * 1.9 - vec2(uTime * 0.085, uTime * 0.06));
  vec3 N = normalize(vNormal + vec3(n1 - 0.5, 0.0, n2 - 0.5) * uDetailStrength * detailFade);

  // ==== UNDERSIDE: the surface seen from below (dive + underwater phases) ====
  if (!gl_FrontFacing) {
    vec3 E = normalize(vWorldPos - uCameraPos); // view ray, E.y > 0 = looking up

    // Snell window: sky is visible only through a cone overhead; outside it,
    // total internal reflection returns the water column's own color.
    float window = smoothstep(0.05, 0.85, E.y);
    vec3 through = skyColor(normalize(vec3(E.x, max(E.y, 0.06) * 1.5, E.z)),
                            uSunDir, uZenith, uHorizon, uSunTint);
    through *= vec3(0.85, 0.95, 1.0); // absorption tint on transmitted light

    vec3 col = mix(uUnderDeep * 1.15, through, window);

    // Wave-driven shimmer: the surface texture read from beneath.
    col += uScatterColor * ((n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.3) * (0.4 + window);
    col += uSunTint * pow(max(dot(N, normalize(vec3(uSunDir.x, 1.0, uSunDir.z))), 0.0), 30.0) * window * 0.35;

    // CAUSTIC CELLS. Faded by DEPTH, not by distance: strong just beneath the
    // surface where the dive rests, gone by the time the journey is at the
    // seabed — which is both what real water does and what was asked for.
    float depth = max(-uCameraPos.y, 0.0);
    float depthFade = 1.0 - smoothstep(uCausticFadeStart, uCausticFadeEnd, depth);
    if (depthFade > 0.001) {
      // Sample in the surface's own plane so the pattern sits ON the water
      // rather than sliding with the view.
      float cells = causticCells(vWorldPos.xz * uCausticScale, uTime * uCausticSpeed);
      // Grazing angles compress the cells to nothing; weight toward overhead.
      float up = smoothstep(0.02, 0.5, E.y);
      col += uSunTint * cells * uCausticStrength * depthFade * (0.25 + up * 0.75);
    }

    // Water-column fog toward the camera. uUnderFogFar was hardcoded at 45m,
    // which fully melted the ceiling at any real dive depth — the texture
    // above could never be seen no matter how strong it was.
    float ufog = smoothstep(0.0, uUnderFogFar, length(vWorldPos - uCameraPos));
    col = mix(col, uUnderNear, ufog);

    gl_FragColor = vec4(col, 1.0);
    return;
  }
  // ==== TOPSIDE (unchanged) ====

  // --- fresnel
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

  // --- sky reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.96 + 0.02; // keep reflections above horizon
  vec3 reflection = skyColor(normalize(R), uSunDir, uZenith, uHorizon, uSunTint);

  // --- water body: base + crest scatter (the translucency trick)
  // Ambient fill: a touch of horizon-sky color blended into the base, so
  // troughs (vCrest ≈ 0, away from the sun) pick up ambient light instead of
  // rendering as flat, pure uWaterBase — that flatness was reading as
  // overly black "shadows" with no lighting variation at all.
  vec3 ambientBase = mix(uWaterBase, uHorizon, 0.5);
  float waveAtten = smoothstep(1200.0, 120.0, dist); // matches the vertex shader's falloff
  float h = waveHeight(vWorldPos.xz, uTime, waveAtten);
  float vCrest = smoothstep(-0.3, 0.9, h);
  float towardSun = pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 3.0);
  vec3 body = ambientBase + uScatterColor * (vCrest * towardSun * uScatterStrength);

  vec3 col = mix(body, reflection, fresnel);

  // --- sun glitter: tight spec lobe broken up by sparkle noise
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 340.0);
  float sparkle = smoothstep(0.5, 1.0, vnoise(uv * 5.0 + uTime * 0.35));
  col += uSunTint * spec * sparkle * uGlitterStrength * 3.0;

  // --- horizon fog: dissolve into the sky at distance
  vec3 horizonCol = skyColor(normalize(vec3(V.x, 0.02, V.z) * -1.0), uSunDir, uZenith, uHorizon, uSunTint);
  float fog = smoothstep(280.0, 1600.0, dist);
  col = mix(col, horizonCol, fog);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class OceanSurface {
  constructor(config, quality, sunDir) {
    const { palette, ocean } = config;

    const geometry = new PlaneGeometry(
      ocean.size,
      ocean.size,
      quality.oceanSegments,
      quality.oceanSegments
    );
    geometry.rotateX(-Math.PI / 2);

    this.cellSize = ocean.size / quality.oceanSegments;

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG.replace('__SKY__', SKY_CHUNK),
      side: DoubleSide, // underside is rendered during the dive / underwater
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: ocean.waves.map((w) => new Vector4(w[0], w[1], w[2], w[3])) },
        uCameraPos: { value: new Vector3() },
        uSunDir: { value: sunDir.clone() },
        uZenith: { value: linearColor(palette.skyZenith) },
        uHorizon: { value: linearColor(palette.skyHorizon) },
        uSunTint: { value: linearColor(palette.sunTint) },
        uWaterBase: { value: linearColor(palette.waterBase) },
        uScatterColor: { value: linearColor(palette.waterScatter) },
        uDetailStrength: { value: ocean.detailStrength },
        uScatterStrength: { value: ocean.scatterStrength },
        uGlitterStrength: { value: ocean.glitterStrength },
        uUnderNear: { value: linearColor(palette.fogNearUnderwater) },
        uUnderFogFar: { value: ocean.underFogFar ?? 220 },
        uCausticScale: { value: ocean.underCausticScale ?? 0.05 },
        uCausticSpeed: { value: ocean.underCausticSpeed ?? 4 },
        uCausticStrength: { value: ocean.underCausticStrength ?? 0.5 },
        uCausticFadeStart: { value: ocean.underCausticFadeStart ?? 45 },
        uCausticFadeEnd: { value: ocean.underCausticFadeEnd ?? 95 },
        uUnderDeep: { value: linearColor(palette.deepFog) },
      },
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; // the grid always fills the view
  }

  update(time, cameraPosition) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCameraPos.value.copy(cameraPosition);

    // Follow the camera, snapped to grid cells so vertices don't swim.
    this.mesh.position.x = Math.round(cameraPosition.x / this.cellSize) * this.cellSize;
    this.mesh.position.z = Math.round(cameraPosition.z / this.cellSize) * this.cellSize;
  }

  /** Reduced-motion accessibility: calm the sea. */
  setMotionScale(scale) {
    const waves = this.material.uniforms.uWaves.value;
    for (const w of waves) w.z *= scale;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}