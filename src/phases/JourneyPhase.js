import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, damp, degToRad, segmentProgress } from '../utils/math.js';

const UP = new Vector3(0, 1, 0);

// Phase 5: the scroll journey. The camera swims a Catmull-Rom spline through
// the seabed corridor. Waypoints are authored in config as offsets relative
// to wherever the rush actually landed — tuning the rush never breaks the
// journey. Scroll progress maps to arc-length position on the curve (uniform
// speed); the gaze aims at a point further ALONG the curve, so the camera
// looks into the turns like a swimmer, not down a rail.

export class JourneyPhase {
  constructor({ camera, config, reducedMotion }) {
    this.camera = camera;
    this.config = config;
    this.reducedMotion = reducedMotion;

    this.segment = config.segments.underwater;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.t = 0;          // smoothed position along the curve (0..1)
    this.ready = false;

    this._pos = new Vector3();
    this._look = new Vector3();
    this._dir = new Vector3();
    this._right = new Vector3();
    this._target = new Vector3();

    // Handoff blend: the rush hands off a specific gaze direction (wherever
    // the camera actually ended up facing), but the curve's own tangent at
    // t=0 is an authored direction that rarely matches it exactly. Blending
    // FROM the real arrival direction INTO the curve's direction over
    // journey.handoffBlend seconds turns what used to be an instant snap
    // into a smooth settle — position was already continuous; this fixes
    // the view direction the same way.
    this._arrivalDir = null;
    this._handoffElapsed = 0;
  }

  /**
   * Build the spline from config waypoints, anchored at the arrival pose.
   * @param {Vector3} arrivalPos  camera position where the rush ended
   * @param {Vector3} [arrivalDir]  camera's actual facing direction there —
   *   blended out over journey.handoffBlend seconds (see constructor note).
   */
  init(arrivalPos, arrivalDir) {
    const uw = this.config.underwater;
    const points = this.config.journey.waypoints.map(
      (w) => new Vector3(
        arrivalPos.x + w.x,
        -(uw.floorDepth - w.h),
        arrivalPos.z - w.dz
      )
    );
    this.curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    this.curve.updateArcLengths();
    this.t = 0;
    this.ready = true;
    this._arrivalDir = arrivalDir && arrivalDir.lengthSq() > 0 ? arrivalDir.clone().normalize() : null;
    this._handoffElapsed = 0;
  }

  onPointerMove(nx, ny) {
    this.mouse.x = nx;
    this.mouse.y = ny;
  }

  update(dt, elapsed, progress) {
    if (!this.ready) return;
    const cam = this.camera;

    // Scroll → smoothed arc-length position.
    const target = segmentProgress(progress, this.segment);
    this.t = damp(this.t, target, 3.5, dt);
    const t = clamp(this.t, 0, 1);

    // Swim feel: gentle neutral-buoyancy bob + smoothed mouse look.
    const sway = this.reducedMotion ? 0.05 : 0.32;
    const bob = Math.sin(elapsed * 0.5) * sway + Math.sin(elapsed * 0.9) * sway * 0.35;
    const parallax = this.reducedMotion ? 0 : 1;
    this.mouse.sx = damp(this.mouse.sx, this.mouse.x * parallax, 2.5, dt);
    this.mouse.sy = damp(this.mouse.sy, this.mouse.y * parallax, 2.5, dt);

    this.curve.getPointAt(t, this._pos);
    this.curve.getPointAt(Math.min(t + this.config.journey.lookAhead, 1), this._look);

    cam.position.set(this._pos.x, this._pos.y + bob, this._pos.z);

    // ANGLE-based mouse look, hard-clamped: the gaze can deviate at most
    // maxLookYaw/maxLookPitch degrees from the path direction — never spins.
    this._dir.copy(this._look).sub(this._pos).normalize();

    // Handoff blend (see constructor/init comments): ease FROM the rush's
    // actual arrival direction INTO the curve's own tangent, instead of
    // snapping to it on the very first frame.
    if (this._arrivalDir) {
      this._handoffElapsed += dt;
      const blendDur = this.config.journey.handoffBlend ?? 0.7;
      if (this._handoffElapsed >= blendDur) {
        this._arrivalDir = null; // blend finished — stop paying for it
      } else {
        const k = clamp(this._handoffElapsed / blendDur, 0, 1);
        const eased = k * k * (3 - 2 * k); // smoothstep
        this._dir.lerpVectors(this._arrivalDir, this._dir, eased).normalize();
      }
    }

    const yaw = degToRad(this.config.camera.maxLookYaw) * -this.mouse.sx;
    const pitch = degToRad(this.config.camera.maxLookPitch) * -this.mouse.sy;
    this._right.crossVectors(this._dir, UP).normalize();

    const wantFov = this.config.journey.fov ?? this.config.camera.fov;
    if (Math.abs(cam.fov - wantFov) > 0.01) {
      cam.fov = damp(cam.fov, wantFov, this.config.journey.fovEase ?? 1.6, dt);
      cam.updateProjectionMatrix();
    }
    this._dir.applyAxisAngle(this._right, pitch).applyAxisAngle(UP, yaw);
    this._target.copy(cam.position).addScaledVector(this._dir, 60);
    this._target.y += bob * 0.5;
    cam.lookAt(this._target);
  }
}