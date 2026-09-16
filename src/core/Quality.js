// Device tiering. Decided once at startup; every subsystem reads from the
// resulting settings object instead of sniffing the device itself.

const TIERS = {
  high: {
    pixelRatioCap: 2,
    renderScale: 1.0,     // scene render resolution multiplier (post upscales)
    oceanSegments: 420,
    underwaterScale: 1.0,
    bloom: true,
    grain: true,
  },
  medium: {
    pixelRatioCap: 1.5,
    renderScale: 0.85,
    oceanSegments: 300,
    underwaterScale: 0.65,
    bloom: true,
    grain: true,
  },
  low: {
    pixelRatioCap: 1,
    renderScale: 0.7,     // fillrate is the mobile bottleneck — scale down, upscale in post
    oceanSegments: 190,
    underwaterScale: 0.4,
    bloom: false,
    grain: false,
  },
};

function detectTier() {
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  if (isMobile) return memory >= 6 && cores >= 6 ? 'medium' : 'low';
  if (cores <= 4 || (dpr > 2 && memory <= 4)) return 'medium';
  return 'high';
}

export function resolveQuality(requested) {
  const tier = requested === 'auto' ? detectTier() : requested;
  const settings = TIERS[tier] ?? TIERS.medium;
  return { tier, ...settings };
}