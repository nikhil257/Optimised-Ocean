export const DEFAULTS = {
  // --- Embed -----------------------------------------------------------
  container: "[data-ocean-intro]", // selector or HTMLElement
  zIndex: 9999,
  once: true, // play once per visitor
  storageKey: "oceanIntro:v1:done",
  forceParam: "intro", // ?intro=force replays the experience
  debug: false,

  // --- Scroll feel (12 cards)------------------------------------------------------
  scroll: {
    wheelFactor: 0.00003, // full experience ≈ 7700px of scrolling
    touchFactor: 0.00015,
    slowGain: 0.28, // input gain — a wheel tick advances ~1/4 as far
    slowSmoothing: 0.6, // easing rate — lower drifts longer and dreamier.
  },

  // --- Quality ---------------------------------------------------------
  quality: "auto", // 'auto' | 'high' | 'medium' | 'low'

  // --- Color script (locked to the approved cold North Sea grade) ------
   palette: {
    //-------------NEW PALETTE----------------
    skyZenith: "#083d63",
    skyHorizon: "#6cc2e3",
    waterBase: "#004A83",
    waterScatter: "#032831",
    sunTint: "#faf6e5",
    foam: "#074b5c",
    fogNearUnderwater: "#579FB8",
    fogFarUnderwater: '#3C819E',
    deepFog: "#28657F",
    abyss: "#579FB8",
    uiText: "#e5faff",
    uiMuted: "#94e6fb",
    scrim: "#083d63",
  },

  // --- Sun / lighting --------------------------------------------------
  sun: {
    elevation: 24, // degrees above horizon — low, cold light
    azimuth: 205, // degrees; roughly toward the camera's left
  },

  // --- Ocean surface ---------------------------------------------------
  ocean: {
    size: 1600, // plane extent in meters
    underFogFar: 420, // was hardcoded 45 — the ceiling melted before
    // any texture could be seen
    underCausticScale: 0.08, // cell size. Higher = smaller, busier cells
    underCausticStrength: 0.09, // brightness of the lattice
    underCausticFadeStart: 65, // depth (m) where it begins to fade
    underCausticFadeEnd: 95, // depth where it's gone
    underCausticSpeed: 20,

    waves: [
      [-0.66, 0.64, 0.28, 95.0],
      [-0.79, 0.5, 0.18, 62.0],
      [-0.61, 0.79, 0.14, 37.0],
      [-0.75, 0.65, 0.07, 18.0],
    ],
    detailStrength: 0.09, // fragment-level normal chop
    scatterStrength: 1.15,
    glitterStrength: 8,
  },

  // --- Camera ----------------------------------------------------------
  camera: {
    fov: 50,
    height: 12.2, // meters above waterline
    mouseYaw: 3.5, // degrees of mouse parallax
    mousePitch: 1.8,
    maxLookYaw: 7.04, // underwater gaze deviation cap (±deg) — tuned for a
    // subtle ~25px on-screen sway (x-axis) at full mouse deflection, not a
    // free-look. Nudge to taste; the on-screen result scales roughly
    // linearly with this value (1.04 -> 2.08 doubles the visible sway).
    maxLookPitch: 0.5, // ~15px on-screen sway (y-axis, up/down), same scaling.
    driftDistance: 96, // forward dolly across Phase 1 scroll range
  },

  beach: {
    video: "/new.mp4",
    logo: "/logo.glb",
    logoSize: 4.5,
    fov: 42,
    cameraStart: [0, 0, 8],
    spin: 0,
    flyStart: 0, // fractions OF the beach segment, not global
    flyEnd: 0.9,
    flashAt: 0.0001,
    approachGap: 0.5, // how far short of the centre stage one stops
    passDistance: 5, // how far PAST the centre it ends up
    lookDistance: 10, // look-at point beyond the logo
    flyMid: 0.6, // split between approach and punch-through
    tiltMax: 25, // degrees of pointer tilt
    tiltEase: 0.05,
    tiltFadeStart: 0.5, // tilt eases out between these (fractions of beach)
    tiltFadeEnd: 0.65,
    bob: 0, // idle float, 0 = locked. 0.15 for a slow breath
    bobSpeed: 1.2,
    videoZoom: 0.7,
    videoBlur: 10,
    flashHold: 0.35, // seconds of solid white before it starts clearing
    flashFade: 1.7,
    sunPos: [-5, 6, 3],
    shadowOpacity: 0.34,
    shadowSoftness: 4,
    shadowSpan: 8,
    shadowMapSize: 1024,
    shadowBias: -0.0012,
    groundY: -2.4,
    groundSize: 60,
    shadowFadeAt: 0.55,
  },

  // --- Reveal (post white-flash) ---------------------------------------
  reveal: {
    flashHold: 0.35, // seconds of full white before the fade
    flashFade: 1.7, // white → scene
    settleDuration: 3.2, // camera settle-down move
  },

  // --- Dive transition (M3) ---------------------------------------------
  dive: {
    depth: 26, // meters below surface at rest
    anticipation: 1.5, // upward breath before the plunge
    plungeDuration: 2.5, // surface approach + punch-through
    diveSettleDuration: 0.7, // deceleration to rest
    fovEaseIn: 1.2, // seconds to widen from the rest FOV into rushFov.
    fovKick: 8, // degrees of FOV punch at the crossing frame
    rushFov: 50, // base FOV for the whole rush/tunnel
    rushFovKick: 14, // added on top of rushFov
    fovBlendStart: 0.5,
    approachDistance: 30, // meters of slow straight travel before entering the tunnel
    approachDuration: 0.5, // seconds

    // Centerline curve — bends the whole tube into an S / C / helix.
    tunnelAmbientEnter: 0.35, // was 0.35 — fully outside at rest
    tunnelCurve: {
      amp: [55, 40, 20], // [x, y, z] — add the 3rd value for the Z bend, e.g. [8, 4, 6]
      freq: 0.09,
      phase: -0.9,
    },

    tunnelEntry: {
      // NEW block
      offset: [0, 0], // [x, y] meters off-axis while outside
      dist: 20, // meters the mouth sits ahead while outside
    },

    // The rush: current sweep → drop → seabed arrival
    currentDuration: 4.2, // banked lateral S-sweep, carried by the current
    dropDuration: 4.0, // the plummet toward the seabed
    settleDuration: 1.1, // deceleration + leveling out above the sand
    sweepWidth: 5, // lateral throw of the current (meters)
    bankAngle: 3, // camera roll into the sweep (degrees)
    forwardDistance: 83, // total forward travel across the whole rush
    arrivalHeight: 8, // rest height above the seabed
    arrivalX: -10, // lateral world x the rush lands on — the journey's first
    // waypoint is anchored to this same landing spot (see journey.waypoints),
    // so the tunnel's end and the ocean's start are always the same point.
    tunnelAmbientReveal: 0.7, // opacity of the vortex behind the opening title (0 = off)
    tunnelAppearAt: 0.15, // fraction of the approach glide when the tunnel ramps to full
    tunnelCount: 22000, // droplets in the vortex tunnel
    tunnelRadius: 8, // tube radius — camera weave stays inside it
    tunnelSpeed: 18, // forward scroll speed of the droplets (velocity feel)
    tunnelLength: 180, // visible tube extent ahead and behind
    tunnelBend: 70, // how far the far mouth swings with the turns (m)
    tunnelFlare: 0.0009, // trumpet flare — keeps the dark mouth open ahead
    tunnelSwirl: 0.8, // rotation speed of the wall (reference: slow churn)
    tunnelTwist: 0.06, // helix phase shift along the tube
    tunnelFlow: 1, // overall current-weaving strength (0 = clean ring, higher = tangled)
    tunnelFlowAmp: 3.0, // turbulent displacement in meters (how far strands braid off the tube)
    tunnelNoiseScale: 0.7, // turbulence frequency (higher = finer, choppier strands)
    tunnelSize: 2.4, // particle size
    tunnelColor: "#6dbec0", // base current color (additive)
    tunnelColorBright: "#9cdaea", // highlight color for the brighter strands
    tunnelMouthColor: "#094368",

    // --- RushSwirl: the turbulent water shell around the camera -----------
    // Rendered on a BackSide sphere, but the pattern is mapped from view
    // DIRECTION only — so radius/spacing affect layering and nothing else.
    swirlLayers: 0, // how many nested shells stack up. Each extra layer adds depth but costs a full-screen pass; 1 is plenty.
    swirlBaseRadiusMult: 3.25, // innermost shell radius, in multiples of the rays outer edge (tunnelRadius × rayOuterRadiusMult). Only affects draw order vs other geometry, not scale.
    swirlLayerSpacing: 1.3, // radius gap between successive layers (same units). Irrelevant while swirlLayers is 1.
    swirlBendScale: 0.22, // how strongly the ride's banking drags the pattern. sideways. 0 = swirl ignores the turns entirely.
    swirlFlowSpeed: 15.95, // how fast the pattern streams along the travel axis — the sense of rushing THROUGH it.
    swirlAngularFreq: 6.0, // how many turbulence bands wrap around the axis. Higher = finer, busier ribs; lower = broad sweeps.
    swirlLengthFreq: 2.45, // pattern frequency ALONG the axis. Low values stretch. it into long streaks; high values chop it up.
    swirlOpacity: 0.5, // overall strength. This is the main visibility dial; push past ~0.3 and it starts fogging the tunnel.
    swirlContrastLow: 0.35, // noise value where the swirl starts becoming visible.
    swirlContrastHigh: 1.5, // noise value where it reaches full brightness. Narrow the gap for hard, defined strands; widen it for a soft haze.


    rushPath: [
      {
        t: 0.0,
        x: 0.0,
        depth: 0.0,
        forward: 0.0,
        roll: 0.0,
        look: -30,
        fov: 0,
      },
      {
        t: 0.16,
        x: -1.0,
        depth: 0.16,
        forward: 0.14,
        roll: 1.0,
        look: -40,
        fov: 1,
        ease: "power2.inOut",
      },
      {
        t: 0.34,
        x: 1.0,
        depth: 0.24,
        forward: 0.32,
        roll: -1.0,
        look: -44,
        fov: 1,
        ease: "power2.inOut",
      },
      {
        t: 0.55,
        x: -0.55,
        depth: 0.4,
        forward: 0.52,
        roll: 0.6,
        look: -60,
        fov: 1,
        ease: "power2.inOut",
      },
      {
        t: 0.8,
        x: 0.2,
        depth: 0.78,
        forward: 0.76,
        roll: 0.0,
        look: -140,
        fov: 1,
        ease: "power2.in",
      },
      {
        t: 1.0,
        x: 0.1,
        depth: 1.0,
        forward: 1.0,
        roll: 0.0,
        look: -3,
        fov: 0,
        ease: "power1.out",
      },
    ],
  },

  // --- Underwater environment (M4) --------------------------------------
  underwater: {
    seed: 1337, // layout is authored via seed, identical every visit
    floorDepth: 120, // meters below the surface
    floorSize: 1500, // was 900 — larger seabed; its far edge now sits in full fog
    dropOffZ: -370, // world -z where the shelf begins (more negative = further out)
    dropOffWidth: 270, // slope length — larger = gentler, softer edge (was 70)
    dropOffDepth: 50, // how far it plunges
    dropOffWaver: 60, // noise on the edge so it's organic, not a straight line
    restZ: 46, // |z| of the dive rest pose (matches camera.driftDistance)
    areaLength: 520, // corridor length toward -z for the M5 journey
    areaWidth: 200,
    fogDensity: 0.12, // was 0.03 — sim: sand stays beige to ~50m, blue only far
    fogDensityDeep: 0.006, // near-clear once deep
    kelpCount: 420,
    kelpModels: [
      { url: "/seaweed.glb", weight: 60, color: "#3f6f52", scale: 0.45 }, // most
      { url: "/meshn.glb", weight: 30, scale: 0.45 }, // less
      { url: "/mushroom.glb", weight: 2, scale: 0.14 }, // rare, small
    ],
    kelpSway: 0.9, // plant sway strength (0 = stiff)
    kelpEmbed: 0.0, // base offset vs seabed (negative tucks roots into sand)
    rockCount: 189,
    rockModels: ["/fd-rock.glb", "/rock.glb"],
    rockModelSize: 3, // normalized max extent — matches the old base rock's size
    fishCount: 200, // the NEAR school you swim past (full 3D, expensive)

    // --- FishSheet: the distant mass ------------------------------------
    sheetZ: 600,
    sheetAnchorZ: -126,
    sheetOffsetX: -10,
    sheetHeight: 20,
    sheetScale: 1.2, // orbit size (base rx 24, ry 12)
    sheetSize: 1, // fish size, independent of orbit
    sheetSpeed: 0.18,
    sheetTurn: 0.075, // slerp rate — lower turns lazier
    sheetBank: 0.42,
    sheetTiltX: -0.2, // radians
    sheetTiltZ: -20, // degrees
    sheetDrift: 1,
    sheetAspect: 1.9, // plane length:height. Lower = fatter.
    sheets: [
      // Existing one, unchanged — it just moves into the array.
      {
        sheetZ: 400,
        sheetOffsetX: -50,
        sheetHeight: 20,
        sheetScale: 1.2,
        sheetSize: 1,
        sheetSpeed: 0.18,
        sheetTurn: 0.075,
        sheetBank: 0.42,
        sheetTiltX: -0.2,
        sheetTiltZ: -20,
        sheetDrift: 1,
        sheetAspect: 1.9,
      },
      // Second, behind the "Go Live" card. Camera ends at (20.5, -106, -726),
      // so this sits ~14m ahead and slightly left of it.
      { sheetZ: 715, sheetOffsetX: 5, sheetScale: 0.8 },
    ],
    fishModels: [
      // (6) TWO models now
      {
        name: "fishA",
        url: "/fishh.glb",
        weight: 60,
        size: 3,
        rotation: [0, Math.PI, 0],
      },
      { name: "fishB", url: "/fish.glb", weight: 40, size: 2.2 },
    ],

    fishSheetShare: 0,
    fishClusters: 22, // (3) was 10
    fishGroupSizes: [17, 15, 22, 19, 18, 8, 16, 22, 20, 20], // (4) varied
    fishFromDz: 2, // (2) right where the rush drops you
    fishToDz: 750, // (4) the final waypoint
    fishSideMin: 3,
    fishSideMax: 40, // wide spread → real size variation
    fishSpeedSlow: 0.0575, // +15% (was 0.05)
    fishSpeedFast: 0.46, // +15% (was 0.4)
    fishFormation: {
      shape: "cloud",
      width: 10.4, // (6) +30%
      height: 5.9, // (6) +30%
      depth: 11.7, // (6) +30%
      bias: 0.9,
    },

    fishModelSize: 3, // longest axis, in meters
    fishModelRotation: null, // [x, y, z] radians — see below
    fishWagFront: 0.9, // tail-wag zone along the body…
    fishWagBack: -1.8, // …in model units
    particleCount: 5000,
    bubbleCount: 8600,
    rayOriginX: -35, // shafts cluster this far LEFT of the path
    raySpread: 90, // how wide that cluster is at the surface
    rayFan: 0.03, // divergence. 0 = parallel curtain, 0.03 = strong fan
    godRayCount: 30, // was 160 — fewer, less busy
    rayIntensity: 1, // was 3.0 — softer overall; depth curve handles shallow vs deep
    rayFadeStart: 12,
    rayFadeEnd: 55,

    //SHARKS
    sharkCount: 5,
    sharkModel: "./shark.glb", // longest axis, in meters
    sharkModelSize: 14, // longest axis, in meters
    sharkModelRotation: [0, Math.PI, 0],
    sharkWagFront: 1.0, // wag starts around mid-body
    sharkWagBack: -4.5, // full amplitude at the tail tip
    sharkHeadingOffset: 0, // radians, to flip direction without re-rotating
    sharkBelly: "#5c8d9d", // pale underside

    fleeRadius: 19, // fish within this of the cursor dart away (m)
    fleeForce: 17, // how far they scatter
    colors: {
      sand: "#A99F88", // light warm beige — clean, sunlit floor
      sandDeep: "#817F75", // cooler shadowed sand (ripple troughs / distance)
      rock: "#37453F",
      kelp: "#2F4A42",
      fish: "#8FAAB0",
      fish2: "#7C93B8", // second species — cooler blue
      algae: "#57744E", // reef-green patches on rocks
      ray: "#B5D0DC", // bright cyan-white light shafts
      caustic: "#A8CBD8",
      particle: "#849EA8",
      bubble: "#A5BEC7",
    },

    reef: {
      fogDensity: 0.01, // ~95% at 375m — genuinely long visibility
      fogDensityFar: 0.012,
      fogColor: "#4FA8C4", // bright cyan, not dark teal — THIS is what reads as "clear"
      columnNear: "#5FBAD2",
      columnDeep: "#2E7FA0",
      abyss: "#1A5573",
      depthMood: 1.5, // lower = brighter
    },
  },

  // --- The scroll journey (M5) ------------------------------------------
  journey: {
    lookAhead: 0.04, // gaze aims this far ahead along the curve (0..1)
    fov: 20, // FOV once you're in the ocean
    fovEase: 0.6, // how fast it eases in. Higher = snappier
    //beatWindow: 0.1,       // how long each story beat stays present (in t)
    beatWindow: 0.1, // legacy fallback — prefer the two below:
    beatHold: 0.022, // half-width of the full-opacity plateau (in t)
    beatFade: 0.02, // width of each fade ramp (in t). Widened from
    // 0.011 to give the exit zoom room to read — at
    // 0.011 the card is transparent before it grows.
    beatRange: [0.24, 0.9], // beats without an explicit `at` spread evenly here
    beatSmoothing: 6, // temporal softness: lower = dreamier, higher = snappier
    beatRise: 60, // entrance travel in px (0 = pure fade, no movement)

    // Exit motion. The card accelerates toward the lens and blows past it,
    // rather than fading out where it stood. The entrance is unchanged.
    beatZoom: 1.2, // extra scale by the end of the exit (0 = no zoom)
    beatPush: 220, // px of outward drift; left cards go left, right right
    beatSlow: 1, // scroll slowdown while a card is up. 0 = off, 1 =
    // full blend toward scroll.slowGain / slowSmoothing

    // Handoff from the rush. The spline is anchored to wherever the rush
    // actually landed, so these only shape how it leaves that pose:
    entryLead: 14, // meters the path runs straight ahead before curving
    handoffBlend: 0.7, // seconds easing out of the rush's final orientation

    // Waypoints RELATIVE to the rush's landing pose:
    //   x = lateral offset, h = height above seabed, dz = meters further ahead
    // The FIRST waypoint must stay at {x:0, dz:0} with h matching
    // dive.arrivalHeight — that's what makes the curve's start point
    // coincide exactly with where the rush camera lands, so the tunnel's
    // end and the journey's start are the same point (no jump/seam).
    waypoints: [
      { x: 0, h: 8, dz: 0 },
      { x: -12, h: 17, dz: 135 },
      { x: 20, h: 21, dz: 200 },
      { x: -20, h: 15, dz: 305 },
      { x: 20, h: 14, dz: 600 },
    ],
    //UnderWater story beats: each has a time (0..1) and a side for the UI panel to appear on.
    beats: [
      {
        side: "left",
        label: "We Got a Project",
        heading: "So… what are we actually building?",
        text: "We gather requirements, goals, and approximately 47 questions.",
        image: "./first.gif",
      },
      {
        side: "right",
        label: "Let’s wireframe this boy.",
        heading: "Chaos to Structure",
        text: "We map the structure, flow, and content. Boxes first.",
        image: "./second.gif",
      },
      {
        side: "left",
        label: "Pixels Get Pretty",
        heading: "Okay, now make it look expensive.",
        text: "We turn wireframes into polished, interactive designs.",
        image: "./third.gif",
      },
      {
        side: "right",
        label: "One Tiny Change",
        heading: "Can we just try one small thing?",
        text: "We review, revise, tweak, and repeat. You know the drill.",
        image: "./fourth.gif",
      },
      {
        side: "left",
        label: "Developer Has Entered",
        heading: "My time has come.",
        text: "Design meets code. Pixels become a real website.",
        image: "./fifth.gif",
      },
      {
        side: "right",
        label: "Umm.. Are We Actually Done?",
        heading: "Wait… did we check everything?",
        text: "One last check. Then another. Just to be sure.",
        image: "./six.gif",
      },
      {
        side: "left",
        label: "Everyone Ready For Launch?",
        heading: "Money Money Money",
        text: "The new website is live. Time to turn traffic into revenue.",
        image: "./seventh.gif",
      },

      //CARDS WITH IMAGE
      // { at: 0.3, side: 'right', label: 'Protected areas',
      // heading: 'How |marine protected areas| work',
      // text: 'Defined boundaries, no physical barriers…',
      // image: 'https://your-cdn.com/mpa.jpg',
      // imageAlt: 'Waves off Ascension Island',
      // caption: 'MARINE PROTECTED AREA: ASCENSION ISLAND' },

      //CARDS WITH VIDEO
      // { at: 0.5, side: 'left', label: 'The current',
      // heading: 'Life in |motion|',
      // text: '…',
      // video: 'https://your-cdn.com/reef-loop.mp4',
      // poster: 'https://your-cdn.com/reef-poster.jpg',   // shown before playback
      // caption: 'FILMED AT BERWICKSHIRE COAST' },
    ],
  },

  // --- Post-processing -------------------------------------------------
  post: {
    bloom: { intensity: 0.28, threshold: 0.78, smoothing: 0.2 },
    transition: { scale: 5.0, edge: 0.06 }, // scale = shred size, edge = softness
    grain: 0.03,
    vignette: { offset: 0.28, darkness: 0.62 },
    grade: {

      lift: [0.0, 0.0, 0.006], // near-zero — keeps blacks clean instead of greyed/lifted
      gain: [1.0, 1.03, 1.08], // slight punch, biased toward blue
      gamma: [0.97, 0.97, 0.95], // brighten midtones a touch
      saturation: 1, // vivid, not the old muted 0.88
    },
    exposure: 1.0,

    // Grade target while submerged — crushed toward the deep palette.
    gradeUnderwater: {
      lift: [0.0, 0.006, 0.014], // keep blacks clean, tiny blue lift only
      gain: [0.98, 1.0, 1.04], // was [0.82,0.98,1.12] — that blue-tinted EVERYTHING; near-neutral now lets sand/moss show
      gamma: [1.0, 1.0, 0.98], // barely-there blue midtone lift
      saturation: 1.0, // was 1.05 — avoid over-saturating the blue cast
    },

    // Grade after the descent rush — the deep, silent clearing.
    gradeDeep: {
      lift: [0.006, 0.014, 0.022], // small clean lift, no grey wash
      gain: [1.0, 1.0, 1.05], // was [0.92,1.02,1.14] — near-neutral, only a hint of blue
      gamma: [1.02, 1.0, 0.97],
      saturation: 1.0, // was 0.95
    },
  },

  // --- Content (all client-configurable) -------------------------------
  content: {
    heading: "Welcome To The\nFlowdojo World",
    description:
      "Every breath begins in the ocean. Descend into the quiet world that keeps ours alive.",
    cta: "Dive in",

    // Underwater title card (shown at the dive's rest pose)
    underwater: {
      heading: "Journey to the\nflowdojo ocean",
      description: "",
      cta: "Ready to begin",
    },

    // Final card at the journey's end (M6)
    outro: {
      heading: "The journey\nbegins here",
      description: "",
      cta: "Go Live",
      url: "", // destination on click; empty = just end the intro
    },
  },

  segments: {
    beach: [0.0, 0.1],
    oceanReveal: [0.1, 0.262],
    ui: [0.262, 0.334],
    dive: [0.334, 0.37],
    underwater: [0.37, 0.928],
    outro: [0.928, 1.0],
  },
};

export function deepMerge(base, patch) {
  if (!patch) return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch)) {
    const b = base?.[key];
    const p = patch[key];
    out[key] =
      p &&
      typeof p === "object" &&
      !Array.isArray(p) &&
      b &&
      typeof b === "object" &&
      !Array.isArray(b)
        ? deepMerge(b, p)
        : p;
  }
  return out;
}
