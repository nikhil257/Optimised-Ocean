import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { NOISE_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// Light shafts: tapered alpha planes hanging from the surface, cylindrically
// billboarded toward the camera and leaned along the sun's azimuth. Animated
// noise makes them breathe. One instanced draw call — the classic trick that
// reads as volumetric at a fraction of raymarching's cost.

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec2 aSize;    // width, height
attribute float aSeed;

uniform vec3 uCameraPos;
uniform vec2 uSunLean;   // horizontal lean per meter of drop

varying vec2 vUv;
varying float vSeed;
varying float vDist;

void main() {
  vUv = uv;
  vSeed = aSeed;

  vec3 p = vec3(position.x * aSize.x, position.y * aSize.y, 0.0);

  // Cylindrical billboard: rotate each shaft around Y toward the camera.
  vec2 toCam = uCameraPos.xz - aOffset.xz;
  float yaw = atan(toCam.x, toCam.y);
  float c = cos(yaw);
  float s = sin(yaw);
  p = vec3(c * p.x, p.y, -s * p.x);

  // Lean with the sun: deeper = further displaced along the sun azimuth.
  float drop = aSize.y * (1.0 - uv.y);
  p.xz += uSunLean * drop;

  vec3 wp = p + aOffset;
  vDist = distance(uCameraPos, wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${'__NOISE__'}
uniform float uTime;
uniform vec3 uRayColor;
uniform float uIntensity;

varying vec2 vUv;
varying float vSeed;
varying float vDist;

void main() {
  // Gaussian horizontal profile — a bell curve has no border to see,
  // unlike smoothstep which always leaves a readable edge.
float x = (vUv.x - 0.5) * 2.0;
float edge = exp(-x * x * 2.5);          // soft bell; raise 5.0 for tighter core

  // Vertical: brightest near the surface but carrying most of the way down,
  // so the shafts actually reach into the water where the seabed camera sits
  // (the reference shows them filling the upper-mid frame, not just the top).
  float vert = smoothstep(0.02, 0.85, vUv.y);  // alive over ~85% of the shaft
  vert = pow(vert, 1.25);                       // keep the top brighter

  float breathe = 0.7 + 0.3 * uwNoise(vec2(uTime * 0.1 + vSeed * 30.0, vUv.y * 1.5 + vSeed * 11.0));
  float distFade = smoothstep(220.0, 60.0, vDist) * 0.85 + 0.15;

  float a = vert * edge * breathe * uIntensity * distFade;
  gl_FragColor = vec4(uRayColor, a);
}
`;

export class GodRays {
  constructor(config, quality, sunDir, rng) {
    const uw = config.underwater;
    const count = Math.max(4, Math.round(uw.godRayCount * (quality.underwaterScale * 0.5 + 0.5)));

    const base = new PlaneGeometry(1, 1);
    base.translate(0, -0.5, 0); // pivot at the top (surface)

    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes.position = base.attributes.position;
    geometry.attributes.uv = base.attributes.uv;
    geometry.instanceCount = count;

    const offsets = new Float32Array(count * 3);
    const sizes = new Float32Array(count * 2);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      offsets.set(
        [
          (rng() - 0.5) * uw.areaWidth * 0.9,
          -1.5,
          -uw.restZ - 10 - rng() * uw.areaLength,
        ],
        i * 3
      );
      sizes.set([12 + rng() * 14, uw.floorDepth * (0.8 + rng() * 0.75)], i * 2); // width 12–26m (was 40–58, blobby)
      seeds[i] = rng();
    }
    geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('aSize', new InstancedBufferAttribute(sizes, 2));
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));

    // Lean along the sun's azimuth so shafts agree with the lighting story.
    const lean = Math.hypot(sunDir.x, sunDir.z) > 1e-4
      ? [(sunDir.x / Math.max(sunDir.y, 0.2)) * 0.25, (sunDir.z / Math.max(sunDir.y, 0.2)) * 0.25]
      : [0, 0];

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG.replace('__NOISE__', NOISE_CHUNK),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new Vector3() },
        uSunLean: { value: new Vector2(lean[0], lean[1]) },
        uRayColor: { value: linearColor(uw.colors.ray).multiplyScalar(0.16 * (uw.rayIntensity ?? 1)) },
        uIntensity: { value: 1.0 },
      },
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10; // after opaques, over the fogged scene
  }

  update(time, cameraPos) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPos.value.copy(cameraPos);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}