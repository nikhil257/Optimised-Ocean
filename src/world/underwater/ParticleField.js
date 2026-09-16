import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { linearColor } from '../../utils/math.js';

// Two Points clouds: "marine snow" drifting through the whole corridor, and
// bubbles rising in loose columns. Motion is wholly in the vertex shader
// (drift fields / mod-wrapped ascent) — zero per-frame CPU.

const SNOW_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uSpan;
varying float vFade;

void main() {
  vec3 p = position;
  float sink = uTime * (0.10 + aSeed * 0.12);
  // Wrap the slow sink inside the band between just-under-surface and floor.
  p.y = -2.0 - mod(-2.0 - (position.y - sink), uSpan);
  p.x += sin(uTime * 0.16 + aSeed * 40.0) * 1.6;
  p.z += cos(uTime * 0.13 + aSeed * 33.0) * 1.4;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.4 + aSeed) * (120.0 / max(-mv.z, 1.0));
  vFade = smoothstep(120.0, 25.0, -mv.z) * (0.35 + aSeed * 0.4);
  gl_Position = projectionMatrix * mv;
}
`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vFade * 0.35;
  gl_FragColor = vec4(uColor, a);
}
`;

const BUBBLE_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uRange;
varying float vFade;

void main() {
  vec3 p = position;
  float rise = uTime * (1.4 + aSeed * 2.2);
  p.y = mod(position.y + rise, uRange) - uRange * 0.5;
  p.x += sin(uTime * 1.4 + aSeed * 50.0 + p.y * 0.4) * 0.35;
  p.z += cos(uTime * 1.1 + aSeed * 36.0 + p.y * 0.3) * 0.3;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.5 + aSeed * 0.9) * (100.0 / max(-mv.z, 1.0));
  vFade = smoothstep(90.0, 15.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const BUBBLE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  // Ring: bright rim, hollow center — reads as a bubble, not a blob.
  float ring = smoothstep(0.5, 0.42, d) * (0.3 + 0.7 * smoothstep(0.26, 0.42, d));
  gl_FragColor = vec4(uColor, ring * vFade * 0.5);
}
`;

function makeCloud(count, spread, rng) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set(
      [
        spread.x0 + rng() * (spread.x1 - spread.x0),
        spread.y0 + rng() * (spread.y1 - spread.y0),
        spread.z0 + rng() * (spread.z1 - spread.z0),
      ],
      i * 3
    );
    seeds[i] = rng();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  return geometry;
}

export class ParticleField {
  constructor(config, quality, rng) {
    const uw = config.underwater;

    // --- marine snow across the whole corridor
    const snowGeo = makeCloud(
      Math.round(uw.particleCount * quality.underwaterScale),
      {
        x0: -uw.areaWidth * 0.7, x1: uw.areaWidth * 0.7,
        y0: -uw.floorDepth + 1, y1: -2,
        z0: -uw.restZ - uw.areaLength, z1: -uw.restZ + 30,
      },
      rng
    );
    this.snowMat = new ShaderMaterial({
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 2.4 },
        uSpan: { value: uw.floorDepth - 3 },
        uColor: { value: linearColor(uw.colors.particle) },
      },
    });
    this.snow = new Points(snowGeo, this.snowMat);
    this.snow.frustumCulled = false;

    // --- bubble columns near the journey path
    const range = uw.floorDepth - 3;
    const bubbleGeo = makeCloud(
      Math.round(uw.bubbleCount * quality.underwaterScale),
      {
        x0: -uw.areaWidth * 0.3, x1: uw.areaWidth * 0.3,
        y0: -range, y1: 0,
        z0: -uw.restZ - uw.areaLength, z1: -uw.restZ,
      },
      rng
    );
    this.bubbleMat = new ShaderMaterial({
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 2.0 },
        uRange: { value: range },
        uColor: { value: linearColor(uw.colors.bubble) },
      },
    });
    this.bubbles = new Points(bubbleGeo, this.bubbleMat);
    this.bubbles.position.y = -uw.floorDepth * 0.5;
    this.bubbles.frustumCulled = false;
  }

  update(time) {
    this.snowMat.uniforms.uTime.value = time;
    this.bubbleMat.uniforms.uTime.value = time;
  }

  dispose() {
    this.snow.geometry.dispose();
    this.snowMat.dispose();
    this.bubbles.geometry.dispose();
    this.bubbleMat.dispose();
  }
}
