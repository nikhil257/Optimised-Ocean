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
`;

export function mount(config) {
  const host =
    typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;

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

  return { host, shadow, stage, canvas, ui, flash, hint, skip };
}

export function unmount(host) {
  host.style.removeProperty('position');
  host.style.removeProperty('inset');
  host.style.removeProperty('z-index');
  // Shadow roots can't be detached; clear their contents instead.
  host.shadowRoot?.replaceChildren();
}
