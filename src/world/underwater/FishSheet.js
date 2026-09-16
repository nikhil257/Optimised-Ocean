import {
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  CanvasTexture,
  Vector3,
} from 'three';
import { NOISE_CHUNK, FOG_CHUNK } from './chunks.js';
import { linearColor } from '../../utils/math.js';

// The distant school: fish following a shared elliptical orbit through 3D
// space, each turning to face its own velocity.
//
// This is an InstancedMesh of textured planes, NOT points. Points are always
// screen-aligned squares — they cannot roll, bank, or turn edge-on as a fish
// comes around the far side of the loop, and that real 3D orientation is the
// whole effect. Instancing keeps it to a single draw call regardless of count.

const VERT = /* glsl */ `
attribute float aOpacity;

varying vec2 vUv;
varying float vDist;
varying float vOpacity;

void main() {
  vUv = uv;
  vOpacity = aOpacity;
  // instanceMatrix carries this fish's position, 3D orientation and scale,
  // composed on the CPU each frame.
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
${'__NOISE__'}
${'__FOG__'}
uniform sampler2D uSprite;

varying vec2 vUv;
varying float vDist;
varying float vOpacity;

void main() {
  vec4 tex = texture2D(uSprite, vUv);
  float a = tex.a * vOpacity;
  if (a < 0.01) discard;
  // Same underwater fog as the reef, so the school sits IN the scene instead
  // of floating on top of it.
  vec3 col = underFog(tex.rgb, vDist);
  gl_FragColor = vec4(col, a);
}
`;

function createFishTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 96);

  x.filter = 'blur(0.55px)';
  const body = x.createLinearGradient(20, 0, 220, 0);
  body.addColorStop(0, 'rgba(80,165,207,0.20)');
  body.addColorStop(0.12, 'rgba(126,205,234,0.68)');
  body.addColorStop(0.48, 'rgba(171,231,246,0.92)');
  body.addColorStop(0.78, 'rgba(123,201,231,0.76)');
  body.addColorStop(1, 'rgba(62,145,194,0.20)');
  x.fillStyle = body;
  x.beginPath();
  // Deeper body than the original: it now uses most of the canvas height
  // rather than the middle half, so widening the plane actually widens the
  // FISH instead of just adding transparent margin.
  x.moveTo(23, 48);
  x.bezierCurveTo(45, 20, 88, 10, 132, 16);
  x.bezierCurveTo(160, 20, 184, 31, 206, 41);
  x.bezierCurveTo(213, 44, 218, 47, 224, 48);
  x.bezierCurveTo(217, 49, 212, 52, 205, 55);
  x.bezierCurveTo(181, 65, 157, 78, 130, 82);
  x.bezierCurveTo(88, 88, 44, 71, 23, 48);
  x.closePath();
  x.fill();

  x.filter = 'blur(0.35px)';
  x.fillStyle = 'rgba(205,241,249,0.38)';
  x.beginPath();
  x.moveTo(55, 36);
  x.bezierCurveTo(92, 18, 138, 20, 176, 38);
  x.bezierCurveTo(145, 33, 104, 30, 67, 43);
  x.closePath();
  x.fill();

  x.fillStyle = 'rgba(92,180,219,0.72)';
  x.beginPath();
  x.moveTo(38, 48);
  x.lineTo(7, 17);
  x.lineTo(17, 46);
  x.lineTo(4, 79);
  x.lineTo(41, 55);
  x.closePath();
  x.fill();

  const highlight = x.createRadialGradient(167, 40, 2, 167, 42, 45);
  highlight.addColorStop(0, 'rgba(240,251,255,0.60)');
  highlight.addColorStop(0.55, 'rgba(204,241,249,0.22)');
  highlight.addColorStop(1, 'rgba(204,241,249,0)');
  x.fillStyle = highlight;
  x.beginPath();
  x.ellipse(165, 42, 48, 22, 0, 0, Math.PI * 2);
  x.fill();

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const _pos = new Vector3();
const _prev = new Vector3();
const _next = new Vector3();
const _vel = new Vector3();
const _scl = new Vector3();
const _mat = new Matrix4();
const _q = new Quaternion();
const _bank = new Quaternion();
const FORWARD = new Vector3(1, 0, 0);

export class FishSheet {
  constructor(config, quality, rng) {
    const uw = config.underwater;
    const R = (a, b) => a + rng() * (b - a);

    // [count, scale, opacity, depth, speedMult]
    const layers = uw.sheetLayers ?? [
      [170, 0.38, 0.40, 0, 1],
      [130, 0.31, 0.32, 3.2, 0.9],
      [100, 0.26, 0.26, -3.8, 0.82],
      [75, 0.21, 0.20, 6.4, 0.74],
    ];
    const S = uw.sheetScale ?? 1;         // scales the whole orbit
    const fishScale = uw.sheetSize ?? 1;  // scales the fish, independent of it
    const speed = uw.sheetSpeed ?? 0.18;
    const q = quality.underwaterScale;

    this.fish = [];
    const opacities = [];
    for (const [count, scale, opacity, depth, speedMult] of layers) {
      const n = Math.round(count * q);
      for (let i = 0; i < n; i++) {
        this.fish.push({
          a: rng() * Math.PI * 2,
          rx: 24 * S * R(0.88, 1.12),
          ry: 12 * S * R(0.88, 1.12),
          z: (depth + R(-2, 2)) * S,
          speed: speed * speedMult * R(0.78, 1.25),
          phase: rng() * Math.PI * 2,
          scale: scale * fishScale * R(0.75, 1.25),
          quat: new Quaternion(),
        });
        opacities.push(opacity * R(0.88, 1.18));
      }
    }
    const count = this.fish.length;

    // Plane aspect drives how fat the fish reads. The old 2.75 combined with
    // the 2.32 horizontal scale below gave ~4.9:1 — a needle. Keep this and
    // the scale in step: on-screen ratio is sheetAspect * (1.6 / 1.3).
    const geometry = new PlaneGeometry(uw.sheetAspect ?? 1.9, 1);
    geometry.setAttribute(
      'aOpacity',
      new InstancedBufferAttribute(new Float32Array(opacities), 1),
    );

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG
        .replace('__NOISE__', NOISE_CHUNK)
        .replace('__FOG__', FOG_CHUNK),
      uniforms: {
        uSprite: { value: createFishTexture() },
        uFogColor: { value: linearColor(config.palette.fogNearUnderwater) },
        uFogDensity: { value: uw.fogDensity },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    this.mesh = new InstancedMesh(geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // sheetZ is meters ahead of the rush's LANDING pose — the same origin the
    // journey's waypoint dz values use.
    this.mesh.position.set(
      uw.sheetOffsetX ?? 0,
      -uw.floorDepth + (uw.sheetHeight ?? 24),
      (uw.sheetAnchorZ ?? -126) - (uw.sheetZ ?? 200),
    );
    this._tiltX = uw.sheetTiltX ?? -0.20;                    // radians
    this._tiltZ = ((uw.sheetTiltZ ?? -30) * Math.PI) / 180;  // degrees
    this._drift = uw.sheetDrift ?? 1;
    this._turn = uw.sheetTurn ?? 0.075;   // slerp rate — lower = lazier turns
    this._bankAmt = uw.sheetBank ?? 0.12;

    this._config = config;
    this._quality = quality;
    this._rng = rng;
    this._last = 0;
  }

  /**
   * The orbit. Extra harmonics keep it from reading as a plain ellipse.
   * `timeTerm` is the time-only harmonic (identical for _pos/_prev/_next
   * within one fish/frame) precomputed once by the caller — same value,
   * just not recomputed three times. `a2` (the `a*2+phase` harmonic shared
   * by the x and z components) is likewise hoisted to a local instead of
   * being evaluated twice per call. Output is numerically identical to the
   * original per-call formula, just without the redundant Math.sin() calls.
   */
  _at(d, timeTerm, a, out) {
    const a2 = a * 2 + d.phase;
    const sinA2 = Math.sin(a2);
    return out.set(
      Math.cos(a) * d.rx + sinA2 * 2,
      Math.sin(a) * d.ry + Math.sin(a * 3 + d.phase) * 0.75,
      d.z + sinA2 * 1.2 + timeTerm,
    );
  }

  update(time) {
    const dt = Math.min(Math.max(time - this._last, 0), 0.033);
    this._last = time;

    for (let i = 0; i < this.fish.length; i++) {
      const d = this.fish[i];
      d.a += d.speed * dt;

      // Shared across the pos/prev/next samples below (they all use the same
      // `time`, only `a` differs) — compute once instead of three times.
      const timeTerm = Math.sin(time * 0.5 + d.phase) * 0.45;

      this._at(d, timeTerm, d.a, _pos);

      // True 3D tangent, sampled either side of the current angle. Using the
      // analytic ellipse derivative would miss the harmonics above.
      const e = 0.003;
      this._at(d, timeTerm, d.a - e, _prev);
      this._at(d, timeTerm, d.a + e, _next);
      _vel.subVectors(_next, _prev).normalize();

      _q.setFromUnitVectors(FORWARD, _vel);
      // Bank into the turn, about the direction of travel.
      const bank = Math.sin(d.a * 0.9 + d.phase) * this._bankAmt
        + Math.sin(time * 1.4 + d.phase) * 0.045;
      _bank.setFromAxisAngle(_vel, bank);
      _q.multiply(_bank);
      // Slerp rather than snap, so turns carry momentum.
      d.quat.slerp(_q, this._turn);

      const breathe = 1 + Math.sin(time * 1.8 + d.phase) * 0.045;
      _scl.set(d.scale * 1.6 * breathe, d.scale * 1.30 * breathe, d.scale * breathe);

      _mat.compose(_pos, d.quat, _scl);
      this.mesh.setMatrixAt(i, _mat);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.mesh.rotation.x = this._tiltX + Math.sin(time * 0.05) * 0.015 * this._drift;
    this.mesh.rotation.z = this._tiltZ + Math.cos(time * 0.04) * 0.012 * this._drift;
  }

  /** Live-apply tuner values; rebuild only when layout actually changed. */
  applyLive(uw, keys = []) {
    this.mesh.position.set(
      uw.sheetOffsetX,
      -uw.floorDepth + uw.sheetHeight,
      (uw.sheetAnchorZ ?? -126) - uw.sheetZ,
    );
    this._tiltX = uw.sheetTiltX;
    this._tiltZ = (uw.sheetTiltZ * Math.PI) / 180;
    this._drift = uw.sheetDrift;
    this._turn = uw.sheetTurn;
    this._bankAmt = uw.sheetBank;
    if (keys.some((k) => k === 'sheetScale' || k === 'sheetSize' || k === 'sheetSpeed')) {
      const S = uw.sheetScale / (this._appliedScale ?? uw.sheetScale);
      for (const d of this.fish) {
        d.rx *= S; d.ry *= S; d.z *= S;
      }
      this._appliedScale = uw.sheetScale;
      const sizeK = uw.sheetSize / (this._appliedSize ?? uw.sheetSize);
      for (const d of this.fish) d.scale *= sizeK;
      this._appliedSize = uw.sheetSize;
      const spdK = uw.sheetSpeed / (this._appliedSpeed ?? uw.sheetSpeed);
      for (const d of this.fish) d.speed *= spdK;
      this._appliedSpeed = uw.sheetSpeed;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.uniforms.uSprite.value.dispose();
    this.material.dispose();
  }
}