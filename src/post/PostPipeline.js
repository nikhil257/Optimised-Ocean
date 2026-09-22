// import {
//   BlendFunction,
//   BloomEffect,
//   ChromaticAberrationEffect,
//   EffectComposer,
//   EffectPass,
//   NoiseEffect,
//   RenderPass,
//   ToneMappingEffect,
//   ToneMappingMode,
//   VignetteEffect,
// } from 'postprocessing';
// import { HalfFloatType, Vector2 } from 'three';
// import gsap from 'gsap';
// import { GradeEffect } from './GradeEffect.js';

// // Order matters: scene (HDR) → bloom → tonemap → grade → vignette → grain.
// // `postprocessing` merges the effect chain into minimal fullscreen passes,
// // which is why it's used over three's stock EffectComposer.

// export class PostPipeline {
//   constructor(renderer, scene, camera, { post }, quality) {
//     this.composer = new EffectComposer(renderer, {
//       frameBufferType: HalfFloatType,
//       multisampling: 0,
//     });

//     this.composer.addPass(new RenderPass(scene, camera));

//     const effects = [];

//     if (quality.bloom) {
//       this.bloom = new BloomEffect({
//         intensity: post.bloom.intensity,
//         luminanceThreshold: post.bloom.threshold,
//         luminanceSmoothing: post.bloom.smoothing,
//         mipmapBlur: true,
//       });
//       effects.push(this.bloom);
//     }

//     effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));

//     this.grade = new GradeEffect(post.grade);
//     effects.push(this.grade);

//     // Idle at zero offset; pulsed only at the dive's crossing frame.
//     this.chroma = new ChromaticAberrationEffect({
//       offset: new Vector2(0, 0),
//       radialModulation: true,
//       modulationOffset: 0.28,
//     });
//     effects.push(this.chroma);

//     effects.push(
//       new VignetteEffect({
//         offset: post.vignette.offset,
//         darkness: post.vignette.darkness,
//       })
//     );

//     if (quality.grain) {
//       const noise = new NoiseEffect({ blendFunction: BlendFunction.COLOR_DODGE });
//       noise.blendMode.opacity.value = post.grain;
//       effects.push(noise);
//     }

//     this.composer.addPass(new EffectPass(camera, ...effects));
//   }

//   /** Refraction shock at the moment the camera punches through the surface. */
//   pulseChroma() {
//     gsap.timeline()
//       .to(this.chroma.offset, { x: 0.0042, y: 0.0030, duration: 0.14, ease: 'power2.out' })
//       .to(this.chroma.offset, { x: 0, y: 0, duration: 0.85, ease: 'power2.inOut' });
//   }

//   /** Crossfade the grade (used surface → underwater; reversible). */
//   gradeTo({ lift, gain, gamma, saturation }, duration = 1.2) {
//     const u = this.grade.uniforms;
//     const ease = 'power2.inOut';
//     gsap.to(u.get('uLift').value, { x: lift[0], y: lift[1], z: lift[2], duration, ease });
//     gsap.to(u.get('uGain').value, { x: gain[0], y: gain[1], z: gain[2], duration, ease });
//     gsap.to(u.get('uGamma').value, { x: gamma[0], y: gamma[1], z: gamma[2], duration, ease });
//     gsap.to(u.get('uSaturation'), { value: saturation, duration, ease });
//   }

//   setSize(width, height) {
//     this.composer.setSize(width, height);
//   }

//   render(dt) {
//     this.composer.render(dt);
//   }

//   dispose() {
//     this.composer.dispose();
//   }
// }



import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, FramebufferTexture, Vector2 } from 'three';
import gsap from 'gsap';
import { GradeEffect } from './GradeEffect.js';
import { DissolveTransition } from './DissolveTransition.js';

// Order matters: scene (HDR) → bloom → tonemap → grade → vignette → grain.
// `postprocessing` merges the effect chain into minimal fullscreen passes,
// which is why it's used over three's stock EffectComposer.

export class PostPipeline {
  constructor(renderer, scene, camera, { post }, quality) {
    this.renderer = renderer;
    this.camera = camera;
    this.composer = new EffectComposer(renderer, {
      frameBufferType: HalfFloatType,
      multisampling: 0,
    });

    this.composer.addPass(new RenderPass(scene, camera));

    const effects = [];

    if (quality.bloom) {
      this.bloom = new BloomEffect({
        intensity: post.bloom.intensity,
        luminanceThreshold: post.bloom.threshold,
        luminanceSmoothing: post.bloom.smoothing,
        mipmapBlur: true,
      });
      effects.push(this.bloom);
    }

    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));

    this.grade = new GradeEffect(post.grade);
    effects.push(this.grade);

    // Idle at zero offset; pulsed only at the dive's crossing frame.
    this.chroma = new ChromaticAberrationEffect({
      offset: new Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.28,
    });
    effects.push(this.chroma);

    effects.push(
      new VignetteEffect({
        offset: post.vignette.offset,
        darkness: post.vignette.darkness,
      })
    );

    if (quality.grain) {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.COLOR_DODGE });
      noise.blendMode.opacity.value = post.grain;
      effects.push(noise);
    }

    // Depth-of-field: NOT part of the always-on chain — it's a real extra
    // blur pass, so it only exists in the composer while the rush tunnel is
    // actually on screen (see enableDoF/disableDoF, driven by App.js around
    // _startApproach/_startRush). Constructed once up front so activating
    // it is just rebuilding the merged EffectPass, not a fresh compile.
    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: post.dof?.focusDistance ?? 14,
      focusRange: post.dof?.focusRange ?? 10,
      bokehScale: 0,
    });
    this._dofActive = false;

    // Screen-space dissolve transition (tunnel → ocean). Last in the chain so it
    // operates on the fully-composed image. Idle unless a dissolve is running.
    this.dissolve = new DissolveTransition(post.transition || {});
    effects.push(this.dissolve);

    this._effects = effects; // base chain, without dof — dof splices in before dissolve
    this.mainPass = new EffectPass(camera, ...effects);
    this.composer.addPass(this.mainPass);
  }

  /** Splice dof in/out of the merged EffectPass (right before the dissolve,
   *  which should always see the final, already-blurred image). */
  _rebuildMainPass(withDoF) {
    this.composer.removePass(this.mainPass);
    this.mainPass.dispose();
    const list = withDoF
      ? [...this._effects.slice(0, -1), this.dof, this._effects[this._effects.length - 1]]
      : this._effects;
    this.mainPass = new EffectPass(this.camera, ...list);
    this.composer.addPass(this.mainPass);
    this._dofActive = withDoF;
  }

  /** Ramp depth-of-field in — scoped to the tunnel-rush sequence only, not
   *  left running for the rest of the experience (it's a real extra cost). */
  enableDoF({ bokehScale = 1.2, focusDistance, focusRange } = {}, duration = 1.2) {
    if (!this._dofActive) {
      this.dof.bokehScale = 0;
      this._rebuildMainPass(true);
    }
    if (focusDistance != null) this.dof.focusDistance = focusDistance;
    if (focusRange != null) this.dof.focusRange = focusRange;
    gsap.to(this.dof, { bokehScale, duration, ease: 'power2.out', overwrite: true });
  }

  /** Ramp depth-of-field back out, then actually remove it from the merged
   *  pass once invisible — so it stops costing anything again. */
  disableDoF(duration = 0.8) {
    if (!this._dofActive) return;
    gsap.to(this.dof, {
      bokehScale: 0,
      duration,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => this._rebuildMainPass(false),
    });
  }

  /** Freeze the current (post-composed) frame so the dissolve can reveal what's
   *  rendered behind it next frame. Call right AFTER render(). */
  captureFrame(renderer) {
    if (!this._fbTex) this._allocFbTex();
    renderer.copyFramebufferToTexture(this._fbTex);
    this.dissolve.fromTexture = this._fbTex;
  }

  _allocFbTex() {
    const s = this.renderer.getDrawingBufferSize(new Vector2());
    if (this._fbTex && this._fbTex.image.width === s.x && this._fbTex.image.height === s.y) return;
    this._fbTex?.dispose();
    this._fbTex = new FramebufferTexture(s.x, s.y);
    this.renderer.initTexture(this._fbTex); // force GPU upload now → no hitch mid-transition
    this.dissolve.fromTexture = this._fbTex;
  }

  get dissolveProgress() {
    return this.dissolve.progressUniform;
  }

  /** Refraction shock at the moment the camera punches through the surface. */
  pulseChroma() {
    gsap.timeline()
      .to(this.chroma.offset, { x: 0.0042, y: 0.0030, duration: 0.14, ease: 'power2.out' })
      .to(this.chroma.offset, { x: 0, y: 0, duration: 0.85, ease: 'power2.inOut' });
  }

  /** Crossfade the grade (used surface → underwater; reversible). */
  gradeTo({ lift, gain, gamma, saturation }, duration = 1.2) {
    const u = this.grade.uniforms;
    const ease = 'power2.inOut';
    gsap.to(u.get('uLift').value, { x: lift[0], y: lift[1], z: lift[2], duration, ease });
    gsap.to(u.get('uGain').value, { x: gain[0], y: gain[1], z: gain[2], duration, ease });
    gsap.to(u.get('uGamma').value, { x: gamma[0], y: gamma[1], z: gamma[2], duration, ease });
    gsap.to(u.get('uSaturation'), { value: saturation, duration, ease });
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this._allocFbTex(); // keep the capture texture sized + GPU-resident, ready for the transition
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    this._fbTex?.dispose();
    // dof is only ever attached to the composer while active — dispose it
    // explicitly too, in case the app is torn down while it's inactive
    // (composer.dispose() only reaches passes it currently holds).
    if (!this._dofActive) this.dof.dispose();
    this.composer.dispose();
  }
}