import {
  Clock,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import gsap from 'gsap';

import { resolveQuality } from './Quality.js';
import { ScrollEngine } from './ScrollEngine.js';
import { BeachPhase } from '../phases/BeachPhase.js';
import { OceanSurface } from '../world/ocean/OceanSurface.js';
import { SkyDome } from '../world/sky/SkyDome.js';
import { UnderwaterWorld } from '../world/underwater/UnderwaterWorld.js';
import { RushTunnel } from '../world/underwater/RushTunnel.js';
import { PostPipeline } from '../post/PostPipeline.js';
import { OceanPhase } from '../phases/OceanPhase.js';
import { DivePhase } from '../phases/DivePhase.js';
import { JourneyPhase } from '../phases/JourneyPhase.js';
import { UIManager } from '../ui/UIManager.js';
import { StoryBeats } from '../ui/StoryBeats.js';
import { SheetTuner } from '../ui/Sheettuner.js';
import { degToRad } from '../utils/math.js';
import { RushSwirl } from '../world/underwater/RushSwirl.js';

export class App {
  constructor(config, dom) {
    this.config = config;
    this.dom = dom;
    this.listeners = { complete: [] };

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quality = resolveQuality(config.quality);

    if (config.debug) {
      console.info('[OceanIntro] quality tier:', this.quality.tier, this.quality);
    }

    this._setupRenderer();
    this._setupScene();
    this._setupInput();
    this._setupUI();

    this.clock = new Clock();
    this._running = true;
    this._raf = requestAnimationFrame(this._tick);

    // Fully stop rendering while the tab is backgrounded — nothing is visible
    // during that time anyway, so there's nothing to lose by not paying for
    // it. `clock` already clamps its delta on resume (see _tick), so the
    // scene picks back up exactly where it left off, just as if the RAF had
    // merely been throttled rather than stopped outright.
    this._onVisibilityChange = () => {
      if (document.hidden) {
        if (this._running) {
          this._running = false;
          cancelAnimationFrame(this._raf);
        }
      } else if (!this._running && !this._destroyed) {
        this._running = true;
        this.clock.getDelta(); // discard the hidden-time gap before resuming
        this._raf = requestAnimationFrame(this._tick);
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this._reveal();
  }

  // -- setup ----------------------------------------------------------------

  _setupRenderer() {
    this.renderer = new WebGLRenderer({
      canvas: this.dom.canvas,
      antialias: false, // AA handled by supersampled DPR / post chain
      // 'default' (not 'high-performance') — on hybrid-GPU laptops (Optimus/
      // AMD switchable graphics, and Intel Macs with a discrete GPU),
      // 'high-performance' explicitly forces the power-hungry GPU on for the
      // whole session regardless of how demanding the current frame actually
      // is. Letting the OS/driver decide keeps the same rendering output —
      // same shaders, same resolution, same everything — while avoiding that
      // forced power-up on machines where the integrated GPU is plenty.
      powerPreference: 'default',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.camera = new PerspectiveCamera(this.config.camera.fov, 1, 0.1, 5000);
    this.scene = new Scene();

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.dom.stage);
    this._resize();
  }

  _setupScene() {
    const { elevation, azimuth } = this.config.sun;
    const el = degToRad(elevation);
    const az = degToRad(azimuth);
    this.sunDir = new Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az)
    ).normalize();

    this.sky = new SkyDome(this.config, this.sunDir);
    this.scene.add(this.sky.mesh);

    this.ocean = new OceanSurface(this.config, this.quality, this.sunDir);
    if (this.reducedMotion) this.ocean.setMotionScale(0.45);
    this.scene.add(this.ocean.mesh);

    this.post = new PostPipeline(this.renderer, this.scene, this.camera, this.config, this.quality);

    this.phase = new OceanPhase({
      camera: this.camera,
      config: this.config,
      reducedMotion: this.reducedMotion,
    });

     console.log('ELEMENTS:', Object.keys(this).filter(k => this[k] instanceof HTMLElement));
    console.log('CANVAS PARENT:', this.renderer?.domElement?.parentElement);

        this.beachPhase = new BeachPhase({
            container: this.renderer.domElement.parentElement,
      config: this.config,
      quality: this.quality,
      reducedMotion: this.reducedMotion,
    });

    this.divePhase = new DivePhase({
      camera: this.camera,
      config: this.config,
      reducedMotion: this.reducedMotion,
      onCrossed: () => this._onDiveCrossed(),
      onArrived: () => this._onDiveArrived(),
    });

    this.journeyPhase = new JourneyPhase({
      camera: this.camera,
      config: this.config,
      reducedMotion: this.reducedMotion,
    });

    // Exactly one phase owns the camera at any time.
    this.activePhase = this.phase;

    this.ui = new UIManager({
      shadow: this.dom.shadow,
      uiLayer: this.dom.ui,
      config: this.config,
      reducedMotion: this.reducedMotion,
      onCTA: () => this._startDive(),
    });

    // Auto-spacing: beats without an explicit `at` are distributed evenly
    // across journey.beatRange. Add/remove cards freely — spacing stays equal.
    // A beat WITH an explicit `at` keeps it (manual wins for that card).
    const jb = this.config.journey;
    const [bStart, bEnd] = jb.beatRange ?? [0.08, 0.9];
    const n = jb.beats.length;
    jb.beats.forEach((b, i) => {
      if (b.at == null) {
        b.at = n === 1 ? (bStart + bEnd) / 2 : bStart + (i * (bEnd - bStart)) / (n - 1);
      }
    });
    if (this.config.debug) {
      const minGap = 2 * ((jb.beatHold ?? 0) + (jb.beatFade ?? jb.beatWindow));
      const sorted = [...jb.beats].sort((a, b) => a.at - b.at);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].at - sorted[i - 1].at;
        if (gap < minGap) {
          console.warn(
            `[OceanIntro] beats at ${sorted[i - 1].at.toFixed(3)} and ${sorted[i].at.toFixed(3)} ` +
            `overlap: gap ${gap.toFixed(3)} < required ${minGap.toFixed(3)}. ` +
            `Reduce beatHold/beatFade or remove a card.`
          );
        }
      }
    }

    this.storyBeats = new StoryBeats({
      shadow: this.dom.shadow,
      uiLayer: this.dom.ui,
      beats: this.config.journey.beats,
      window: this.config.journey.beatWindow,
      hold: this.config.journey.beatHold,
      fade: this.config.journey.beatFade,
      smoothing: this.config.journey.beatSmoothing,
      rise: this.config.journey.beatRise,
      zoom: this.config.journey.beatZoom,
      push: this.config.journey.beatPush,
      reducedMotion: this.reducedMotion,
    });

    // `post` didn't exist for the ResizeObserver's first firing — size it now.
    this._resize();
  }

  // -- dive (M3) -------------------------------------------------------------

  /** Built lazily during the UI phase's dwell time (all procedural, ~no wait). */
  _buildUnderwater() {
    if (this.underwater) return;
    this.underwater = new UnderwaterWorld(this.config, this.quality, this.sunDir);
    // ?tune=sheet — live sliders for the distant school. Never constructed
    // otherwise, so there is nothing to strip for production.
    if (SheetTuner.enabled() && this.underwater.fishSheet) {
      this._sheetTuner = new SheetTuner(this.config, this.underwater.fishSheet);
    }
    this.scene.add(this.underwater.group);

    // Pre-build the dive's ambient/rush tunnel + swirl now, fully invisible,
    // and force their shaders to compile immediately. This still runs during
    // the same idle dwell window as the underwater world above — well before
    // the dive — so by the time _onDiveArrived/_spawnTunnel actually reveal
    // these, there's nothing left to compile. (Previously they were `new`'d
    // for the first time mid-dive, and the browser's first-ever compile of
    // that shader caused a one-frame hitch right when they appeared.)
    if (!this.reducedMotion) {
      const d = this.config.dive;
      this.tunnel = new RushTunnel(this.config, this.quality);
      this.tunnel.revealUniform.value = 0;
      this.tunnel.enterUniform.value = d.tunnelAmbientEnter ?? 0.35;
      this.scene.add(this.tunnel.points);

      this.swirl = new RushSwirl(this.config, this.quality);
      this.swirl.revealUniform.value = 0;
      this.scene.add(this.swirl.group);

      this.renderer.compile(this.scene, this.camera);
    }
  }

  _startDive() {
    if (this.activePhase === this.divePhase) return;
    this._buildUnderwater(); // safety: CTA clicked before the idle build fired
    this.scroll.enabled = false; // TODO(M5): re-enable from the rest pose
    this.ui.hide(0.5);
    this.dom.hint.classList.remove('visible');
    this.activePhase = this.divePhase;
    this.divePhase.start();
  }

  _onDiveCrossed() {
    // Foam flash: reuse the reveal overlay in foam color for the impact frame.
    const flash = this.dom.flash;
    flash.style.background = this.config.palette.foam;
    flash.style.display = 'block';
    gsap.timeline({ onComplete: () => (flash.style.display = 'none') })
      .fromTo(flash, { opacity: 0 }, { opacity: 0.85, duration: 0.09, ease: 'power1.out' })
      .to(flash, { opacity: 0, duration: 0.6, ease: 'power2.out' });

    // World-state swap: water column, underwater grade, refraction shock.
    this.underwater?.setVisible(true);
    gsap.to(this.sky.submergeUniform, { value: 1, duration: 0.7, ease: 'power2.out' });
    this.post.gradeTo(this.config.post.gradeUnderwater, 1.4);
    if (!this.reducedMotion) this.post.pulseChroma();
  }

  _onDiveArrived() {
    // Underwater title card: same panel component, new content + new action.
    // A beat of stillness first — let the visitor register the new world.
    gsap.delayedCall(this.reducedMotion ? 0.2 : 0.8, () => {
      this.ui.setContent(this.config.content.underwater);
      this.ui.onCTA = () => this._startApproach();
      this.ui.reveal();

      // Reveal the vortex — already built (invisible, shader-warmed) back in
      // _buildUnderwater — as an ambient backdrop BEHIND the title card, so
      // it's present before the CTA. _spawnTunnel later ramps this same
      // vortex up to full and wraps it around you.
      if (!this.reducedMotion && this.tunnel) {
        gsap.to(this.tunnel.revealUniform, {
          value: this.config.dive.tunnelAmbientReveal ?? 0.4,
          duration: 2.0,
          ease: 'power1.out',
        });
      }
    });
  }

  _startApproach() {
    this.ui.hide(0.4);
    this.dom.hint.classList.remove('visible');

    // The vortex appears the moment you dive in (CTA), fading in across the
    // 30m glide, then wraps around you for the rush.
    this._spawnTunnel();

    this.divePhase.startApproach(() => this._startRush());
  }

  _spawnTunnel() {
    if (this.reducedMotion) return;

    // The vortex already exists (built + shader-warmed back in
    // _buildUnderwater); ramp it up to full for the dive. (Safety-create it
    // here too, only in case that earlier build was somehow skipped.)
    if (!this.tunnel) {
      this.tunnel = new RushTunnel(this.config, this.quality);
      this.scene.add(this.tunnel.points);
      this.tunnel.revealUniform.value = 0;
      this.tunnel.enterUniform.value = this.config.dive.tunnelAmbientEnter ?? 0.35;
    }
    gsap.to(this.tunnel.revealUniform, {
      value: 0.8,
      duration: 1.8,
      ease: 'power1.out',
      overwrite: true,
    });

    if (!this.swirl) {
      this.swirl = new RushSwirl(this.config, this.quality);
      this.scene.add(this.swirl.group);   // .group, not .mesh/.points
      this.swirl.revealUniform.value = 0;
    }
    // Same overwrite:true as the tunnel above — _spawnTunnel can be called
    // more than once (the real call from _startApproach, plus a safety-net
    // call from _startRush), so this must re-target cleanly rather than stack.
    gsap.to(this.swirl.revealUniform, {
      value: 1,
      duration: 0.65,
      ease: 'power2.inOut',
      overwrite: true,
    });
  }

  _startRush() {
    // this.ui.hide(0.4);
    // this.underwater?.setReefVisible(true);

    // Depth mood tracks the continuous descent: dimming begins partway into
    // the weave (you're already sinking) and completes through the drop.
    const d = this.config.dive;
    const uw = this.config.underwater;
    const rm = this.reducedMotion;


    const totalRush = d.currentDuration + d.dropDuration + d.settleDuration;

    // Cinematic hand-off: the tunnel DISSOLVES while the reef (Ocean World) is
    // revealed at the same moment, so the environment transforms instead of a
    // hard cut. Camera stays continuous (the rush ends at the journey's start).
    const dissolveDur = rm ? 0.7 : (d.dissolveDuration ?? 1.3);
    // Default: the dissolve FINISHES exactly as the rush lands at the journey's
    // starting pose, so the tunnel ends where the ocean begins. (Before, it
    // completed ~1s early and left a beat of bare water before the phase swap.)
    const dissolveDelay = rm
      ? 1.2
      : d.dissolveDelay ?? Math.max(0, totalRush - dissolveDur);
    // Reveal the reef a touch before the dissolve starts so it's already behind
    // the (still-dense, fog-dimmed) tunnel as it disintegrates away over it.
    gsap.delayedCall(Math.max(0, dissolveDelay - 0.4), () => {
      this.underwater?.setReefVisible(true);
    });

    // Tunnel is created HERE — exactly when the approach glide finishes —
    // so it doesn't exist, and can't be seen, before that point.a

    this._spawnTunnel(); // safety net, in case the timed call in _startApproach hasn't fired yet

    const delay = rm ? 0 : d.currentDuration * 0.45;
    const dur = rm ? 1.6 : d.currentDuration * 0.55 + d.dropDuration + d.settleDuration * 0.4;
    const depth = { t: 0 };
    gsap.to(depth, {
      t: 1,
      duration: dur,
      delay,
      ease: 'power2.in',
      onUpdate: () => {
        this.sky.depthUniform.value = depth.t;
        this.underwater?.setDepth(depth.t, uw.fogDensity, uw.fogDensityDeep);
      },
    });
    gsap.delayedCall(delay, () => this.post.gradeTo(this.config.post.gradeDeep, dur));

    // The droplet vortex tunnel around the camera (skipped for reduced motion).
    // Camera-relative: always centered on the view, no alignment issues.
    if (!rm) {
      // Enter the tunnel: during the approach the vortex sat as a mouth AHEAD
      // (enter=0); as the rush begins the currents wrap around you (enter→1),
      // then the descent plunges you down through them.
      gsap.to(this.tunnel.enterUniform, {
        value: 1,
        duration: d.currentDuration * 0.7,
        ease: 'power2.inOut',
        overwrite: false,
      });

      // Light spilling back down the tube from the ocean ahead. Ramps through
      // the back stretch so the field visibly brightens as you approach the
      // exit, instead of staying one flat shade until the dissolve hits.
      const lightRamp = d.tunnelLightRamp ?? 0.55;
      gsap.to(this.tunnel.lightUniform, {
        value: 1,
        duration: totalRush * lightRamp,
        delay: totalRush * (1 - lightRamp) * 0.9,
        ease: 'power2.in',
        overwrite: false,
      });

      // EXIT the tunnel (like the reference): keep it at FULL opacity and slide
      // the whole tube BEHIND the camera — we glide out through the mouth, the
      // tunnel recedes behind us, and the ocean ahead is revealed at the same
      // time. No opacity fade, no freeze.
      gsap.to(this.tunnel.exitUniform, {
        value: 1, duration: dissolveDur, delay: dissolveDelay, ease: 'power1.in', overwrite: false,
        onComplete: () => {
          this.scene.remove(this.tunnel.points);
          this.tunnel.dispose();
          this.tunnel = null;
        },
      });
      if (this.swirl) {
        gsap.to(this.swirl.revealUniform, {
          value: 0, duration: dissolveDur * 0.7, delay: dissolveDelay, ease: 'power1.in', overwrite: false,
          onComplete: () => {
            this.scene.remove(this.swirl.group);
            this.swirl.dispose();
            this.swirl = null;
          },
        });
      }
    }

    this.divePhase.startRush(() => this._onRushArrived());
  }

  _onRushArrived() {
    // Hand the camera to the journey: build the spline from the actual landing
    // pose, snap scroll state to the underwater segment's start, re-enable it.
    // Hand over the FULL pose — position, heading and orientation — so the
    // journey's spline can start exactly where the rush ended.
    this.journeyPhase.init(
      this.camera.position.clone(),
      this.camera.getWorldDirection(new Vector3()),
      this.camera.quaternion.clone()
    );
    this.scroll.max = 1;
    this.scroll.progress = this.scroll.target = this.config.segments.underwater[0];
    this.scroll.enabled = true;
    this.activePhase = this.journeyPhase;

    // Invite the scroll again.
    this._journeyHintShown = true;
    this.dom.hint.classList.add('visible');
    if (this.config.debug) console.info('[OceanIntro] journey begins — scroll to explore');
  }

  /** Outro CTA: complete the intro, then redirect if a URL is configured. */
  _finish() {
    const url = this.config.content.outro.url;
    if (url) this.on('complete', () => window.location.assign(url));
    this.complete('outro');
  }

  _setupInput() {
    // Cap scroll at the last milestone that's actually built, so there's
    // nothing to scroll into past it. Bump this as later milestones append
    // segments (dive, underwater, outro).
    const maxProgress = this.config.segments.ui[1];
    this.scroll = new ScrollEngine(this.dom.stage, { max: maxProgress, ...this.config.scroll });

    this._pointerNdc = null;
    this._pv = new Vector3();
    this._pointerWorld = new Vector3(0, -9999, 0);
    this._onPointerMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      this._pointerNdc = { x: nx, y: ny };
      this.activePhase.onPointerMove(nx, ny);
      this.ui.setPointer(nx, ny);
    };
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
  }

  _setupUI() {
    this.dom.skip.addEventListener('click', () => this.complete('skip'));
  }

  // -- reveal choreography (post white-flash) --------------------------------

  _reveal() {
    const { flashHold, flashFade } = this.config.reveal;
    this.phase.enter();

    gsap.to(this.dom.flash, {
      opacity: 0,
      duration: this.reducedMotion ? 0.4 : flashFade,
      delay: this.reducedMotion ? 0 : flashHold,
      ease: 'power2.inOut',
      onComplete: () => {
        this.dom.flash.style.display = 'none';
      },
    });

    // Skip + scroll hint appear once the scene is readable.
    gsap.delayedCall(this.reducedMotion ? 0.5 : flashHold + flashFade * 0.7, () => {
      this.dom.skip.classList.add('visible');
      this.dom.hint.classList.add('visible');
    });
  }

  // -- loop ------------------------------------------------------------------

  _tick = () => {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._tick);

    const dt = Math.min(this.clock.getDelta(), 1 / 20); // clamp tab-switch spikes
    const elapsed = this.clock.elapsedTime;

    this.scroll.update(dt);
    const progress = this.scroll.progress;

        if (this.beachPhase && !this.beachPhase.done) {
      if (this.beachPhase.update(progress, elapsed, this._pointerNdc)) {
        this.beachPhase.dispose();
        this.beachPhase = null;
      }
    }

    this.activePhase.update(dt, elapsed, progress);
    this.ui.update(dt);
    this.ocean.update(elapsed, this.camera.position);
    this.sky.update(this.camera.position);

    // Hide the hint once the user starts scrolling.
    if (progress > 0.02 && !this._hintHidden) {
      this._hintHidden = true;
      this.dom.hint.classList.remove('visible');
    }

    // Entering the UI segment reveals heading/description/CTA — and starts
    // building the underwater world in the visitor's dwell time.
    if (progress >= this.config.segments.ui[0] && !this.ui.revealed) {
      this.ui.reveal();
      this._buildUnderwater();
    }

    // Journey-driven systems: story beats, lighting evolution, the outro.
    if (this.activePhase === this.journeyPhase && this.journeyPhase.ready) {
      const jt = this.journeyPhase.t;
      this.storyBeats.update(jt, dt);
      // Scroll thickens while a card is on screen, easing back as it passes.
      this.scroll.slowT = this.storyBeats.presence * (this.config.journey.beatSlow ?? 1);
      // The deep slowly relents as the journey nears its end — arrival light.
      const uw = this.config.underwater;
      this.underwater?.setDepth(1 - jt * 0.35, uw.fogDensity, uw.fogDensityDeep);
      this.sky.depthUniform.value = 1 - jt * 0.3;

      if (this._journeyHintShown && progress > this.config.segments.underwater[0] + 0.01) {
        this._journeyHintShown = false;
        this.dom.hint.classList.remove('visible');
      }
      if (!this._outroShown && progress >= this.config.segments.outro[0]) {
        this._outroShown = true;
        this.ui.setContent(this.config.content.outro);
        this.ui.onCTA = () => this._finish();
        this.ui.reveal();
      }
    }

    // Project the cursor into the world (a point 28m down the view ray) —
    // drives the fish hover-flee.
    if (this._pointerNdc) {
      this._pv.set(this._pointerNdc.x, -this._pointerNdc.y, 0.5)
        .unproject(this.camera)
        .sub(this.camera.position)
        .normalize();
      this._pointerWorld.copy(this.camera.position).addScaledVector(this._pv, 28);
    }
    this.underwater?.update(elapsed, this.camera.position, this._pointerWorld);
    if (this.tunnel) {
      this.tunnel.update(elapsed);
      // The mouth swings with the banking: turning left bends the tube left.
      // Before the dive, divePhase has no state yet — keep the mouth centred.
      const s = this.divePhase && this.divePhase.state;
      const dcfg = this.config.dive;
      // Bend/breathe the mouth only once you're entering (same threshold the
      // shader uses to wake the swirl), so it stays dead-still while outside.
      const enterV = this.tunnel.enterUniform.value;
      const g = Math.min(1, Math.max(0, (enterV - 0.4) / 0.6));
      const bendGate = g * g * (3 - 2 * g); // smoothstep(0.4, 1.0, enter)
      const bx = s ? -(s.roll / dcfg.bankAngle) * dcfg.tunnelBend * bendGate : 0;
      const by = s ? Math.sin(elapsed * 0.8) * dcfg.tunnelBend * 0.35 * bendGate : 0;
      this.tunnel.setBend(bx, by);


      if (this.swirl) {
        this.swirl.update(elapsed, this.camera.position);
        this.swirl.setBend(bx, by); // reuse the same bx, by already computed above
      }
    }

    this.post.render(dt);
  };

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.dom.stage;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap);
    const scale = this.quality.renderScale;

    this.renderer.setPixelRatio(dpr * scale);
    this.renderer.setSize(w, h);
    // Composer inherits the renderer's pixel ratio internally — pass logical
    // size only. Guarded because ResizeObserver can fire before `post` exists.
    this.post?.setSize(w, h);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // -- lifecycle -------------------------------------------------------------

  on(event, fn) {
    this.listeners[event]?.push(fn);
    return this;
  }

  complete(reason) {
    if (this._completed) return;
    this._completed = true;
    this.scroll.enabled = false;

    gsap.to(this.dom.stage, {
      opacity: 0,
      duration: this.reducedMotion ? 0.3 : 1.1,
      ease: 'power2.inOut',
      onComplete: () => {
        this.destroy();
        this.listeners.complete.forEach((fn) => fn({ reason }));
      },
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._running = false;
    cancelAnimationFrame(this._raf);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._resizeObserver.disconnect();
    window.removeEventListener('pointermove', this._onPointerMove);
    this.scroll.destroy();
    this.ocean.dispose();
    this.sky.dispose();
    this.underwater?.dispose();
    this.tunnel?.dispose();
    this.swirl?.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}