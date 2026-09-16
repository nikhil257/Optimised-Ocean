# Ocean Intro

Cinematic, embeddable WebGL intro experience. Cold North Sea grade, single-scene
architecture, ships as one IIFE script + one container div for Webflow.

## Commands

```bash
npm install
npm run dev       # local harness at http://localhost:5173
npm run build     # dist/ocean-intro.js (CDN-ready IIFE, window.OceanIntro)
```

Replay after completing: append `?intro=force` to the URL.

## Webflow integration

```html
<div data-ocean-intro></div>
<script src="https://your-cdn.com/ocean-intro.js"></script>
<script>OceanIntro.init({ /* overrides of src/config/defaults.js */ })</script>
```

All styles live inside a Shadow DOM — zero conflicts with host CSS. Fonts
inherit from the host via `--ocean-intro-font`.

## Architecture

```
src/index.js          public API (init / destroy / on('complete')), run-once gate
src/config/           DEFAULTS — every tunable value incl. the color script
src/core/App.js       renderer, loop, resize, reveal choreography, lifecycle
src/core/Quality.js   device tier → resolution / geometry / post settings
src/core/ScrollEngine virtual scroll (wheel/touch/keys) → damped progress 0..1
src/core/Persistence  run-once (localStorage + cookie fallback + ?intro=force)
src/world/ocean/      Gerstner surface + custom water BRDF (no textures yet)
src/world/sky/        analytic gradient sky, shared chunk with ocean reflections
src/post/             composer: bloom → ACES → grade (lift/gamma/gain) → vignette → grain
src/phases/           per-phase camera choreography; reads scroll progress only
src/embed/            Shadow DOM mount: canvas, UI layer, flash overlay, skip button
```

One scene, one canvas, one master `progress` value. Phases own camera behavior
for their segment of the timeline (`config.segments`).

## Milestone status

- [x] M0 — foundation: embed shell, quality tiers, scroll engine, run-once
- [x] M1 — ocean surface, sky, sun glitter, crest scatter, fog, post chain, reveal
- [ ] M2 — integrated UI (heading / description / CTA)
- [ ] M3 — dive transition (surface crossing, grade crossfade)
- [ ] M4 — underwater environment (caustics, god rays, fish, vegetation)
- [ ] M5 — scroll storytelling (Theatre.js camera path, content beats)
- [ ] M6 — outro CTA, packaging, QA/perf pass

Until M2 lands, reaching the end of the ocean segment (or Skip) completes the
intro and reveals the host page.

## Accessibility floor

- `prefers-reduced-motion`: calmer sea, no settle flight, instant transitions
- Skip button, keyboard scrolling (arrows / page keys / space), focus-visible styles
