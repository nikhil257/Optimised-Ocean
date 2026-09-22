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
    // Resolution deliberately matches `high` — no downscale-then-upscale
    // blur. The tradeoff for weak-GPU devices is population/geometry counts
    // below (oceanSegments/underwaterScale), not sharpness: this keeps the
    // *output* pixel-perfect while there's simply less on screen to draw.
    pixelRatioCap: 2,
    renderScale: 1.0,
    oceanSegments: 190,
    underwaterScale: 0.4,
    sharks: false, // FishSchool reads this — see FishSchool.js
    bloom: false,
    grain: false,
  },
};

/**
 * Reads the actual GPU name via WebGL (WEBGL_debug_renderer_info), using a
 * throwaway canvas — cheap, standard technique. CPU core count and system
 * RAM (used below) say nothing about GPU capability: plenty of Windows
 * laptops pair a strong CPU with a weak integrated GPU, which is exactly
 * the case that was slipping through and getting rated 'high' it couldn't
 * actually sustain. Returns the lowercased renderer string, or null if the
 * extension isn't available (some privacy settings block it) — callers
 * must treat null as "unknown", not "weak".
 */
export function detectGpuString() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof renderer === 'string' ? renderer.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Classifies a GPU renderer string into a tier CEILING (this device should
 * never be rated ABOVE this, whatever CPU/RAM suggest) — or null if the
 * string is unrecognized, in which case the caller keeps its own guess.
 * Deliberately conservative: only known weak/software renderers get capped;
 * an unfamiliar string is left alone rather than guessed at.
 */
function classifyGpuCeiling(renderer) {
  if (!renderer) return null;
  if (/swiftshader|software|basic render|llvmpipe/.test(renderer)) return 'low';
  if (/nvidia|geforce|rtx|gtx|radeon|apple m\d|apple gpu/.test(renderer)) return null; // known-strong, no cap
  if (/intel/.test(renderer)) {
    // Arc (discrete) and Iris Xe are genuinely mid-range; older
    // HD/UHD Graphics (most integrated Intel chips before Xe) are not.
    return /arc|iris\s*xe/.test(renderer) ? 'medium' : 'low';
  }
  return null;
}

const TIER_RANK = { low: 0, medium: 1, high: 2 };

function detectTier() {
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  let tier;
  if (isMobile) tier = memory >= 6 && cores >= 6 ? 'medium' : 'low';
  else if (cores <= 4 || (dpr > 2 && memory <= 4)) tier = 'medium';
  else tier = 'high';

  // GPU ceiling can only pull the tier DOWN from the CPU/RAM-based guess
  // above, never up — so this can't make a genuinely capable machine worse.
  const ceiling = classifyGpuCeiling(detectGpuString());
  if (ceiling && TIER_RANK[ceiling] < TIER_RANK[tier]) tier = ceiling;

  return tier;
}

export function resolveQuality(requested) {
  const tier = requested === 'auto' ? detectTier() : requested;
  const settings = TIERS[tier] ?? TIERS.medium;
  return { tier, ...settings };
}