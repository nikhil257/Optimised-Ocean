import gsap from 'gsap';
import { Vector3 } from 'three';
import { damp, degToRad } from '../utils/math.js';

const UP = new Vector3(0, 1, 0);
const _dir = new Vector3();
const _right = new Vector3();
const _target = new Vector3();

// Phase 3: the dive. Time-driven (CTA click), not scroll-driven. Three beats:
// a short anticipation rise, the plunge through the surface, and a long
// deceleration to rest in open water. The crossing frame (y passes 0) fires
// onCrossed exactly once — App uses it to swap the world state (sky submerge,
// grade crossfade, foam flash, chroma pulse). After arrival the camera holds
// with an idle sway, waiting for scroll (M5 picks up from this rest pose).

export class DivePhase {
  constructor({ camera, config, reducedMotion, onCrossed, onArrived }) {
    this.camera = camera;
    this.config = config;
    this.reducedMotion = reducedMotion;
    this.onCrossed = onCrossed;
    this.onArrived = onArrived;

    this.active = false;
    this.crossed = false;
    this.resting = false;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  }

  start() {
    const cam = this.camera;
    const d = this.config.dive;

    this.origin = { x: cam.position.x };
    this.state = {
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      look: 0,
      roll: 0,
      fov: this.config.camera.fov,
    };
    this.active = true;

    const arrive = () => {
      this.resting = true;
      this.onArrived?.();
    };

    if (this.reducedMotion) {
      // Accessibility path: no plunge flight — a short sink with the same
      // world-state swap, so the destination is identical.
      gsap.to(this.state, {
        y: -d.depth,
        look: -3,
        duration: 0.9,
        ease: 'sine.in',
        onComplete: arrive,
      });
      return;
    }

    const tl = gsap.timeline({ onComplete: arrive });
    // Beat 1: anticipation — a breath upward before committing.
    tl.to(this.state, { y: this.state.y + 6.4, duration: d.anticipation, ease: 'sine.out' })
      // Beat 2: the plunge — accelerate hard into the surface.
      .to(this.state, { y: -1.6, duration: d.plungeDuration, ease: 'power2.in' })
      // Beat 3: decelerate into open water.
      .to(this.state, { y: -d.depth, duration: d.diveSettleDuration, ease: 'power2.out' });

    // Pitch: tip downward through the plunge, level back out while settling.
    tl.to(this.state, {
      look: 25.0,
      duration: d.anticipation,
      ease: 'power1.out',
    }, 0)
      .to(this.state, {
        look: -90,
        duration: d.plungeDuration * 1.0,
        ease: 'sine.in',
      }, d.anticipation)
      .to(this.state, {
        look: -43,
        duration: d.diveSettleDuration + 1.8,
        ease: 'power2.inOut',
      }, d.anticipation + d.plungeDuration * 1.5 - 0.00002);
  }


  startApproach(onDone) {
    if (!this.resting) return;
    const d = this.config.dive;
    const dur = this.reducedMotion ? 1.2 : d.approachDuration;
    const dist = this.reducedMotion ? d.approachDistance * 0.6 : d.approachDistance;

    this.approaching = true;
    this.resting = false;

    const slowDist = dist - 11;
    const rampDist = 11;
    const startZ = this.state.z;   // ← capture ONCE, before building the timeline

    const tl = gsap.timeline({
      onComplete: () => {
        this.approaching = false;
        this.resting = true;
        onDone?.();
      },
    });
    tl.to(this.state, {
      z: startZ - slowDist - rampDist,
      duration: dur,
      ease: 'sine.inOut',
    });
    gsap.to(this.state, { look: -30, duration: dur * 0.6, ease: 'sine.inOut' });
  }

  // /**
  //  * The rush — a descending roller-coaster:
  //  * forward travel + left/right banked weave + CONTINUOUS descent. The camera
  //  * starts sinking immediately, so god rays and particles stream past and
  //  * forward speed is felt (motion through empty water is invisible — the
  //  * passing world is what sells velocity). Ends in a steep final drop to the
  //  * seabed arrival pose where M5 begins.
  //  *
  //  * TIMING: total length = currentDuration + dropDuration + settleDuration
  //  * (all in config.dive). Stretch any of the three; everything else — the
  //  * darkness, the grade, the weave — rides those same values automatically.
  //  */
  // startRush(onDone) {
  //   if (this.rushing || !this.resting) return;
  //   const d = this.config.dive;
  //   const uw = this.config.underwater;
  //   const baseFov = this.config.camera.fov;
  //   const midY = -(uw.floorDepth * 0.4);                  // depth reached while weaving
  //   const arrivalY = -(uw.floorDepth - d.arrivalHeight);  // final seabed pose
  //   this.resting = false;
  //   this.rushing = true;

  //   const done = () => {
  //     this.rushing = false;
  //     this.resting = true;
  //     onDone?.();
  //   };

  //   if (this.reducedMotion) {
  //     gsap.to(this.state, {
  //       y: arrivalY,
  //       z: this.state.z - d.forwardDistance,
  //       duration: 1.6,
  //       ease: 'power2.inOut',
  //       onComplete: done,
  //     });
  //     return;
  //   }

  //   const cur = d.currentDuration;
  //   const drop = d.dropDuration;
  //   const settle = d.settleDuration;
  //   const bank = d.bankAngle;
  //   const sweep = d.sweepWidth;
  //   const total = cur + drop + settle;

  //   const tl = gsap.timeline({ onComplete: done });

  //   // tl.to(this.state, { fov: baseFov + d.rushFovKick, duration: 0.6, ease: 'power2.out' }, 0)
  //   tl.to(this.state, { fov: baseFov + d.rushFovKick, duration: 1.3, ease: 'sine.inOut' }, 0)
  //     // Gaze tips forward-down: you SEE the descent ahead of you.
  //     .to(this.state, { look: -24, duration: cur * 0.6, ease: 'power2.inOut' }, 0)
  //     // One continuous forward glide across the whole ride.
  //     .to(this.state, { z: this.state.z - d.forwardDistance, duration: total, ease: 'power1.out' }, 0)

  //     // Descent, phase 1: sink to mid-column WHILE weaving (the coaster).
  //     .to(this.state, { y: midY, duration: cur, ease: 'power1.in' }, 0)
  //     // Descent, phase 2: the steep drop — to just above the arrival pose…
  //     .to(this.state, { y: arrivalY + 7, duration: drop, ease: 'power2.in' }, cur)
  //     // …phase 3: the touchdown — final meters decelerate to a soft landing.
  //     .to(this.state, { y: arrivalY, duration: settle + 0.3, ease: 'power3.out' }, cur + drop)

  //     // The banked weave: left → right → left, easing out through the drop.
  //     .to(this.state, { x: this.origin.x - sweep, roll: bank, duration: cur * 0.35, ease: 'power2.inOut' }, 0.05)
  //     .to(this.state, { x: this.origin.x + sweep, roll: -bank, duration: cur * 0.4, ease: 'power2.inOut' }, 0.05 + cur * 0.35)
  //     .to(this.state, { x: this.origin.x - sweep * 0.55, roll: bank * 0.6, duration: cur * 0.25 + drop * 0.35, ease: 'power2.inOut' }, 0.05 + cur * 0.75)
  //     .to(this.state, { x: this.origin.x + sweep * 0.1, roll: 0, duration: drop * 0.65, ease: 'power2.out' }, cur + drop * 0.35)

  //     // Pitch hard down for the final drop, then level into arrival.
  //     .to(this.state, { look: -140, duration: drop * 0.5, ease: 'power2.in' }, cur)
  //     .to(this.state, { look: -3, duration: settle + 0.4, ease: 'power2.out' }, cur + drop * 0.75)
  //     .to(this.state, { fov: baseFov, duration: settle + 0.4, ease: 'power2.inOut' }, cur + drop * 0.6);
  // }


  /**
   * The rush — now driven entirely by config.dive.rushPath, a declarative
   * waypoint list. Nothing about the shape of the ride is hardcoded here;
   * edit the waypoints in defaults.js instead.
   *
   * WAYPOINT FIELDS (all optional except `t`):
   *   t       0..1 position in the rush's total duration
   *   x       lateral offset, in MULTIPLES of dive.sweepWidth
   *             (-1 = full left, +1 = full right)
   *   depth   0..1 vertical progress: 0 = start height, 1 = seabed arrival
   *             (>1 dips below arrival, <0 rises above the start)
   *   forward 0..1 fraction of dive.forwardDistance travelled
   *   roll    banking, in MULTIPLES of dive.bankAngle
   *   look    gaze slope (angle ≈ atan(look/120): -24 ≈ 11° down, -140 ≈ 49°)
   *   fov     FOV offset, in MULTIPLES of dive.rushFovKick
   *   ease    easing for the segment leading INTO this waypoint
   *
   * Because x/roll/fov are multipliers, sweepWidth / bankAngle / rushFovKick
   * still work as global intensity dials over the whole authored path.
   */
  startRush(onDone) {
    if (this.rushing || !this.resting) return;
    const d = this.config.dive;
    const uw = this.config.underwater;
    const baseFov = this.config.dive.rushFov ?? this.config.camera.fov;
    this.resting = false;
    this.rushing = true;

    const done = () => {
      this.rushing = false;
      this.resting = true;
      onDone?.();
    };

    const startX = this.origin.x;
    const startY = this.state.y;
    const startZ = this.state.z;
    const arrivalY = -(uw.floorDepth - d.arrivalHeight);
    const total = d.currentDuration + d.dropDuration + d.settleDuration;

    // Absolute world x the rush's LAST waypoint should land on (the journey's
    // first waypoint is anchored to wherever this ends up, so setting this is
    // enough to move both the tunnel's end and the journey's start together).
    // Defaults to wherever the dive started (old behavior) if not set.
    const arrivalX = d.arrivalX ?? startX;

    if (this.reducedMotion) {
      gsap.to(this.state, {
        x: arrivalX,
        y: arrivalY,
        z: startZ - d.forwardDistance,
        roll: 0,
        look: -3,
        fov: baseFov,
        duration: 1.6,
        ease: 'power2.inOut',
        onComplete: done,
      });
      return;
    }

// FOV blends from the rush's wide value to the ocean's over the tail of
    // the ride, so it is ALREADY at the target when the journey takes over.
    // Doing it after arrival is what produced the snap: the rush ended at
    // rushFov and the journey then had to travel the whole way on its own.
    const endFov = this.config.journey.fov ?? this.config.camera.fov;
    const blendFrom = d.fovBlendStart ?? 0.7;   // fraction of the rush
    const baseFovAt = (t) => {
      const k = Math.min(Math.max((t - blendFrom) / (1 - blendFrom), 0), 1);
      return baseFov + (endFov - baseFov) * (k * k * (3 - 2 * k)); // smoothstep
    };

    // Shift the WHOLE weave sideways by a constant so its shape/timing is
    // untouched — only translated — while its last waypoint lands exactly on
    // arrivalX instead of wherever the dive happened to start.
    const path0 = d.rushPath ?? [];
    const lastWpX = (path0[path0.length - 1]?.x ?? 0) * d.sweepWidth;
    const baseX = arrivalX - lastWpX;

    const resolve = (wp) => ({
      x: baseX + (wp.x ?? 0) * d.sweepWidth,
      y: startY + (arrivalY - startY) * (wp.depth ?? 0),
      z: startZ - d.forwardDistance * (wp.forward ?? 0),
      roll: (wp.roll ?? 0) * d.bankAngle,
      look: wp.look ?? -3,
      fov: baseFovAt(wp.t ?? 0) + (wp.fov ?? 0) * d.rushFovKick,
    });

    const path = d.rushPath ?? [];
    if (path.length < 2) {
      console.warn('[OceanIntro] dive.rushPath needs at least 2 waypoints');
      done();
      return;
    }

    const tl = gsap.timeline({ onComplete: done });
    let prevT = path[0].t ?? 0;

    // Snap to the first waypoint's pose so the path starts where it declares.
    // Object.assign(this.state, resolve(path[0]));
        const first = resolve(path[0]);
    const firstFov = first.fov;
    delete first.fov;
    Object.assign(this.state, first);
    gsap.to(this.state, {
      fov: firstFov,
      duration: Math.max(d.fovEaseIn ?? 1, 0.001),
      ease: 'sine.inOut',
      overwrite: 'auto',
    });

    for (let i = 1; i < path.length; i++) {
      const wp = path[i];
      const segT = (wp.t ?? 0) - prevT;
      const duration = Math.max(segT * total, 0.001);
      tl.to(this.state, {
        ...resolve(wp),
        duration,
        ease: wp.ease ?? 'power1.inOut',
      });
      prevT = wp.t ?? prevT;
    }
  }

  onPointerMove(nx, ny) {
    this.mouse.x = nx;
    this.mouse.y = ny;
  }

  _fireCrossing() {
    this.crossed = true;
    this.onCrossed?.();

    if (this.reducedMotion) return;
    // Impact: a quick FOV punch that recovers as the water absorbs momentum.
    const d = this.config.dive;
    gsap.timeline()
      .to(this.state, { fov: this.config.camera.fov + d.fovKick, duration: 0.16, ease: 'power2.out' })
      .to(this.state, { fov: this.config.camera.fov, duration: 0.9, ease: 'power2.inOut' });
  }

  update(dt, elapsed) {
    if (!this.active) return;
    const cam = this.camera;

    if (!this.crossed && this.state.y <= 0) this._fireCrossing();

    // At rest: slow neutral-buoyancy sway + gentle mouse look.
    // const restT = this.resting ? 1 : 0;
    // const restT = (this.resting || this.approaching) ? 1 : 0;
    const restTarget = (this.resting || this.approaching) ? 1 : 0;
    this._restT = damp(this._restT ?? 0, restTarget, 6, dt);
    const restT = this._restT;
    const sway = this.reducedMotion ? 0.06 : 0.4;
    const bobY = restT * (Math.sin(elapsed * 0.5) * sway + Math.sin(elapsed * 0.9) * sway * 0.35);
    const swayX = restT * Math.sin(elapsed * 0.32) * sway * 1.4;

    // Rush weave: swimming, not gliding on a rail. Damped mix ramps the
    // weave in and out smoothly at the rush's ends.
    this._rushMix = damp(this._rushMix ?? 0, this.rushing ? 1 : 0, 3, dt);
    const weaveX = Math.sin(elapsed * 2.1) * 0.55 * this._rushMix;
    const weaveY = Math.sin(elapsed * 3.2) * 0.3 * this._rushMix;

    const parallax = this.reducedMotion ? 0 : restT;
    this.mouse.sx = damp(this.mouse.sx, this.mouse.x * parallax, 2.5, dt);
    this.mouse.sy = damp(this.mouse.sy, this.mouse.y * parallax, 2.5, dt);

    cam.position.set(
      this.state.x + swayX + weaveX,
      this.state.y + bobY + weaveY,
      this.state.z
    );
    // Base gaze along the path, then angle-clamped mouse deviation
    // (max ±maxLookYaw / ±maxLookPitch degrees — never a free 360 look).
    _dir.set(
      (swayX + weaveX * 1.6) - (swayX + weaveX),
      this.state.look,
      -120
    ).normalize();
    const mYaw = degToRad(this.config.camera.maxLookYaw) * -this.mouse.sx * restT;
    const mPitch = degToRad(this.config.camera.maxLookPitch) * -this.mouse.sy * restT;
    _right.crossVectors(_dir, UP).normalize();
    _dir.applyAxisAngle(_right, mPitch).applyAxisAngle(UP, mYaw);
    _target.copy(cam.position).addScaledVector(_dir, 120);
    cam.lookAt(_target);
    // Banking: roll around the view axis — applied after lookAt so the
    // current's sweep tilts the horizon like a body carried by water.
    if (this.state.roll !== 0) cam.rotateZ(degToRad(this.state.roll));

    if (cam.fov !== this.state.fov) {
      cam.fov = this.state.fov;
      cam.updateProjectionMatrix();
    }
  }
}