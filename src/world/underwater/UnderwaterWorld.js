import { Group } from 'three';
import { SandFloor } from './SandFloor.js';
import { Rocks } from './Rocks.js';
import { Kelp } from './Kelp.js';
import { FishSchool } from './FishSchool.js';
import { ParticleField } from './ParticleField.js';
import { GodRays } from './GodRays.js';
import { FishSheet } from './FishSheet.js';
// import { Group } from 'three';

// Owner of the whole underwater environment. Built lazily (during the UI
// phase's dwell time), hidden until the dive's crossing frame. Seeded RNG so
// the layout is identical on every visit — the world is authored, not random.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class UnderwaterWorld {
  constructor(config, quality, sunDir) {
    const rng = mulberry32(config.underwater.seed);

    this.group = new Group();
    this.group.visible = false;

    // The reef: everything that lives at the seabed. Hidden until the rush.
    this.reefGroup = new Group();
    this.reefGroup.visible = false;
    this.group.add(this.reefGroup);

    // Construct in the ORIGINAL order so the shared rng produces the same
    // layout as before, then sort meshes into their groups.
    const sandFloor = new SandFloor(config, quality, sunDir);
    const rocks = new Rocks(config, quality, sunDir, rng);
    const kelp = new Kelp(config, quality, sunDir, rng);
    const fish = new FishSchool(config, quality, rng);
    // One FishSheet per entry in underwater.sheets. Each entry is a set of
    // overrides merged onto the shared underwater config, so a sheet only has
    // to name what makes it different (side, distance, height).
    const sheetDefs = config.underwater.sheets ?? [{}];
    const fishSheets = sheetDefs.map(
      (o) => new FishSheet(
        { ...config, underwater: { ...config.underwater, ...o } },
        quality,
        rng,
      ),
    );
    const godRays = new GodRays(config, quality, sunDir, rng);

    this.columnSystems = [godRays];
    this.reefSystems = [sandFloor, rocks, kelp, fish, ...fishSheets];
    // Exposed so the dev tuner (?tune=sheet) can drive the first one live.
    this.fishSheets = fishSheets;
    this.fishSheet = fishSheets[0];
    this.systems = [...this.columnSystems, ...this.reefSystems];

    for (const s of this.columnSystems) this.group.add(s.mesh);
    for (const s of this.reefSystems) this.reefGroup.add(s.mesh);

    this.particles = new ParticleField(config, quality, rng);
    this.group.add(this.particles.snow);
    this.group.add(this.particles.bubbles);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /** Reveal the seabed world — called when the descent rush begins. */
  setReefVisible(v) {
    this.reefGroup.visible = v;
  }

  /**
   * Depth mood, 0 (shallow arrival) → 1 (deep clearing). Thickens the fog on
   * every underwater material and starves the god rays.
   */
  setDepth(t, fogBase, fogDeep) {
    const density = fogBase + (fogDeep - fogBase) * t;
    for (const s of this.systems) {
      const materials = s.materials ?? (s.material ? [s.material] : []);
      for (const mat of materials) {
        const u = mat.uniforms;
        if (u.uFogDensity) u.uFogDensity.value = density;
        // God rays: soft on the shallow first dive (t≈0), building as you go
        // deep (t≈1) — the opposite of the old `1 - t*0.4`, per the brief.
        if (u.uIntensity) u.uIntensity.value = 0.25 + t * 0.55;
      }
    }
  }

  update(time, cameraPos, pointerWorld) {
    if (!this.group.visible) return;
    for (const s of this.columnSystems) s.update(time, cameraPos, pointerWorld);
    if (this.reefGroup.visible) {
      for (const s of this.reefSystems) s.update(time, cameraPos, pointerWorld);
    }
    this.particles.update(time);
  }

  dispose() {
    for (const s of this.systems) s.dispose();
    this.particles.dispose();
  }
}