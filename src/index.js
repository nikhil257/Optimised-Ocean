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
let savedScrollY = 0;

function lockHostScroll(lock) {
  const htmlStyle = document.documentElement.style;
  const bodyStyle = document.body.style;
  if (lock) {
    // Locking only <html> isn't reliably enough on every site — many host
    // pages (Webflow included) put their own height/overflow rules on
    // <body>, which can let scrolling leak through underneath the intro
    // even with <html> locked. Lock both.
    savedScrollY = window.scrollY;
    htmlStyle.overflow = 'hidden';
    bodyStyle.overflow = 'hidden';
  } else {
    htmlStyle.overflow = '';
    bodyStyle.overflow = '';
    // Safety net: if anything still leaked through during the intro
    // despite the lock, restore exactly where the visitor actually was
    // before it started, rather than wherever residual scroll landed
    // (reported: page appearing scrolled down near the footer instead of
    // at the top once the intro completes).
    window.scrollTo(0, savedScrollY);
  }
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
