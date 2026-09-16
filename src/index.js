import { DEFAULTS, deepMerge } from './config/defaults.js';
import { Persistence } from './core/Persistence.js';
import { mount, unmount } from './embed/mount.js';
import { App } from './core/App.js';

// Public API — the only surface Webflow (or any host) touches:
//
//   <div data-ocean-intro></div>
//   <script src="https://cdn.example.com/ocean-intro.js"></script>
//   <script>OceanIntro.init({ /* per-client overrides */ })</script>
//
// init() resolves immediately if the visitor already completed the intro.

let activeInstance = null;

function lockHostScroll(lock) {
  document.documentElement.style.overflow = lock ? 'hidden' : '';
}

function init(overrides = {}) {
  if (activeInstance) {
    console.warn('[OceanIntro] already initialized');
    return activeInstance;
  }

  const config = deepMerge(DEFAULTS, overrides);
  const persistence = new Persistence(config);

  if (config.once && persistence.hasCompleted()) {
    if (config.debug) console.info('[OceanIntro] already completed — skipping');
    return { skipped: true, destroy() {} };
  }

  const dom = mount(config);
  lockHostScroll(true);

  const app = new App(config, dom);

  app.on('complete', () => {
    persistence.markCompleted();
    lockHostScroll(false);
    unmount(dom.host);
    activeInstance = null;
  });

  activeInstance = {
    skipped: false,
    on: (event, fn) => app.on(event, fn),
    destroy() {
      lockHostScroll(false);
      app.destroy();
      unmount(dom.host);
      activeInstance = null;
    },
  };
  return activeInstance;
}

const OceanIntro = { init, version: '0.1.0' };

// Auto-init when the script is loaded classically with data attribute opt-in:
// <script src="ocean-intro.js" data-auto-init></script>
if (typeof document !== 'undefined' && document.currentScript?.hasAttribute('data-auto-init')) {
  const boot = () => OceanIntro.init();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
}

export default OceanIntro;
