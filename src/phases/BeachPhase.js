import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp, segmentProgress } from '../utils/math.js';

// Phase 0: the beach. A looping video backdrop with a 3D logo over it; the
// camera flies into the logo as you scroll, then a white flash hands over to
// the ocean.
//
// This renders on its OWN canvas layered above the main one, rather than
// joining the shared scene. Two reasons: the ocean's post pipeline (bloom,
// grade, vignette) is tuned for underwater and would fight this, and the
// backdrop is a DOM <video>, which has to sit behind a transparent canvas
// anyway. The whole layer is disposed the moment the handoff completes, so
// the second WebGL context only exists during the opening.

const smooth = (t) => t * t * (3 - 2 * t);

export class BeachPhase {
  /**
   * @param {object}      o
   * @param {HTMLElement} o.container  where to mount (the intro's root)
   * @param {object}      o.config     merged DEFAULTS
   * @param {object}      [o.quality]  resolved Quality tier (see Quality.js) —
   *   used only to cap pixel ratio the same way the main renderer does, so
   *   this layer doesn't render at full native resolution on tiers that have
   *   already decided to render everything else at a lower one.
   * @param {boolean}     o.reducedMotion
   */
  constructor({ container, config, quality, reducedMotion }) {
    this.config = config;
    this.reducedMotion = reducedMotion;
    this.segment = config.segments.beach ?? [0, 0.1];
    this.done = false;
    this._outT = null;
    this._t0 = null;

    const b = config.beach ?? {};
    this.beach = b;

    // ---- DOM layer -------------------------------------------------------
    const root = document.createElement('div');
    root.style.cssText = `
      position:absolute; inset:0; overflow:hidden;
      z-index:2; pointer-events:none;`;

    const video = document.createElement('video');
    video.src = b.video ?? '/new.mp4';
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = `
      position:absolute; inset:0; width:100%; height:100%;
      object-fit:cover; display:block;
      filter:${b.videoFilter ?? 'brightness(0.85) saturate(0.9)'};`;
    // Autoplay can be refused before any user gesture; failing silently is
    // correct here — the logo and flash still carry the sequence.
    video.play?.().catch(() => {});

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      display:block;`;

    const flash = document.createElement('div');
    flash.style.cssText = `
      position:absolute; inset:0; background:#fff; opacity:0;`;

    root.append(video, canvas, flash);
    container.appendChild(root);

    this.root = root;
    this.video = video;
    this.flash = flash;

    // ---- WebGL -----------------------------------------------------------
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    // Same cap the main renderer resolves via Quality.js, so `medium`/`low`
    // tiers (which already chose a lower resolution everywhere else) aren't
    // silently rendering this layer at full native resolution regardless.
    // On `high` tier this is still 2 — same as before, no change there.
    const pixelRatioCap = quality?.pixelRatioCap ?? 2;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap));
    this.renderer.setClearColor(0x000000, 0);
    // NEW: shadows. The backdrop is a <video>, so nothing in the DOM can
    // receive a shadow — the trick is a ShadowMaterial plane, which renders
    // ONLY where light is blocked and is otherwise fully transparent, letting
    // the video show through everywhere else.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(b.fov ?? 42, 1, 0.01, 100);

    this.scene.add(new AmbientLight(0xffffff, b.ambient ?? 1.1));
    const key = new DirectionalLight(0xffffff, b.keyLight ?? 1.6);
    // NEW: sun position defaults upper-LEFT and in front, so the shadow throws
    // down and to the right, matching where the sun sits in the plate.
    key.position.set(...(b.sunPos ?? b.keyLightPos ?? [-5, 6, 3]));
    key.castShadow = true;
    const span = b.shadowSpan ?? 8;
    key.shadow.camera.left = -span;
    key.shadow.camera.right = span;
    key.shadow.camera.top = span;
    key.shadow.camera.bottom = -span;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.mapSize.set(b.shadowMapSize ?? 1024, b.shadowMapSize ?? 1024);
    key.shadow.bias = b.shadowBias ?? -0.0012;
    key.shadow.radius = b.shadowSoftness ?? 4;
    key.target.position.set(0, 0, 0);
    this.scene.add(key, key.target);
    this.sun = key;

    // NEW: the sand. Invisible except where the logo blocks the sun.
    const ground = new Mesh(
      new PlaneGeometry(b.groundSize ?? 60, b.groundSize ?? 60),
      new ShadowMaterial({ opacity: b.shadowOpacity ?? 0.34, transparent: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    // Sits where the real sand meets the logo's base in the plate. This is the
    // alignment dial: too high and the shadow climbs the logo, too low and it
    // falls out of frame.
    ground.position.y = b.groundY ?? -2.4;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    this.logo = null;
    this._loadLogo(b);

    // Pointer tilt. Reuses App's single global pointermove listener (passed
    // into update() each frame as `pointerNdc`) rather than registering a
    // second one here — same NDC coordinate formula App already computes,
    // so there's no behavior change, just one fewer duplicate listener.
    this._tilt = { x: 0, y: 0 };

    // Flight path, computed once. The model is centred on the origin in
    // _loadLogo, so the camera closes to just short of the centre, then
    // continues THROUGH and out the far side. The old 8 -> 6.5 travel could
    // never do that: it stopped well short of the logo.
    this._from = new Vector3(...(b.cameraStart ?? [0, 0, 8]));
    this._dir = new Vector3().sub(this._from).normalize();
    this._approach = new Vector3().addScaledVector(this._dir, -(b.approachGap ?? 0.5));
    this._through = new Vector3().addScaledVector(this._dir, b.passDistance ?? 5);
    this._lookAt = new Vector3().addScaledVector(this._dir, b.lookDistance ?? 10);
    this._camPos = new Vector3();

    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    this.resize();
  }

  _loadLogo(b) {
    const url = b.logo ?? '/logo.glb';
    new GLTFLoader().load(
      url,
      (gltf) => {
        const logo = gltf.scene;
        // Normalise to a known size and centre on the origin, so the camera
        // positions below hold whatever scale the model was exported at.
        const box = new Box3().setFromObject(logo);
        const size = box.getSize(new Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        logo.scale.setScalar((b.logoSize ?? 4.5) / maxDim);
        box.setFromObject(logo);
        logo.position.sub(box.getCenter(new Vector3()));
        // NEW: every mesh in the model throws a shadow.
        logo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(logo);
        this.logo = logo;
      },
      undefined,
      (err) => console.warn('[OceanIntro] beach logo failed to load:', url, err),
    );
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param {number} progress  global 0..1 scroll progress
   * @param {number} elapsed   seconds
   * @param {{x:number,y:number}|null} pointerNdc  App's shared pointer NDC
   *   (same {x,y} formula this phase used to compute itself)
   * @returns {boolean} true once the handover is complete — App uses this to
   *   dispose the layer.
   */
  update(progress, elapsed, pointerNdc) {
    if (this.done) return true;
    const b = this.beach;

    // Local 0..1 across the beach segment. Everything below is expressed in
    // fractions OF THIS, so retiming the segment retimes the whole scene.
    const p = segmentProgress(progress, this.segment);

    const flyStart = b.flyStart ?? 0.35;
    const flyEnd = b.flyEnd ?? 0.9;
    const fly = clamp((p - flyStart) / (flyEnd - flyStart), 0, 1);
    // Flash is keyed to the FLIGHT, not the segment — so it always fires at
    // the same point in the pass-through however flyStart/flyEnd are retimed.
    // `mid` is the moment the camera reaches the centre, so anything past it
    // is measured as a fraction of the punch-through itself.
    const midF = b.flyMid ?? 0.6;
    const through = clamp((fly - midF) / (1 - midF), 0, 1);  // 0 at centre, 1 out the far side
    const flashAt = b.flashAt ?? 0.8;
    const flash = smooth(clamp((through - flashAt) / (1 - flashAt), 0, 1));

    // Two stages, split at flyMid. The first closes the distance and is the
    // part you watch; the second punches through the centre and keeps going,
    // so the logo sweeps past the lens rather than the camera parking inside it.
    const mid = b.flyMid ?? 0.6;
    if (fly <= mid) {
      this._camPos.lerpVectors(this._from, this._approach, smooth(fly / mid));
    } else {
      this._camPos.lerpVectors(this._approach, this._through, smooth((fly - mid) / (1 - mid)));
    }
    this.camera.position.copy(this._camPos);
    // Look PAST the logo, never AT it — aiming at the centre would swing the
    // view 180 degrees the instant you cross it.
    this.camera.lookAt(this._lookAt);

    const vz = 1 + fly * (b.videoZoom ?? 0.35);
    this.video.style.transform = `scale(${vz.toFixed(4)})`;

    const blur = fly * (b.videoBlur ?? 6);
    this.video.style.filter =
      `${b.videoFilter ?? 'brightness(0.85) saturate(0.9)'} blur(${blur.toFixed(1)}px)`;

    // NEW: once the camera is past the logo the ground plane is behind the
    // lens and its shadow is meaningless; fading it also stops the plane
    // clipping the near plane as you punch through.
    if (this.ground) {
      const gk = 1 - smooth(clamp((fly - (b.shadowFadeAt ?? 0.55)) / 0.35, 0, 1));
      this.ground.material.opacity = (b.shadowOpacity ?? 0.34) * gk;
      this.ground.visible = gk > 0.01;
    }

    if (this.logo) {
      // Pointer tilt, easing to zero as the dive commits — a logo still
      // reacting to the mouse while you fly through it reads as detached.
      const ctrl = this.reducedMotion
        ? 0
        : 1 - smooth(clamp(
            (p - (b.tiltFadeStart ?? 0.5)) / ((b.tiltFadeEnd ?? 0.65) - (b.tiltFadeStart ?? 0.5)),
            0, 1,
          ));
      const max = ((b.tiltMax ?? 25) * Math.PI) / 180;
      const ease = b.tiltEase ?? 0.05;
      const mx = pointerNdc ? pointerNdc.x : 0;
      const my = pointerNdc ? pointerNdc.y : 0;
      this._tilt.x += (my * max * ctrl - this._tilt.x) * ease;
      this._tilt.y += (mx * max * ctrl - this._tilt.y) * ease;
      this.logo.rotation.x = this._tilt.x;
      this.logo.rotation.y = this._tilt.y + elapsed * (b.spin ?? 0);
      // Idle float, default OFF. A logo drifting while the camera is still
      // reads as unanchored — set bob > 0 only if you want a slow breath.
      this.logo.position.y = Math.sin(elapsed * (b.bobSpeed ?? 1.2)) * (b.bob ?? 0) * ctrl;
    }

    // Once fully white, freeze the beach and fade the white OUT over the
    // ocean underneath (which is already rendering). Disposing at peak white
    // is what made the ocean appear instantly: the flash left with it.
    if (flash >= 0.999 && this._outT === null) {
      this._outT = elapsed;
      this.video.style.display = 'none';
      this.renderer.domElement.style.display = 'none';
    }

    if (this._outT !== null) {
      const hold = b.flashHold ?? this.config.reveal.flashHold ?? 0.35;
      const fade = b.flashFade ?? this.config.reveal.flashFade ?? 1.7;
      const t = elapsed - this._outT;
      const out = 1 - clamp((t - hold) / fade, 0, 1);
      this.flash.style.opacity = out.toFixed(3);
      if (out <= 0.001) {
        this.done = true;
        return true;
      }
      return false;
    }

    this.flash.style.opacity = flash.toFixed(3);
    this.renderer.render(this.scene, this.camera);
    return false;
  }

  /** Fade the layer out (the ocean's own flash takes over) and tear down. */
  dispose() {
    removeEventListener('resize', this._onResize);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.root.remove();
  }
}