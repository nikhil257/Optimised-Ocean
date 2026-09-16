import gsap from 'gsap';
import { damp } from '../utils/math.js';

// Phase 2 UI. DOM (not WebGL) for crisp type + accessibility, made to feel
// part of the scene via: (1) counter-parallax against the same smoothed mouse
// the camera uses, (2) palette-matched color, (3) a faint radial scrim rather
// than a panel. Injects its own scoped <style> into the shadow root so no edit
// to embed/mount.js is needed.

const STYLES = /* css */ `
.oi-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 8vw;
  pointer-events: none;
  will-change: transform;
}
.oi-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(120% 90% at 50% 62%, rgba(15,40,48,0.55) 0%, rgba(15,40,48,0) 62%);
}
.oi-heading {
  margin: 0;
  color: var(--oi-text, #E8EEF0);
  font-family: var(--ocean-intro-display-font, var(--ocean-intro-font, inherit));
  font-weight: 300;
  font-size: clamp(2.4rem, 6.2vw, 5.2rem);
  line-height: 1.04;
  letter-spacing: -0.02em;
}
.oi-line { display: block; overflow: hidden; }
.oi-line > span { display: block; will-change: transform; }
.oi-desc {
  margin: clamp(18px, 2.4vw, 30px) 0 0;
  max-width: 34ch;
  color: var(--oi-muted, #9DB3B8);
  font-family: var(--ocean-intro-font, inherit);
  font-weight: 400;
  font-size: clamp(0.95rem, 1.3vw, 1.15rem);
  line-height: 1.6;
  opacity: 0;
}
.oi-cta {
  margin-top: clamp(26px, 3.2vw, 40px);
  pointer-events: auto;
  appearance: none;
  background: transparent;
  border: 1px solid var(--oi-text, #E8EEF0);
  color: var(--oi-text, #E8EEF0);
  font: inherit;
  font-size: 0.82rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 14px 34px;
  border-radius: 999px;
  cursor: pointer;
  opacity: 0;
  transition: background 0.3s ease, color 0.3s ease, transform 0.3s ease;
}
.oi-cta:hover { background: var(--oi-text, #E8EEF0); color: #0F2830; }
.oi-cta:focus-visible { outline: 2px solid var(--oi-text, #E8EEF0); outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) {
  .oi-cta { transition: none; }
}
`;

export class UIManager {
  constructor({ shadow, uiLayer, config, reducedMotion, onCTA }) {
    this.config = config;
    this.reducedMotion = reducedMotion;
    this.onCTA = onCTA;
    this.revealed = false;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    // Scrim sits behind content, both inside the (pointer-events:none) ui layer.
    this.scrim = document.createElement('div');
    this.scrim.className = 'oi-scrim';
    uiLayer.appendChild(this.scrim);

    this.content = document.createElement('div');
    this.content.className = 'oi-content';
    uiLayer.appendChild(this.content);

    const { heading, description, cta } = config.content;

    this.headingEl = document.createElement('h1');
    this.headingEl.className = 'oi-heading';
    this._buildLines(heading);
    this.content.appendChild(this.headingEl);

    this.descEl = document.createElement('p');
    this.descEl.className = 'oi-desc';
    this.descEl.textContent = description;
    this.content.appendChild(this.descEl);

    this.ctaEl = document.createElement('button');
    this.ctaEl.className = 'oi-cta';
    this.ctaEl.type = 'button';
    this.ctaEl.textContent = cta;
    this.ctaEl.addEventListener('click', () => this.onCTA?.());
    this.content.appendChild(this.ctaEl);

    // Start hidden until reveal() so nothing flashes during the ocean phase.
    gsap.set(this.lineInners, { yPercent: 110 });
  }

  _buildLines(heading) {
    this.headingEl.replaceChildren();
    this.lineInners = heading.split('\n').map((text) => {
      const line = document.createElement('span');
      line.className = 'oi-line';
      const inner = document.createElement('span');
      inner.textContent = text;
      line.appendChild(inner);
      this.headingEl.appendChild(line);
      return inner;
    });
  }

  /**
   * Repurpose the panel for a new beat (e.g. the underwater title card).
   * Resets reveal state so reveal() plays the full entrance again.
   * Reassign `ui.onCTA` before revealing to change the button's action.
   */
  setContent({ heading, description = '', cta }) {
    this._buildLines(heading);
    if (description) {
      this.descEl.textContent = description;
      this.descEl.style.display = '';
    } else {
      this.descEl.style.display = 'none';
    }
    this.ctaEl.textContent = cta;

    this.revealed = false;
    gsap.set([this.content, this.scrim], { opacity: 1 });
    gsap.set(this.scrim, { opacity: 0 });
    gsap.set(this.lineInners, { yPercent: 110 });
    gsap.set([this.descEl, this.ctaEl], { opacity: 0 });
  }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;

    if (this.reducedMotion) {
      gsap.set(this.lineInners, { yPercent: 0 });
      gsap.to([this.scrim, this.descEl, this.ctaEl], { opacity: 1, duration: 0.4 });
      return;
    }

    const tl = gsap.timeline();
    tl.to(this.scrim, { opacity: 1, duration: 1.4, ease: 'power2.out' }, 0)
      .to(this.lineInners, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.12 }, 0.1)
      .to(this.descEl, { opacity: 1, duration: 1.0, ease: 'power2.out' }, 0.55)
      .to(this.ctaEl, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.75);
  }

  /** Smoothed mouse (-1..1) from the camera rig → counter-parallax. */
  setPointer(sx, sy) {
    this.parallax.tx = -sx * 14;
    this.parallax.ty = -sy * 10;
  }

  update(dt) {
    if (!this.revealed) return;
    this.parallax.x = damp(this.parallax.x, this.parallax.tx, 4, dt);
    this.parallax.y = damp(this.parallax.y, this.parallax.ty, 4, dt);
    this.content.style.transform = `translate(${this.parallax.x}px, ${this.parallax.y}px)`;
  }

  /** Called by the dive (M3) to clear the UI as the camera plunges. */
  hide(duration = 0.6) {
    gsap.to([this.content, this.scrim], { opacity: 0, duration, ease: 'power2.in' });
  }
}