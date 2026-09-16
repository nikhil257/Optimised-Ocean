import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

// Programmatic grade (lift / gamma / gain / saturation). Chosen over a LUT for
// M1 so the bundle ships zero binary assets and every parameter stays live-
// tunable per client. The class boundary is LUT-shaped: swapping in a
// LUT3DEffect later requires no changes outside the post pipeline.

const FRAG = /* glsl */ `
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uGamma;
uniform float uSaturation;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, vec3(0.0)), 1.0 / uGamma);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  outputColor = vec4(c, inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor({ lift, gain, gamma, saturation }) {
    super('GradeEffect', FRAG, {
      uniforms: new Map([
        ['uLift', new Uniform(new Vector3(...lift))],
        ['uGain', new Uniform(new Vector3(...gain))],
        ['uGamma', new Uniform(new Vector3(...gamma))],
        ['uSaturation', new Uniform(saturation)],
      ]),
    });
  }
}
