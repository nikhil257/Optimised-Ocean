// Story beats for the journey: small text (optionally image) cards anchored
// to points along the path (beat.at, 0..1). Each frame their presence is
// computed from |journeyT - at| — they breathe in as you approach and out as
// you pass, coupled to the same scroll that drives the camera. No timelines
// to manage: scrubbing backward works for free.

const STYLES = /* css */ `
.oi-beat {
  position: absolute;
  top: 50%;
  max-width: min(42ch, 38vw);
  transform:
    translate(var(--oi-beat-push, 0px), calc(-50% + var(--oi-beat-rise, 0px)))
    scale(var(--oi-beat-scale, 1));
  transform-origin: center center;
  pointer-events: none;
  opacity: 0;
  will-change: opacity, transform;
  padding: 26px 30px 28px;
  background: linear-gradient(150deg, rgba(15, 40, 48, 0.5), rgba(15, 40, 48, 0.12));
  border: 1px solid rgba(127, 178, 184, 0.45);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%);
}
.oi-beat::before {
  content: '';
  position: absolute;
  top: -1px; left: -1px;
  width: 34px; height: 34px;
  border-top: 2px solid #7FB2B8;
  border-left: 2px solid #7FB2B8;
}
.oi-beat--left { left: max(6vw, 36px); text-align: left; }
.oi-beat--right { right: max(6vw, 36px); text-align: left; }
.oi-beat-label {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
  color: #7FB2B8;
  font-family: var(--ocean-intro-font, inherit);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.oi-beat-label::before {
  content: '';
  width: 14px; height: 9px;
  background: #7FB2B8;
  border-radius: 2px;
}
.oi-beat h2 {
  margin: 0 0 12px;
  color: #CFE4E8;
  font-family: var(--ocean-intro-display-font, var(--ocean-intro-font, inherit));
  font-weight: 500;
  font-size: clamp(1.35rem, 2.4vw, 2.1rem);
  line-height: 1.12;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.oi-beat h2 em {
  font-style: normal;
  color: #8FCDE0;
}
.oi-beat p {
  margin: 0;
  color: var(--oi-muted, #9DB3B8);
  font-family: var(--ocean-intro-font, inherit);
  font-size: clamp(0.9rem, 1.1vw, 1.02rem);
  line-height: 1.6;
}
.oi-beat figure {
  margin: 0 0 16px;
  padding: 6px;
  border: 1px solid rgba(127, 178, 184, 0.55);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%);
}
.oi-beat img,
.oi-beat video {
  display: block;
  width: 100%;
  // max-width: min(300px, 28vw);
  opacity: 0.94;
  object-fit: cover;
}
.oi-beat figcaption {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 2px 2px;
  color: #AFC9CE;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.oi-beat figcaption::before {
  content: '';
  width: 13px; height: 8px;
  background: #7FB2B8;
  border-radius: 2px;
  flex: none;
}
@media (max-width: 640px) {
  .oi-beat {
    max-width: 78vw; top: auto; bottom: 13vh;
    transform: translate(var(--oi-beat-push, 0px), var(--oi-beat-rise, 0px)) scale(var(--oi-beat-scale, 1));
  }
  .oi-beat--left, .oi-beat--right { left: 7vw; right: 7vw; }
  .oi-beat img { max-width: 100%; }
}
`;

export class StoryBeats {
  constructor({ shadow, uiLayer, beats, window: beatWindow, hold, fade, smoothing, rise, zoom, push, reducedMotion }) {
    this.beats = beats;
    // Presence profile: fade in → HOLD at full opacity → fade out.
    // hold = half-width of the full-opacity plateau (journey-t units)
    // fade = width of each fade ramp
    // Defaults reproduce the old triangle profile (hold 0, fade = window).
    this.hold = hold ?? 0;
    this.fade = fade ?? beatWindow;
    // Temporal smoothing: displayed opacity chases the scroll-derived target
    // over TIME — even an instant scroll flick fades softly, never pops.
    this.smoothing = smoothing ?? 5;
    this.rise = rise ?? 26;
    // Exit motion: the card accelerates toward the lens and blows past it,
    // rather than fading out where it stood.
    this.zoom = zoom ?? 0.45;   // extra scale at the end of the exit
    this.push = push ?? 90;     // px of outward drift, away from screen center
    this.reducedMotion = reducedMotion;
    this._shown = new Float32Array(beats.length);
    this._exit = new Float32Array(beats.length);
    // Left-hand cards drift left as they pass, right-hand cards drift right —
    // matching where they'd actually go if they flew past the camera.
    this._dir = beats.map((b) => (b.side === 'right' ? 1 : -1));
    // Peak presence across all beats, read by App to slow the scroll while a
    // card is on screen.
    this.presence = 0;

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    this._videoByIndex = new Map();
    this.els = beats.map((beat, beatIndex) => {
      const el = document.createElement('div');
      el.className = `oi-beat oi-beat--${beat.side === 'right' ? 'right' : 'left'}`;
      if (beat.label) {
        const label = document.createElement('div');
        label.className = 'oi-beat-label';
        label.textContent = beat.label;
        el.appendChild(label);
      }
      if (beat.image || beat.video) {
        const fig = document.createElement('figure');
        if (beat.video) {
          const vid = document.createElement('video');
          vid.src = beat.video;
          if (beat.poster) vid.poster = beat.poster;
          // muted + playsInline are REQUIRED for autoplay on mobile browsers.
          vid.muted = true;
          vid.loop = true;
          vid.playsInline = true;
          vid.preload = 'metadata';
          fig.appendChild(vid);
          this._videoByIndex.set(beatIndex, vid);
        } else {
          const img = document.createElement('img');
          img.src = beat.image;
          img.alt = beat.imageAlt || '';
          fig.appendChild(img);
        }
        if (beat.caption) {
          const cap = document.createElement('figcaption');
          cap.textContent = beat.caption;
          fig.appendChild(cap);
        }
        el.appendChild(fig);
      }
      if (beat.heading) {
        const h = document.createElement('h2');
        // "|" in the heading marks the accent-colored span:
        // 'How do |marine protected areas| work?' → middle part tinted.
        const parts = beat.heading.split('|');
        if (parts.length === 3) {
          h.append(parts[0]);
          const em = document.createElement('em');
          em.textContent = parts[1];
          h.appendChild(em);
          h.append(parts[2]);
        } else {
          h.textContent = beat.heading;
        }
        el.appendChild(h);
      }
      if (beat.text) {
        const p = document.createElement('p');
        p.textContent = beat.text;
        el.appendChild(p);
      }
      uiLayer.appendChild(el);
      return el;
    });
  }

  /** Drive from the journey's smoothed t each frame. */
  update(journeyT, dt = 1 / 60) {
    let peak = 0;
    for (let i = 0; i < this.beats.length; i++) {
      const beat = this.beats[i];
      const hold = beat.hold ?? this.hold;   // per-beat overrides allowed
      const fade = beat.fade ?? this.fade;
      // SIGNED distance: negative while approaching, positive once past.
      // `presence` stays symmetric (the entrance is unchanged), but the sign
      // is what lets the exit behave differently from the entrance.
      const s = journeyT - beat.at;
      const d = Math.abs(s);
      // Trapezoid: 1 inside the hold plateau, ramping to 0 across the fade.
      const presence = Math.max(0, Math.min(1, 1 - (d - hold) / fade));

      // A beat this far outside its window contributes 0 either way; if its
      // smoothed state has already fully settled at 0 too, the DOM write
      // below would set the exact same opacity/transform it already has.
      // Skip it — same rest state, no `.toFixed()`/style churn for every
      // off-screen card, every frame, for the whole journey.
      if (presence === 0 && this._shown[i] < 1e-4 && this._exit[i] < 1e-4) {
        this._shown[i] = 0;
        this._exit[i] = 0;
        continue;
      }
      let eased = presence * presence * (3 - 2 * presence); // smoothstep
      // Chase over time (exponential damp) — the anti-jerk layer.
      this._shown[i] += (eased - this._shown[i]) * (1 - Math.exp(-this.smoothing * dt));
      eased = this._shown[i];

      // Departure ramp: 0 while approaching or holding, 0 → 1 as you move
      // beyond the plateau. Smoothed on the same clock so scrubbing backward
      // unwinds it rather than snapping.
      const exitRaw = Math.max(0, Math.min(1, (s - hold) / fade));
      this._exit[i] += (exitRaw - this._exit[i]) * (1 - Math.exp(-this.smoothing * dt));
      const exit = this._exit[i];

      const el = this.els[i];
      el.style.opacity = eased.toFixed(3);
      if (!this.reducedMotion) {
        // Rise belongs to the ENTRANCE only. (1 - exit) cancels it on the way
        // out, so the card doesn't sink back down while it's rushing past.
        const rise = (1 - eased) * this.rise * (1 - exit);
        el.style.setProperty('--oi-beat-rise', `${rise.toFixed(1)}px`);
        // pow() makes the scale start slow and rush at the end — that
        // acceleration is what sells it as approaching the lens rather than
        // simply growing.
        const k = Math.pow(exit, 1.7);
        el.style.setProperty('--oi-beat-scale', (1 + k * this.zoom).toFixed(4));
        el.style.setProperty('--oi-beat-push', `${(k * this.push * this._dir[i]).toFixed(1)}px`);
      }
      if (eased > peak) peak = eased;
      // Videos only decode while their card is visible.
      const vid = this._videoByIndex.get(i);
      if (vid) {
        if (eased > 0.05 && vid.paused) vid.play().catch(() => {});
        else if (eased <= 0.05 && !vid.paused) vid.pause();
      }
    }
    this.presence = peak;
  }
}