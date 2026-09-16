import { Vector3 } from 'three';
import gsap from 'gsap';
import { damp, degToRad, segmentProgress } from '../utils/math.js';

// Phase 1: the reveal after the white flash, then a slow forward drift over
// the water as the user scrolls through the phase's segment. The camera rig is
// a simple position + look-target pair; Theatre.js takes over authorship of
// this rig in the dive/underwater milestones without changing this interface.

export class OceanPhase {
  constructor({ camera, config, reducedMotion }) {
    this.camera = camera;
    this.config = config;
    this.reducedMotion = reducedMotion;

    this.segment = config.segments.oceanReveal;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };

    // Reveal state: camera starts high and slightly pitched down (as if just
    // shot out of the logo), settles to cruise height during the flash fade.
    this.settle = { t: reducedMotion ? 1 : 0 };
    this.basePos = new Vector3(0, config.camera.height, 0);
    this.lookAhead = new Vector3();
  }

  enter() {
    const { settleDuration } = this.config.reveal;
    if (!this.reducedMotion) {
      gsap.to(this.settle, { t: 1, duration: settleDuration, ease: 'power3.out' });
    }
  }

  onPointerMove(nx, ny) {
    this.mouse.x = nx;
    this.mouse.y = ny;
  }

  update(dt, elapsed, progress) {
    const cam = this.camera;
    const cfg = this.config.camera;
    const local = segmentProgress(progress, this.segment);

    // Smooth the mouse for parallax.
    const parallax = this.reducedMotion ? 0 : 1;
    this.mouse.sx = damp(this.mouse.sx, this.mouse.x * parallax, 3.5, dt);
    this.mouse.sy = damp(this.mouse.sy, this.mouse.y * parallax, 3.5, dt);

    // Settle move: 26m up / pitched down → cruise height near the water.
    const settleEase = this.settle.t;
    const height = cfg.height + (1 - settleEase) * 26;
    const pitchDown = (1 - settleEase) * -0.5; // radians-ish, folded into look target

    // Scroll drift: dolly forward across the phase segment.
    const z = -local * cfg.driftDistance;

    // Gentle idle bob so the ocean never feels frozen even without input.
    const bobAmp = this.reducedMotion ? 0.05 : 0.22;
    const bob = Math.sin(elapsed * 0.5) * bobAmp + Math.sin(elapsed * 0.83) * bobAmp * 0.4;

    cam.position.set(
      this.mouse.sx * 1.6,
      height + bob,
      z
    );

    this.lookAhead.set(
      this.mouse.sx * Math.tan(degToRad(cfg.mouseYaw)) * 60,
      height + bob + pitchDown * 40 - 1.2 - this.mouse.sy * Math.tan(degToRad(cfg.mousePitch)) * 60,
      z - 120
    );
    cam.lookAt(this.lookAhead);
  }
}
