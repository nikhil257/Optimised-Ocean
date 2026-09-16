// The experience is a fixed fullscreen overlay, so there is no native page
// scroll to hijack. Instead, wheel / touch / keyboard input accumulates into a
// normalized target progress (0..1); the render loop eases current toward it.
// Everything downstream (camera, shaders, UI) reads ONE value: this.progress.

import { clamp, damp } from '../utils/math.js';

export class ScrollEngine {
  constructor(target, {
    wheelFactor = 0.00042, touchFactor = 0.0011, smoothing = 4.2, max = 1,
    slowSmoothing = 1.1, slowGain = 0.28,
  } = {}) {
    this.el = target;
    this.wheelFactor = wheelFactor;
    this.touchFactor = touchFactor;
    this.smoothing = smoothing;
    this.max = max;

    // Story-beat slowdown. `slowT` is driven from outside (0 = normal,
    // 1 = fully slowed) and blends BOTH halves of the feel:
    //   slowGain      — input gain, so a wheel tick advances less
    //   slowSmoothing — easing rate, so what it does advance glides
    // Gain alone feels stiff; smoothing alone feels laggy. Together it reads
    // as the world thickening around the card.
    this.slowSmoothing = slowSmoothing;
    this.slowGain = slowGain;
    this.slowT = 0;

    this.target = 0;
    this.progress = 0;
    this.velocity = 0;
    this.enabled = true;

    this._touchY = 0;
    this._bind();
  }

  _bind() {
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.target = clamp(this.target + e.deltaY * this.wheelFactor * this._gain(), 0, this.max);
    };
    this._onTouchStart = (e) => {
      this._touchY = e.touches[0].clientY;
    };
    this._onTouchMove = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      this.target = clamp(this.target + (this._touchY - y) * this.touchFactor * this._gain(), 0, this.max);
      this._touchY = y;
    };
    this._onKey = (e) => {
      if (!this.enabled) return;
      const step = { ArrowDown: 0.05, PageDown: 0.12, ' ': 0.08, ArrowUp: -0.05, PageUp: -0.12 }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        this.target = clamp(this.target + step, 0, this.max);
      }
    };

    this.el.addEventListener('wheel', this._onWheel, { passive: false });
    this.el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.el.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('keydown', this._onKey);
  }

  /** Input gain, blended toward slowGain as the beat takes over. */
  _gain() {
    return 1 + (this.slowGain - 1) * this.slowT;
  }

  /** Programmatic jump (used by CTA clicks / skip). */
  scrollTo(value) {
    this.target = clamp(value, 0, this.max);
  }

  update(dt) {
    const prev = this.progress;
    const smoothing = this.smoothing + (this.slowSmoothing - this.smoothing) * this.slowT;
    this.progress = damp(this.progress, this.target, smoothing, dt);
    this.velocity = (this.progress - prev) / Math.max(dt, 1e-4);
  }

  destroy() {
    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('touchstart', this._onTouchStart);
    this.el.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('keydown', this._onKey);
  }
}