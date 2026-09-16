// import {
//   BackSide,
//   Mesh,
//   ShaderMaterial,
//   SphereGeometry,
// } from 'three';
// import { SKY_CHUNK } from '../shared/skyChunk.js';
// import { linearColor } from '../../utils/math.js';

// const VERT = /* glsl */ `
// varying vec3 vDir;
// void main() {
//   vDir = normalize(position);
//   vec4 mv = modelViewMatrix * vec4(position, 1.0);
//   gl_Position = projectionMatrix * mv;
//   // Pin to the far plane so the dome never clips geometry.
//   gl_Position.z = gl_Position.w * 0.99999;
// }
// `;

// const FRAG = /* glsl */ `
// varying vec3 vDir;
// uniform vec3 uSunDir;
// uniform vec3 uZenith;
// uniform vec3 uHorizon;
// uniform vec3 uSunTint;
// uniform vec3 uUnderNear;
// uniform vec3 uUnderDeep;
// uniform vec3 uAbyss;
// uniform float uSubmerge;
// uniform float uDepth;

// ${'__SKY__'}

// // Interleaved gradient noise — kills gradient banding for ~free.
// float ign(vec2 p) {
//   return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
// }

// // The water column: bright toward the surface overhead, falling to abyss
// // below, with a soft glow toward the sun's direction filtering down.
// // uDepth (0..1) sinks the whole column toward the abyss and starves the sun —
// // how the descent reads as "going deeper" rather than just "moving forward".
// vec3 underwaterColor(vec3 dir) {
//   float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
//   vec3 col = mix(uAbyss, uUnderNear * 1.25, pow(up, 0.8));
//   col = mix(col, uUnderDeep, (1.0 - up) * 0.4);
//   float sunAmt = pow(max(dot(dir, normalize(vec3(uSunDir.x, 0.8, uSunDir.z))), 0.0), 6.0);
//   col += uSunTint * sunAmt * 0.10 * up * (1.0 - uDepth * 0.65);
//   col = mix(col, uAbyss, uDepth * 0.55);
//   return col;
// }

// void main() {
//   vec3 dir = normalize(vDir);
//   vec3 sky = skyColor(dir, uSunDir, uZenith, uHorizon, uSunTint);
//   vec3 col = mix(sky, underwaterColor(dir), uSubmerge);
//   col += (ign(gl_FragCoord.xy) - 0.5) * 0.006;
//   gl_FragColor = vec4(col, 1.0);
// }
// `;

// export class SkyDome {
//   constructor({ palette }, sunDir) {
//     this.material = new ShaderMaterial({
//       vertexShader: VERT,
//       fragmentShader: FRAG.replace('__SKY__', SKY_CHUNK),
//       side: BackSide,
//       depthWrite: false,
//       uniforms: {
//         uSunDir: { value: sunDir.clone() },
//         uZenith: { value: linearColor(palette.skyZenith) },
//         uHorizon: { value: linearColor(palette.skyHorizon) },
//         uSunTint: { value: linearColor(palette.sunTint) },
//         uUnderNear: { value: linearColor(palette.fogNearUnderwater) },
//         uUnderDeep: { value: linearColor(palette.fogFarUnderwater) },
//         uAbyss: { value: linearColor(palette.abyss) },
//         uSubmerge: { value: 0 },
//         uDepth: { value: 0 },
//       },
//     });

//     this.mesh = new Mesh(new SphereGeometry(3000, 32, 20), this.material);
//     this.mesh.frustumCulled = false;
//   }

//   /** 0 = sky, 1 = water column. Tweened by App at the crossing frame. */
//   get submergeUniform() {
//     return this.material.uniforms.uSubmerge;
//   }

//   /** 0 = shallow water, 1 = deep. Tweened by App during the descent rush. */
//   get depthUniform() {
//     return this.material.uniforms.uDepth;
//   }

//   /** Keep the dome centered on the camera so the horizon never drifts. */
//   update(cameraPosition) {
//     this.mesh.position.copy(cameraPosition);
//   }

//   dispose() {
//     this.mesh.geometry.dispose();
//     this.material.dispose();
//   }
// }

import {
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { SKY_CHUNK } from '../shared/skyChunk.js';
import { linearColor } from '../../utils/math.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Pin to the far plane so the dome never clips geometry.
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunTint;
uniform vec3 uUnderNear;
uniform vec3 uUnderDeep;
uniform vec3 uAbyss;
uniform float uSubmerge;
uniform float uDepth;

${'__SKY__'}

// Interleaved gradient noise — kills gradient banding for ~free.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// The water column: bright toward the surface overhead, falling to abyss
// below, with a soft glow toward the sun's direction filtering down.
// uDepth (0..1) sinks the whole column toward the abyss and starves the sun —
// how the descent reads as "going deeper" rather than just "moving forward".
vec3 underwaterColor(vec3 dir) {
  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uAbyss, uUnderNear * 1.25, pow(up, 0.8));
  col = mix(col, uUnderDeep, (1.0 - up) * 0.4);
  float sunAmt = pow(max(dot(dir, normalize(vec3(uSunDir.x, 0.8, uSunDir.z))), 0.0), 6.0);
  col += uSunTint * sunAmt * 0.10 * up * (1.0 - uDepth * 0.38);
  col = mix(col, uAbyss, uDepth * 0.30);
  return col;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 sky = skyColor(dir, uSunDir, uZenith, uHorizon, uSunTint);
  vec3 col = mix(sky, underwaterColor(dir), uSubmerge);
  col += (ign(gl_FragCoord.xy) - 0.5) * 0.006;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class SkyDome {
  constructor({ palette }, sunDir) {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG.replace('__SKY__', SKY_CHUNK),
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uZenith: { value: linearColor(palette.skyZenith) },
        uHorizon: { value: linearColor(palette.skyHorizon) },
        uSunTint: { value: linearColor(palette.sunTint) },
        uUnderNear: { value: linearColor(palette.fogNearUnderwater) },
        uUnderDeep: { value: linearColor(palette.fogFarUnderwater) },
        uAbyss: { value: linearColor(palette.abyss) },
        uSubmerge: { value: 0 },
        uDepth: { value: 0 },
      },
    });

    this.mesh = new Mesh(new SphereGeometry(3000, 32, 20), this.material);
    this.mesh.frustumCulled = false;
  }

  /** 0 = sky, 1 = water column. Tweened by App at the crossing frame. */
  get submergeUniform() {
    return this.material.uniforms.uSubmerge;
  }

  /** 0 = shallow water, 1 = deep. Tweened by App during the descent rush. */
  get depthUniform() {
    return this.material.uniforms.uDepth;
  }

  /** Keep the dome centered on the camera so the horizon never drifts. */
  update(cameraPosition) {
    this.mesh.position.copy(cameraPosition);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}