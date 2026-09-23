// Shadow DOM embed shell. Genuine CSS isolation both ways: host styles can't
// leak in, ours can't leak out. Typography inherits the host's font stack via
// CSS custom properties so the intro matches each client site by default.

const STYLES = /* css */ `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  display: block;
  font-family: var(--ocean-intro-font, inherit);
}
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #071A22;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.flash {
  position: absolute;
  inset: 0;
  background: #ffffff;
  opacity: 1;
  pointer-events: none;
}
.skip {
  position: absolute;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(24px, env(safe-area-inset-bottom));
  pointer-events: auto;
  appearance: none;
  background: transparent;
  border: 1px solid rgba(232, 238, 240, 0.35);
  color: #E8EEF0;
  font: inherit;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 10px 18px;
  border-radius: 999px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.6s ease, border-color 0.25s ease, background 0.25s ease;
}
.skip.visible { opacity: 1; }
.skip:hover { border-color: rgba(232, 238, 240, 0.8); background: rgba(232, 238, 240, 0.08); }
.skip:focus-visible { outline: 2px solid #E8EEF0; outline-offset: 3px; }
.hint {
  position: absolute;
  left: 50%;
  bottom: max(28px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  color: #9DB3B8;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 1.2s ease;
}
.hint.visible { opacity: 0.8; }
@media (prefers-reduced-motion: reduce) {
  .skip, .hint { transition: none; }
}

/* Startup loader — covers everything while the scene/assets spin up, so
   nothing half-built is ever visible. Sits above .flash (last in the
   stage), fixed 2.5s fill + fade, driven entirely from App.js. */
.loader {
  position: absolute;
  inset: 0;
  /* BeachPhase's own layer (video + 3D logo, the first thing the ocean
     scene actually shows) sets z-index:2 on its root div in the same
     stage container. Any element with an explicit positive z-index paints
     above z-index:auto siblings regardless of DOM order — so without
     this, the loader (auto) loses to that layer (2) even though the
     loader is appended last. This just needs to beat it. */
  z-index: 10;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  pointer-events: auto;
}
.loader-heading {
  margin: 0;
  color: #111417;
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 500;
  letter-spacing: -0.01em;
}
.loader-sub {
  margin: 0 0 10px;
  color: #8a9096;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.loader-bar-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.loader-track {
  width: min(320px, 60vw);
  height: 6px;
  border-radius: 999px;
  background: #ececec;
  overflow: hidden;
}
.loader-fill {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: #111417;
  transform: scaleX(0);
  transform-origin: left center;
  will-change: transform;
  /* Duration is set inline from App.js (reduced-motion needs a different
     one); transform-based so the browser can animate it on the compositor
     thread — immune to main-thread stalls from scene setup / shader
     compiles happening at the same time, which is what made the JS-ticked
     version flash/stutter instead of gliding smoothly. */
  transition: transform linear;
}
.loader-percent {
  min-width: 3.2em;
  color: #111417;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
`;

/**
 * Parses a simple `[attr]` or `[attr="value"]` CSS attribute selector and
 * applies it to an element — enough to recreate the default container
 * (`[data-ocean-intro]`) programmatically. Returns false if the selector
 * isn't that simple bracket form (class/id/tag selectors aren't safely
 * re-creatable from a string alone).
 */
function applyAttributeSelector(el, selector) {
  const m = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(selector.trim());
  if (!m) return false;
  el.setAttribute(m[1], m[2] ?? '');
  return true;
}

export function mount(config) {
  let host =
    typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;

  // No manual placement required: if the configured container isn't found
  // (the expected case for a pure "just add this script tag" embed), create
  // it ourselves as the first element in <body>, instead of asking the
  // integrator to add it by hand. Only for string selectors — if the caller
  // passed an actual element reference that turned out falsy, there's
  // nothing sensible to auto-create.
  if (!host && typeof config.container === 'string') {
    host = document.createElement('div');
    applyAttributeSelector(host, config.container);
    document.body.insertBefore(host, document.body.firstChild);
  }

  if (!host) {
    throw new Error(`[OceanIntro] container not found: ${config.container}`);
  }

  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = String(config.zIndex);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const stage = document.createElement('div');
  stage.className = 'stage';
  shadow.appendChild(stage);

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);

  const ui = document.createElement('div');
  ui.className = 'ui';
  stage.appendChild(ui);

  const flash = document.createElement('div');
  flash.className = 'flash';
  stage.appendChild(flash);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Scroll to explore';
  ui.appendChild(hint);

  const skip = document.createElement('button');
  skip.className = 'skip';
  skip.type = 'button';
  skip.textContent = 'Skip intro';
  skip.setAttribute('aria-label', 'Skip the intro animation');
  ui.appendChild(skip);

  // Loader — appended LAST so it paints on top of canvas/ui/flash. Plain
  // DOM, no WebGL dependency, so it's already visible before the renderer
  // or any asset has done anything.
  const loader = document.createElement('div');
  loader.className = 'loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const loaderHeading = document.createElement('p');
  loaderHeading.className = 'loader-heading';
  loaderHeading.textContent = 'Loading your experience';
  loader.appendChild(loaderHeading);

  const loaderSub = document.createElement('p');
  loaderSub.className = 'loader-sub';
  loaderSub.textContent = 'Just a moment...';
  loader.appendChild(loaderSub);

  const loaderBarRow = document.createElement('div');
  loaderBarRow.className = 'loader-bar-row';
  const loaderTrack = document.createElement('div');
  loaderTrack.className = 'loader-track';
  const loaderFill = document.createElement('div');
  loaderFill.className = 'loader-fill';
  loaderTrack.appendChild(loaderFill);
  const loaderPercent = document.createElement('span');
  loaderPercent.className = 'loader-percent';
  loaderPercent.textContent = '0%';
  loaderBarRow.append(loaderTrack, loaderPercent);
  loader.appendChild(loaderBarRow);

  stage.appendChild(loader);

  return { host, shadow, stage, canvas, ui, flash, hint, skip, loader, loaderFill, loaderPercent };
}

export function unmount(host) {
  // Remove the element outright, not just its inline styles. A permanent
  // stylesheet rule (the critical CSS a host page adds for
  // [data-ocean-intro], to prevent the flash-of-host-content this element
  // exists to solve) still matches host after its INLINE styles are
  // cleared — the attribute itself is never removed — so the container
  // kept fully covering the viewport in solid white forever after
  // "completion." Removing the element is the only way to guarantee the
  // stylesheet rule stops applying. Safe unconditionally: this element's
  // only purpose is being the intro's mount point (either created by
  // mount() itself, or added by the integrator specifically for this), and
  // a later replay (?intro=force, or once:false) re-creates/re-finds it via
  // mount()'s existing auto-create fallback.
  host.remove();
}
