import {
  BackSide,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
} from 'three';
import { linearColor } from '../../utils/math.js';

// A flowing, turbulent water-swirl shell around the camera, OUTSIDE the
// tunnel/rays. Built on a SPHERE (BackSide — we see the inside), the same
// technique SkyDome already uses to fully surround the camera in every
// direction with zero geometric gaps.
//
// v3 fixes the real bug in v1/v2: those used an OPEN-ENDED CYLINDER. A view
// ray looking straight down a cylinder's own axis travels PARALLEL to its
// wall and mathematically never intersects it -- it only hits the wall when
// the gaze deviates off-axis. That's exactly why the effect was invisible
// dead-ahead and only glimpsed at the screen's edge while turning. A sphere
// has no axis to look down -- every direction from the center hits the
// inside surface, guaranteed.
//
// Also simplified: instead of the shader recentering every vertex via
// inverse(viewMatrix) each frame, the mesh simply follows the camera's
// POSITION in JS each frame (identical to SkyDome.update()) -- cheaper, and
// there's no "ahead/behind" axis to reason about on a sphere anyway.

const VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uReveal;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uSwirlSpeed;
uniform float uAngularFreq;
uniform float uLengthFreq;
uniform float uOpacity;
uniform float uPhase;
uniform float uContrastLow;
uniform float uContrastHigh;
uniform vec2 uBend;

varying vec3 vDir;

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
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);

  // Spherical coordinates: azimuth (around) and elevation (up/down) become
  // our two sampling axes -- no open axis to look through, unlike a tube.
float azimuth = atan(dir.y, dir.x) / 6.2831; // around Z now
  float along = dir.z;                          // ahead/behind

  // The turn's banking drifts the pattern's azimuth slightly, so the swirl
  // still feels coupled to the ride without any geometric repositioning.
  float azimuthDrift = uBend.x * 0.01;

vec2 p = vec2(
    (azimuth * uAngularFreq + uTime * uSwirlSpeed * 0.06 + uPhase + azimuthDrift) * 0.4,
    along * uLengthFreq - uTime * uFlowSpeed
  );

  // vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  // vec2 r = vec2(
  //   fbm(p + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.15),
  //   fbm(p + 4.0 * q + vec2(8.3, 2.8))
  // );

    vec2 q = vec2(fbm(p + uTime * 0.06), fbm(p + vec2(5.2, 1.3) - uTime * 0.09));
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.15),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) - uTime * 0.11)
  );
  float pattern = fbm(p + 4.0 * r);

  float bright = smoothstep(uContrastLow, uContrastHigh, pattern);
  float glint = pow(bright, 4.0);

  vec3 col = mix(uColor, uColor * 1.6, glint);
  col = mix(col, vec3(1.0), glint * 0.15);

    float bandFade = smoothstep(0.05, 0.45, 1.0 - abs(dir.z));

  // Fade toward straight up/down so the effect reads as an equatorial band
  // of turbulence around you, not a uniform ball -- reads more like a
  // current sweeping past at eye-level than a fog sphere.
  // float bandFade = 1.0 - smoothstep(0.5, 0.95, abs(elevation));
  // float bandFade = 1.0;

  float alpha = bright * bandFade * uReveal * uReveal * uOpacity;
  gl_FragColor = vec4(col, alpha);
}
`;

export class RushSwirl {
  constructor(config, quality) {
    const d = config.dive;
    const layerCount = Math.max(1, d.swirlLayers ?? 3);
    const scaleDown = quality.underwaterScale < 0.6;

    this.group = new Group();
    this.layers = [];
    this._reveal = { value: 0 };

    // Anchored to the rays' own outer edge -- always outside them regardless
    // of how tunnelRadius / rayOuterRadiusMult get tuned independently.
    const rayOuterEdge = d.tunnelRadius * (d.rayOuterRadiusMult ?? 5.5);
    const baseMult = d.swirlBaseRadiusMult ?? 1.25;
    const spacingMult = d.swirlLayerSpacing ?? 0.3;

    const count = scaleDown ? Math.min(layerCount, 2) : layerCount;

    for (let i = 0; i < count; i++) {
      const radius = rayOuterEdge * (baseMult + i * spacingMult);
      const geometry = new SphereGeometry(radius, 32, 20);

      const material = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: BackSide, // camera is inside the sphere -- see the inner face
        uniforms: {
          uTime: { value: 0 },
          uBend: { value: new Vector2(0, 0) },
          uReveal: { value: 0 },
          uColor: { value: linearColor(config.underwater.colors.swirl ?? config.underwater.colors.bubble) },
          uFlowSpeed: { value: d.swirlFlowSpeed ?? 0.5 },
          uSwirlSpeed: { value: d.tunnelSwirl ?? 0.7 },
          uAngularFreq: { value: (d.swirlAngularFreq ?? 3.0) + i * 0.6 },
          uLengthFreq: { value: d.swirlLengthFreq ?? 2.2 },
          uOpacity: { value: (d.swirlOpacity ?? 0.4) * (1.0 - i * 0.18) },
          uPhase: { value: i * 17.3 },
          uContrastLow: { value: d.swirlContrastLow ?? 0.45 },
          uContrastHigh: { value: d.swirlContrastHigh ?? 0.92 },
        },
      });

      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.group.add(mesh);
      this.layers.push({ mesh, material });
    }
  }

  get revealUniform() {
    return this._reveal;
  }

  setBend(x, y) {
    for (const { material } of this.layers) {
      const b = material.uniforms.uBend.value;
      b.x += (x - b.x) * 0.1;
      b.y += (y - b.y) * 0.1;
    }
  }

  /**
   * NOTE: signature changed from v1/v2 -- this now needs the camera's
   * POSITION (not just elapsed time), since the sphere follows the camera
   * in JS instead of recentering per-vertex in the shader. Call as
   * this.swirl.update(elapsed, this.camera.position) -- same pattern as
   * this.sky.update(this.camera.position) already used elsewhere in App.js.
   */
update(time, cameraPosition, cameraQuaternion) {
    for (const { mesh, material } of this.layers) {
      material.uniforms.uTime.value = time;
      material.uniforms.uReveal.value = this._reveal.value;
      mesh.position.copy(cameraPosition);
      if (cameraQuaternion) mesh.quaternion.copy(cameraQuaternion);
    }
  }

  dispose() {
    for (const { mesh, material } of this.layers) {
      mesh.geometry.dispose();
      material.dispose();
    }
  }
}