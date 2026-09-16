// import { Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
// import { NOISE_CHUNK, FOG_CHUNK, CAUSTIC_CHUNK } from './chunks.js';
// import { linearColor } from '../../utils/math.js';

// const VERT = /* glsl */ `
// ${'__NOISE__'}
// varying vec3 vWorldPos;
// varying vec3 vNormal;

// float dunes(vec2 p) {
//   return uwNoise(p * 0.018) * 3.2 + uwNoise(p * 0.07) * 0.9 + uwNoise(p * 0.22) * 0.22;
// }

// void main() {
//   vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
//   float h = dunes(wp.xz);
//   wp.y += h;

//   // Normal from finite differences of the height field (vertex-only cost).
//   float e = 1.4;
//   float hx = dunes(wp.xz + vec2(e, 0.0)) - dunes(wp.xz - vec2(e, 0.0));
//   float hz = dunes(wp.xz + vec2(0.0, e)) - dunes(wp.xz - vec2(0.0, e));
//   vNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

//   vWorldPos = wp;
//   gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
// }
// `;

// const FRAG = /* glsl */ `
// ${'__NOISE__'}
// ${'__FOG__'}
// ${'__CAUSTIC__'}
// uniform float uTime;
// uniform vec3 uCameraPos;
// uniform vec3 uSandColor;
// uniform vec3 uCausticColor;
// uniform vec3 uSunDir;

// varying vec3 vWorldPos;
// varying vec3 vNormal;

// void main() {
//   vec3 N = normalize(vNormal);

//   // Base sand with grain variation and dune shading.
//   float grain = uwNoise(vWorldPos.xz * 3.0) * 0.14;
//   float light = clamp(dot(N, normalize(vec3(uSunDir.x, 1.4, uSunDir.z))), 0.0, 1.0);
//   vec3 col = uSandColor * (0.55 + 0.45 * light) * (1.0 - grain);

//   // Caustics: strongest on up-facing sand, animated.
//   float c = caustic(vWorldPos.xz * 0.32, uTime) * clamp(N.y, 0.0, 1.0);
//   col += uCausticColor * c * 0.5;

//   col = underFog(col, distance(uCameraPos, vWorldPos));
//   gl_FragColor = vec4(col, 1.0);
// }
// `;

// export class SandFloor {
//   constructor(config, quality, sunDir) {
//     const uw = config.underwater;
//     const seg = Math.round(140 * quality.underwaterScale) + 24;

//     const geometry = new PlaneGeometry(uw.areaWidth * 3.4, uw.areaLength * 2.2, seg, seg);
//     geometry.rotateX(-Math.PI / 2);

//     this.material = new ShaderMaterial({
//       vertexShader: VERT.replace('__NOISE__', NOISE_CHUNK),
//       fragmentShader: FRAG
//         .replace(/__NOISE__/g, NOISE_CHUNK)
//         .replace('__FOG__', FOG_CHUNK)
//         .replace('__CAUSTIC__', CAUSTIC_CHUNK),
//       uniforms: {
//         uTime: { value: 0 },
//         uCameraPos: { value: new Vector3() },
//         uSandColor: { value: linearColor(uw.colors.sand) },
//         uCausticColor: { value: linearColor(uw.colors.caustic) },
//         uSunDir: { value: sunDir.clone() },
//         // uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
//         uFogColor: { value: linearColor(config.palette.fogFarUnderwater) },
//         uFogDensity: { value: uw.fogDensity },
//       },
//     });

//     this.mesh = new Mesh(geometry, this.material);
//     this.mesh.position.set(0, -uw.floorDepth, -uw.areaLength * 0.55);
//     this.mesh.frustumCulled = false;
//   }

//   update(time, cameraPos) {
//     this.material.uniforms.uTime.value = time;
//     this.material.uniforms.uCameraPos.value.copy(cameraPos);
//   }

//   dispose() {
//     this.mesh.geometry.dispose();
//     this.material.dispose();
//   }
// }


import { Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { NOISE_CHUNK, FOG_CHUNK, CAUSTIC_CHUNK, TERRAIN_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// Seabed. v2 adds the detail that was missing at close range:
//  - RIPPLES: directional sand ripples (warped sine bands) that read as real
//    seabed texture instead of a smooth plain. They also perturb the shading
//    normal, so they catch light and cast micro-shadow rather than being a
//    flat painted-on pattern.
//  - Two-tone sand (warm crest / cooler trough) for depth in the material.
//  - Ambient floor so sand never crushes to black in the deep grade.

const VERT = /* glsl */ `
${'__NOISE__'}
${'__TERRAIN__'}

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float h = terrainHeight(wp.xz);
  wp.y += h;

  float e = 1.4;
  float hx = terrainHeight(wp.xz + vec2(e, 0.0)) - terrainHeight(wp.xz - vec2(e, 0.0));
  float hz = terrainHeight(wp.xz + vec2(0.0, e)) - terrainHeight(wp.xz - vec2(0.0, e));
  vNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));

  vWorldPos = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${'__NOISE__'}
${'__FOG__'}
${'__CAUSTIC__'}
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uSandColor;
uniform vec3 uSandDeepColor;
uniform vec3 uCausticColor;
uniform vec3 uSunDir;
uniform float uCausticScale;
uniform float uCausticStrength;
uniform float uRippleScale;
uniform float uRippleStrength;
uniform float uAmbient;

varying vec3 vWorldPos;
varying vec3 vNormal;

// Warped directional bands = sand ripples. The noise warp keeps them from
// looking like a printed corduroy pattern.
float ripples(vec2 p, out float slope) {
  float warp = uwNoise(p * 0.035) * 9.0 + uwNoise(p * 0.11) * 2.2;
  float phase = (p.x * 0.75 + p.y * 0.35) * uRippleScale + warp;
  float r = sin(phase);
  slope = cos(phase) * uRippleScale;  // derivative, for normal perturbation
  return r * 0.5 + 0.5;
}

void main() {
  float slope;
  float rip = ripples(vWorldPos.xz, slope);

  // Ripples tilt the shading normal so they actually catch the light.
  vec3 N = normalize(vNormal + vec3(slope * uRippleStrength * 0.09, 0.0,
                                    slope * uRippleStrength * 0.04));

  float grain = uwNoise(vWorldPos.xz * 3.0) * 0.10
              + uwNoise(vWorldPos.xz * 11.0) * 0.05;

  vec3 sunUp = normalize(vec3(uSunDir.x, 1.4, uSunDir.z));
  float light = clamp(dot(N, sunUp), 0.0, 1.0);

  // Crest sand is paler/warmer, trough sand darker/cooler.
  vec3 base = mix(uSandDeepColor, uSandColor, rip * 0.55 + 0.45);
  vec3 col = base * (uAmbient + (1.0 - uAmbient) * light);
  col *= (1.0 - grain);

  // Caustics: strongest on up-facing sand, brightened along ripple crests
  // (where real focused light would pool).
  vec2 causticFlow = uTime * 0.75 * vec2(1.0, -1.0);   // drift toward bottom-left
  float c = caustic(vWorldPos.xz * uCausticScale + causticFlow, uTime) * clamp(N.y, 0.0, 1.0);
  col += uCausticColor * c * uCausticStrength * (0.75 + rip * 0.5);

  col = underFog(col, distance(uCameraPos, vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SandFloor {
  constructor(config, quality, sunDir) {
    const uw = config.underwater;

    // INFINITE FLOOR: a fixed-size plane that FOLLOWS the camera, snapped to
    // its own grid cells. Because dunes/ripples are computed from world
    // position in the shaders, the terrain flows correctly underneath as the
    // plane moves -- so there is no edge to ever reach, at any visibility.
    // Same technique OceanSurface already uses for the water surface.
    // Size only needs to exceed fog visibility; it does NOT need to cover
    // the whole journey, which keeps the vertex count sane.
    const size = uw.floorSize ?? 700;
    // Segments derived from size so a bigger plane keeps the same ripple/dune
    // detail and the same small camera-follow snap step (~5.5m cells).
    const seg = Math.round((size / 5.5) * (0.6 + 0.4 * quality.underwaterScale));
    const geometry = new PlaneGeometry(size, size, seg, seg);
    geometry.rotateX(-Math.PI / 2);
    this.cellSize = size / seg;

    this.material = new ShaderMaterial({
      vertexShader: VERT.replace('__NOISE__', NOISE_CHUNK).replace('__TERRAIN__', TERRAIN_CHUNK),
      fragmentShader: FRAG
        .replace(/__NOISE__/g, NOISE_CHUNK)
        .replace('__FOG__', FOG_CHUNK)
        .replace('__CAUSTIC__', CAUSTIC_CHUNK),
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new Vector3() },
        uSandColor: { value: linearColor(uw.colors.sand) },
        uSandDeepColor: { value: linearColor(uw.colors.sandDeep ?? uw.colors.sand) },
        uCausticColor: { value: linearColor(uw.colors.caustic) },
        uSunDir: { value: sunDir.clone() },
        uCausticScale: { value: uw.causticScale ?? 1.85 },
        uCausticStrength: { value: uw.causticStrength ?? 0.35 },
        uRippleScale: { value: uw.rippleScale ?? 1.6 },
        uRippleStrength: { value: uw.rippleStrength ?? 1.0 },
        uAmbient: { value: uw.ambient ?? 2.55 },
        uDropOffZ: { value: uw.dropOffZ ?? -230 },
        uDropOffDepth: { value: uw.dropOffDepth ?? 90 },
        uDropOffWidth: { value: uw.dropOffWidth ?? 70 },
        uDropOffWaver: { value: uw.dropOffWaver ?? 40 },
        uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
        uFogDensity: { value: uw.fogDensity },
      },
    });

    this.mesh = new Mesh(geometry, this.material);
    this.floorY = -uw.floorDepth;
    this.mesh.position.set(0, this.floorY, 0);
    this.mesh.frustumCulled = false;
  }

  update(time, cameraPos) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPos.value.copy(cameraPos);

    // Follow the camera, snapped to whole grid cells so vertices never swim.
    this.mesh.position.x = Math.round(cameraPos.x / this.cellSize) * this.cellSize;
    this.mesh.position.z = Math.round(cameraPos.z / this.cellSize) * this.cellSize;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}