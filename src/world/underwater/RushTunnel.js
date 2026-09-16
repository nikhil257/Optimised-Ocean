import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { linearColor } from '../../utils/math.js';

// Curl-flow vortex — a "tangle of currents" you approach and then fly through.
// Camera-relative: the tube is built around the VIEW AXIS. Its centerline can
// be BENT along its length (uCurve*) so it snakes into an S / C / helix.
//   uReveal : global fade in/out (0 → 1)
//   uEnter  : 0 = vortex mouth ahead (approaching), 1 = wrapped around you (inside)

const VERT = /* glsl */ `
attribute float aT;       // 0..1 base position along the tube
attribute float aAngle;   // base angular position
attribute float aRadius;  // base radius
attribute float aSeed;

uniform float uTime;
uniform float uSpeed;
uniform float uLength;
uniform float uSize;
uniform float uReveal;
uniform float uEnter;
uniform float uSwirl;
uniform float uTwist;
uniform float uFlow;        // overall weaving strength
uniform float uFlowAmp;     // turbulent displacement in meters
uniform float uNoiseScale;  // turbulence frequency
uniform float uExit;        // 0→1 at the end: slide the tube BEHIND the camera (glide out the mouth)
uniform float uFlare;
uniform vec2 uBend;
uniform vec3 uCurveAmp;     // centerline bend amplitude x/y/z (meters) — 3D snake
uniform float uCurveFreq;   // bends per meter along the tube
uniform float uCurvePhase;  // shifts the wave along the tube
uniform vec2 uEntryOffset;  // off-axis view offset while OUTSIDE (fades as you enter)
uniform float uEntryDist;   // how far the mouth sits ahead while OUTSIDE (fades as you enter)
uniform float uDissolveScale; // dissolve noise patch size (higher = finer patches)

varying float vAlpha;
varying float vStreak;
varying float vGlow;
varying float vNoise;
varying float vAhead;

// Cheap 3D value noise + fbm — the turbulence that weaves the current strands.
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n * 2.0 - 1.0;
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 3; k++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return s;
}

// Centerline offset at depth z along the tube — THIS is the S / snake shape.
// 3D: x = full wave, y = half wave, z = quarter-phase cosine → a true 3D snake.
vec3 centerline(float z) {
  float cz = z * uCurveFreq + uCurvePhase;
  return vec3(sin(cz) * uCurveAmp.x, sin(cz * 0.5) * uCurveAmp.y, cos(cz) * uCurveAmp.z);
}

void main() {
  // Per-particle forward speed so they DON'T scroll in lockstep.
  float speed = uSpeed * (0.6 + aSeed * 0.8);
  float z = mod(aT * uLength + uTime * speed + aSeed * uLength, uLength) - uLength * 0.5;
  float ahead = clamp(-z / (uLength * 0.5), 0.0, 1.0);

  // The STRUCTURE only comes alive (swirl + turbulence) as you ENTER. Until
  // then it sits perfectly still — only the particles scroll (uSpeed), so the
  // bubbles move but the tunnel stays put (no up/down, no rotation).
  float anim = smoothstep(0.4, 1.0, uEnter);

  float ang = aAngle + uTime * uSwirl * (0.6 + aSeed * 0.5) * anim + z * uTwist;
  float rad = aRadius * (1.0 + ahead * uFlare);

  // Turbulent weaving that stays ON THE WALL (preserves the hollow core).
  vec3 np = vec3(ang * 0.8, z * uNoiseScale, aSeed * 12.0 + uTime * 0.15);
  float dAng = fbm(np) * uFlow * anim;
  float dR = fbm(np + vec3(11.1, 3.7, 5.2)) * uFlowAmp * 0.25 * anim;
  float dZ = fbm(np + vec3(-4.1, 9.3, 1.7)) * uFlowAmp * anim;
  ang += dAng;
  // EXIT = DISPERSE (matches the reference): particles spread OUTWARD, the
  // vortex eye opens, and the ocean shows through as they scatter off-frame.
  float r = (rad + dR) * (1.0 + uExit * 4.0);
  float zz = z + dZ;

  vec3 localPos = vec3(cos(ang) * r, sin(ang) * r, zz);
  localPos.xy += uBend * ahead * ahead;

  // 3D centerline curve → the tube snakes through x/y/z (S / C / helix). The
  // core stays hollow; it just curves.
  // Full S when OUTSIDE (uEnter→0) for the cinematic view; fades to a straight,
  // CENTERED tube as you go INSIDE (uEnter→1) — so you fly THROUGH it down the
  // middle, instead of watching a curved tube veer off to the side.
  localPos += centerline(zz) * (1.0 - uEnter);
    float ph = zz * 0.05 - uTime * 0.5;
  localPos.x += sin(ph * 0.8 + 2.0) * 2.0 * uEnter;
  localPos.y += sin(ph) * 3.0 * uEnter;

  // OUTSIDE the tunnel (uEnter→0): sit OFF the axis and BEHIND the mouth, so you
  // VIEW the entrance instead of being centred inside it. As you go inside
  // (uEnter→1) this fades to zero — so the centred rush only begins once you
  // enter (after the 30m / on the 2nd CTA), exactly as asked.
  localPos.xy += uEntryOffset * (1.0 - uEnter);
  localPos.z  -= uEntryDist   * (1.0 - uEnter);

  vec4 worldPos = inverse(viewMatrix) * vec4(localPos, 1.0);
  vec4 mv = viewMatrix * worldPos;

  gl_PointSize = uSize * (0.4 + aSeed * 1.1) * (200.0 / max(-mv.z, 1.0));
  gl_PointSize *= mix(0.4, 1.0, uReveal);

  float zNorm = (z + uLength * 0.5) / uLength;
  float endFade = smoothstep(0.0, 0.28, zNorm) * smoothstep(1.0, 0.9, zNorm);
  float nearFade = smoothstep(2.5, 7.0, -mv.z);
  float enterFade = mix(smoothstep(0.12, 0.55, ahead), 1.0, uEnter);

  vAlpha = endFade * nearFade * enterFade * (0.45 + aSeed * 0.55);
  vStreak = smoothstep(0.1, 0.4, abs(z) / uLength);
  vAhead = ahead;
  // Dissolve threshold from COHERENT noise across the tube surface (angle +
  // length) — the equivalent of sampling a dissolve texture, so it dissolves in
  // organic growing patches (clip(noise - amount) in the FRAG), not random
  // sparkle. Stable per particle → no flicker as they scroll.
  vNoise = fbm(vec3(aAngle, aT * 4.0, 7.3) * uDissolveScale) * 0.5 + 0.5;
  vGlow = 0.5 + 0.5 * fbm(np * 1.7);

  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uOceanColor;
uniform float uReveal;
uniform float uDissolve;
uniform float uExit;
varying float vAlpha;
varying float vStreak;
varying float vGlow;
varying float vNoise;
varying float vAhead;

void main() {
  if (vNoise < uDissolve) discard;
  float edge = smoothstep(uDissolve + 0.14, uDissolve, vNoise);

  vec2 uv = gl_PointCoord - 0.5;
  float streakD = length(vec2(uv.x, uv.y * (1.0 - vStreak * 0.5)));
  float core = smoothstep(0.5, 0.0, streakD);
  float glow = smoothstep(0.5, 0.16, streakD);
  vec3 col = mix(uColor, uColor2, vGlow) + uColor2 * edge * 1.2;
  // On exit, the far end (the mouth) takes the ocean colour, so the tunnel
  // reads as opening OUT into the sea rather than just ending.
  col = mix(col, uOceanColor, clamp(vAhead * uExit * 1.4, 0.0, 1.0));
  // Thin the last of them as they scatter, so the reef fully bleeds through
  // (gradual — never a hard cut to zero).
  float fade = 1.0 - smoothstep(0.5, 1.0, uExit) * 0.85;
  float a = (core * 0.6 + glow * 0.4) * vAlpha * uReveal * fade;
  gl_FragColor = vec4(col, a);
}
`;

export class RushTunnel {
  constructor(config, quality) {
    const d = config.dive;
    const count = Math.round(d.tunnelCount * (quality.underwaterScale * 0.6 + 0.4));

    const ts = new Float32Array(count);
    const angles = new Float32Array(count);
    const radii = new Float32Array(count);
    const seeds = new Float32Array(count);
    const positions = new Float32Array(count * 3); // required attr, unused by shader

    for (let i = 0; i < count; i++) {
      ts[i] = Math.random();
      angles[i] = Math.random() * Math.PI * 2;
      // SHELL distribution: particles hug the tube wall (0.72–1.22 of radius),
      // leaving the core empty → hollow cylinder.
      radii[i] = d.tunnelRadius * (0.72 + Math.pow(Math.random(), 0.8) * 0.5);
      seeds[i] = Math.random();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aT', new BufferAttribute(ts, 1));
    geometry.setAttribute('aAngle', new BufferAttribute(angles, 1));
    geometry.setAttribute('aRadius', new BufferAttribute(radii, 1));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));

    const uw = config.underwater.colors;
    const curve = d.tunnelCurve || {};
    const entry = d.tunnelEntry || {};
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: d.tunnelSpeed },
        uLength: { value: d.tunnelLength },
        uSize: { value: d.tunnelSize ?? 2.4 },
        uColor: { value: linearColor(d.tunnelColor ?? uw.bubble) },
        uColor2: { value: linearColor(d.tunnelColorBright ?? uw.caustic) },
        uOceanColor: { value: linearColor(d.tunnelMouthColor ?? config.palette.abyss) },
        uReveal: { value: 0 },
        uDissolve: { value: 0 },
        uDissolveScale: { value: d.tunnelDissolveScale ?? 1.0 },
        uEnter: { value: 0 },
        uBend: { value: new Vector2(0, 0) },
        uFlare: { value: d.tunnelFlare },
        uSwirl: { value: d.tunnelSwirl },
        uTwist: { value: d.tunnelTwist },
        uFlow: { value: d.tunnelFlow ?? 1.0 },
        uFlowAmp: { value: d.tunnelFlowAmp ?? 3.0 },
        uNoiseScale: { value: d.tunnelNoiseScale ?? 0.12 },
        uExit: { value: 0 },
        uCurveAmp: { value: new Vector3((curve.amp && curve.amp[0]) ?? 0, (curve.amp && curve.amp[1]) ?? 0, (curve.amp && curve.amp[2]) ?? 0) },
        uCurveFreq: { value: curve.freq ?? 0.05 },
        uCurvePhase: { value: curve.phase ?? 0 },
        uEntryOffset: { value: new Vector2((entry.offset && entry.offset[0]) ?? 0, (entry.offset && entry.offset[1]) ?? 0) },
        uEntryDist: { value: entry.dist ?? 0 },
      },
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
  }

  get revealUniform() {
    return this.material.uniforms.uReveal;
  }

  /** 0 = present, 1 = fully dissolved (cinematic disintegration). */
  get dissolveUniform() {
    return this.material.uniforms.uDissolve;
  }

  /** 0 → 1: slide the tube behind the camera — glide out of the mouth. */
  get exitUniform() {
    return this.material.uniforms.uExit;
  }

  /** 0 = vortex mouth ahead (approach), 1 = wrapped around you (inside). */
  get enterUniform() {
    return this.material.uniforms.uEnter;
  }

  setEnter(v) {
    this.material.uniforms.uEnter.value = v;
  }

  /** View-space swing of the far mouth (meters). Drive from the banking. */
  setBend(x, y) {
    const b = this.material.uniforms.uBend.value;
    b.x += (x - b.x) * 0.2;
    b.y += (y - b.y) * 0.2;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}