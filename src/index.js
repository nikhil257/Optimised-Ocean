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
  if (lock) {
    savedScrollY = window.scrollY;
    htmlStyle.overflow = 'hidden';
    // NOTE: deliberately NOT also locking <body>'s overflow. That seemed
    // like a reasonable belt-and-suspenders addition, but overflow:hidden
    // makes an element a scrolling container even though nothing can
    // actually scroll inside it — and that can change what a
    // `position: sticky` sidebar (a common Webflow pattern) computes as
    // its containing scroll context, breaking it (seen live: a sidebar
    // collapsing to display:none once something elsewhere triggered a
    // reflow). The scroll-restore below already guarantees the page lands
    // in the right place regardless, since the whole page is hidden behind
    // our fully opaque overlay the entire time anyway — html-only locking
    // is enough, body's overflow doesn't need touching.
  } else {
    htmlStyle.overflow = '';
    // Safety net: restore exactly where the visitor actually was before
    // the intro started, regardless of anything that happened underneath
    // while it was hidden behind our overlay.
    window.scrollTo(0, savedScrollY);
  }
}

/**
 * Many scroll-triggered / fade-in-on-view animation systems (Webflow's own
 * IX2 "scroll into view" triggers, GSAP ScrollTrigger, AOS, etc.) only
 * recalculate element visibility on an actual scroll/resize EVENT, not on
 * page load. Scroll was fully locked the whole time the intro was up, so
 * those systems never got a chance to run their first check — elements
 * that should already be in view when the real page is revealed can be
 * stuck in their pre-animation state (usually opacity: 0) even though
 * they're exactly where they should be. Nudging window with synthetic
 * scroll/resize events gives them the trigger they were waiting for.
 * Deferred one frame so it runs after the container is actually gone.
 */
function nudgeHostAnimations() {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
  });
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
    nudgeHostAnimations();
    activeInstance = null;
  });

  activeInstance = {
    skipped: false,
    on: (event, fn) => app.on(event, fn),
    destroy() {
      lockHostScroll(false);
      app.destroy();
      unmount(dom.host);
      nudgeHostAnimations();
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
