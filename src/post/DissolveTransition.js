// import { Effect } from 'postprocessing';
// import { Uniform } from 'three';

// // Screen-space "burning paper" dissolve — but no fire. We FREEZE the current
// // frame (the tunnel view) into uFromTex, then as uProgress sweeps 0→1 that
// // frozen image dissolves along a coherent noise edge, revealing the LIVE scene
// // (inputColor — the ocean world) behind it. Idle (uProgress<=0) is pass-through.

// const FRAG = /* glsl */ `
// uniform sampler2D uFromTex;
// uniform float uProgress;
// uniform float uEdge;
// uniform float uScale;

// float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
// float vnoise(vec2 p) {
//   vec2 i = floor(p), f = fract(p);
//   f = f * f * (3.0 - 2.0 * f);
//   return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
//              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
// }
// float fbm(vec2 p) {
//   float a = 0.5, s = 0.0;
//   for (int k = 0; k < 5; k++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
//   return s;
// }

// void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
//   if (uProgress <= 0.0) { outputColor = inputColor; return; }
//   // Stretch fbm (which clusters around 0.5) to a full 0..1 range so uProgress
//   // sweeps it linearly — otherwise the first ~20% of the dissolve does nothing
//   // and it reads as "stuck" before suddenly kicking in.
//   float n = clamp((fbm(uv * uScale) - 0.25) / 0.5, 0.0, 1.0);
//   float m = smoothstep(uProgress, uProgress + uEdge, n); // 1 = frozen frame, 0 = revealed
//   vec3 from = texture(uFromTex, uv).rgb;
//   outputColor = vec4(mix(inputColor.rgb, from, m), inputColor.a);
// }
// `;

// export class DissolveTransition extends Effect {
//   constructor({ edge = 0.06, scale = 5.0 } = {}) {
//     super('DissolveTransition', FRAG, {
//       uniforms: new Map([
//         ['uFromTex', new Uniform(null)],
//         ['uProgress', new Uniform(0)],
//         ['uEdge', new Uniform(edge)],
//         ['uScale', new Uniform(scale)],
//       ]),
//     });
//   }

//   get progressUniform() {
//     return this.uniforms.get('uProgress');
//   }

//   set fromTexture(t) {
//     this.uniforms.get('uFromTex').value = t;
//   }
// }


import { Effect } from 'postprocessing';
import { Uniform, Color } from 'three';

// Screen-space "burning paper" dissolve — but no fire. We FREEZE the current
// frame (the tunnel view) into uFromTex, then as uProgress sweeps 0→1 that
// frozen image dissolves along a coherent noise edge, revealing the LIVE scene
// (inputColor — the ocean world) behind it. Idle (uProgress<=0) is pass-through.

const FRAG = /* glsl */ `
uniform sampler2D uFromTex;
uniform float uProgress;
uniform float uEdge;
uniform float uScale;
uniform vec3 uEdgeColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 5; k++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return s;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uProgress <= 0.0) { outputColor = inputColor; return; }
  // Stretch fbm (which clusters around 0.5) to a full 0..1 range so uProgress
  // sweeps it linearly — otherwise the first ~20% of the dissolve does nothing
  // and it reads as "stuck" before suddenly kicking in.
  vec2 center = vec2(0.5);

float radial = distance(uv, center);
radial = smoothstep(0.0, 0.707, radial); // normalize

float noise = clamp((fbm(uv * uScale) - 0.25) / 0.5, 0.0, 1.0);

// Blend radial and noise
float n = radial * 0.7 + noise * 0.9;
 float start = uProgress - 0.15;
float m = smoothstep(start, start + uEdge, n);
  float edge =
    smoothstep(uProgress, uProgress + uEdge, n) -
    smoothstep(uProgress + uEdge, uProgress + uEdge * 2.0, n);
vec3 from = texture(uFromTex, uv).rgb;

vec3 color = mix(inputColor.rgb, from, m);

// Add colored edge
color += uEdgeColor * edge * 1.0;

outputColor = vec4(color, inputColor.a);
}
`;

export class DissolveTransition extends Effect {
  constructor({ edge = 0.6, scale = 5.0 } = {}) {
    super('DissolveTransition', FRAG, {
      uniforms: new Map([
        ['uFromTex', new Uniform(null)],
        ['uProgress', new Uniform(0)],
        ['uEdge', new Uniform(edge)],
        ['uScale', new Uniform(scale)],
        ['uEdgeColor', new Uniform(new Color('#B9AA8B'))],
      ]),
    });
  }

  get progressUniform() {
    return this.uniforms.get('uProgress');
  }

  set fromTexture(t) {
    this.uniforms.get('uFromTex').value = t;
  }
}