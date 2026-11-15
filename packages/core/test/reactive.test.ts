import { describe, expect, it } from "vitest";
import {
  ACCENT_MOVES, proceduralAccent, DEFAULT_REACTIVE, DEFAULT_RECIPE, POSES, detectOnsets, effectiveDrive, frameAt, makeMove, planReactive, poseDistance,
  validateRecipe, type AudioDrive, type ReactiveConfig, type Recipe,
} from "../src/internal";

const FPS = 24, DT = 1 / FPS, HOP = 1 / 86;
/** RMS at 86 hops/s: quiet until 4 s, loud after, with sharp hits at the given times. */
function rmsWith(seconds: number, hits: number[], loudFrom = 4): Float32Array {
  const rms = new Float32Array(Math.ceil(seconds / HOP));
  for (let i = 0; i < rms.length; i++) rms[i] = i * HOP < loudFrom ? 0.05 : 0.35;
  for (const t of hits) for (let k = 0; k < 6; k++) { const i = Math.round(t / HOP) + k; if (i < rms.length) rms[i] = Math.max(rms[i], 1 * Math.exp(-k / 2)); }
  return rms;
}
function drive(hits: number[], seconds = 20): AudioDrive {
  const rms = rmsWith(seconds, hits);
  const frames = Math.ceil(seconds * FPS);
  const energy = new Float32Array(frames);
  for (let n = 0; n < frames; n++) energy[n] = n * DT < 4 ? 0.05 : 0.8;
  return { fps: FPS, energy, onsets: detectOnsets(rms, HOP), source: "audio" };
}
const reactiveRecipe = (cfg: Partial<ReactiveConfig> = {}, over: Partial<Recipe> = {}): Recipe => validateRecipe({
  ...structuredClone(DEFAULT_RECIPE), durationBeats: 32, moves: [makeMove("stepTouch", 0), makeMove("bounce", 16)], ...over,
  reactive: { ...DEFAULT_REACTIVE, idleBelow: 0, ...cfg },
});

describe("onset detection", () => {
  it("finds sharp hits within one hop of their time", () => {
    const hits = [5.13, 7.4, 9.92];
    const found = detectOnsets(rmsWith(12, hits), HOP).map(o => o.seconds);
    for (const t of hits) expect(Math.min(...found.map(f => Math.abs(f - t)))).toBeLessThanOrEqual(HOP + 1e-9);
  });
});

describe("reactive animation layer", () => {
  const hits = [5.13, 7.4, 9.92, 12.61];
  const d = drive(hits);
  it("lands each accent's key pose within one frame of its onset or downbeat", () => {
    const r = reactiveRecipe({ accents: ["hit", "strike", "jump", "kick"], accentOn: "both", accentGapBeats: 1.5 });
    const plan = planReactive(r, d);
    expect(plan.hits.some(h => h.source === "onset")).toBe(true);
    expect(plan.hits.some(h => h.source === "downbeat")).toBe(true);
    for (const hit of plan.hits) {
      const accent = proceduralAccent(hit.key)!;
      const key = POSES[accent.keys.find(k => k.at === 0)!.pose];
      // First frame where the overlay is fully on and the figure holds the hit pose.
      let landed = -1;
      for (let n = Math.floor(hit.seconds * FPS) - 12; n < hit.seconds * FPS + 12; n++) {
        const f = frameAt(r, n, d);
        if (f.accent?.weight === 1 && poseDistance(f.pose, key) < 1e-6) { landed = n; break; }
      }
      expect(landed, `${hit.key} at ${hit.seconds}`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(landed * DT - hit.seconds)).toBeLessThanOrEqual(DT);
      if (accent === ACCENT_MOVES.jump) {
        // Airborne before the hit, back on the floor within a frame of it.
        const before = frameAt(r, Math.round((hit.seconds - 0.2) * FPS), d).root.y;
        expect(before).toBeGreaterThan(0.05);
        expect(frameAt(r, Math.ceil(hit.seconds * FPS), d).root.y).toBeLessThan(0.02);
      }
    }
  });
  it("is deterministic for a seed, and different seeds vary", () => {
    const render = (seed: number) => Array.from({ length: 300 }, (_, n) => frameAt(reactiveRecipe({ seed }), n, d).pose);
    expect(render(3)).toEqual(render(3));
    const a = render(3), b = render(4);
    const diff = a.reduce((sum, p, n) => sum + poseDistance(p, b[n]), 0) / a.length;
    expect(diff).toBeGreaterThan(0.05);
  });
  it("repeats of a looped move are not identical (seeded variation)", () => {
    const r = reactiveRecipe({ accents: [], speed: 0 });
    // stepTouch has a 2-beat cycle (24 frames at 120 BPM).
    expect(poseDistance(frameAt(r, 30, d).pose, frameAt(r, 54, d).pose)).toBeGreaterThan(0.02);
  });
  it("loud passages play bigger than quiet ones, and quiet bars settle to idle", () => {
    const amp = reactiveRecipe({ accents: [], speed: 0, humanise: 0, amplitude: 1 }, { moves: [makeMove("armsUp", 0)] });
    // Same phase (arms up at the end of beat 2 of each pass): quiet at 1 s, loud at 9 s.
    const quiet = poseDistance(frameAt(amp, 24, d).pose, POSES.neutral), loud = poseDistance(frameAt(amp, 216, d).pose, POSES.neutral);
    expect(loud).toBeGreaterThan(quiet * 1.4);
    const idle = reactiveRecipe({ accents: [], idleBelow: 0.2 });
    const plan = planReactive(idle, d);
    expect(plan.levels[0]).toBe(0);
    expect(plan.levels[3]).not.toBe(0);
  });
  it("the arms trail the hips (overlapping action)", () => {
    const r = reactiveRecipe({ accents: [], speed: 0, humanise: 1, amplitude: 0 });
    const flat = reactiveRecipe({ accents: [], speed: 0, humanise: 0, amplitude: 0 });
    let lagged = 0;
    for (let n = 100; n < 200; n++) lagged += Math.abs(frameAt(r, n, d).pose.joints.leftElbow[0] - frameAt(flat, n, d).pose.joints.leftElbow[0]);
    expect(lagged / 100).toBeGreaterThan(0.01);
    // Hips are not lagged: they differ only by the seeded amplitude drift.
    expect(Math.abs(frameAt(r, 150, d).pose.joints.leftHip[2] - frameAt(flat, 150, d).pose.joints.leftHip[2])).toBeLessThan(0.05);
  });
  it("without a reactive layer, frameAt is the time-stretch path unchanged", () => {
    const plain = structuredClone(DEFAULT_RECIPE);
    expect(frameAt(plain, 50, d)).toEqual(frameAt(plain, 50));
  });
});

describe("example recipes", () => {
  it("A, C and D validate as recipes; D carries the reactive layer and the rig", async () => {
    const { exampleRecipes } = await import("../src/internal");
    const list = exampleRecipes();
    expect(list.map(e => e.id)).toEqual(["A", "C", "D", "D8"]);
    for (const e of list) expect(validateRecipe(JSON.parse(JSON.stringify(e.recipe)))).toEqual(e.recipe);
    const d = list.find(e => e.id === "D")!.recipe;
    expect(d.reactive && d.camera).toBeTruthy();
  });
});

describe("hit markers", () => {
  it("edited markers replace detection and still land within one frame", async () => {
    const { detectedMarkers } = await import("../src/internal");
    const d = drive([5.13, 7.4]);
    const r = reactiveRecipe({ accents: ["hit", "jump"] });
    const auto = detectedMarkers(r, d);
    expect(auto.length).toBeGreaterThan(2);
    const edited = reactiveRecipe({ accents: ["hit", "jump"], markers: [{ seconds: 6.03, accent: "strike", source: "manual" }] });
    const plan = planReactive(edited, d);
    expect(plan.hits.map(h => [h.seconds, h.key])).toEqual([[6.03, "strike"]]);
    let landed = -1;
    for (let n = 130; n < 160 && landed < 0; n++) {
      const f = frameAt(edited, n, d);
      if (f.accent?.weight === 1 && poseDistance(f.pose, POSES.strikeHit) < 1e-6) landed = n;
    }
    expect(Math.abs(landed * DT - 6.03)).toBeLessThanOrEqual(DT);
    expect(() => reactiveRecipe({ markers: [{ seconds: 2, accent: "nope" as never, source: "manual" }] })).toThrow(/accent/);
  });
});

describe("a hand-drawn energy curve drives the reactive layer (docs/recipe.md `energyCurve`)", () => {
  const hits = [5.13, 7.4, 9.92, 12.61];
  const quietThenLoud = drive(hits);
  // The same onsets, loud throughout: under the curve only the onsets may matter.
  const loud: AudioDrive = { ...quietThenLoud, energy: new Float32Array(quietThenLoud.energy.length).fill(0.8) };
  const cfg: Partial<ReactiveConfig> = { accents: ["hit", "strike", "jump", "kick"], accentOn: "both", accentGapBeats: 1.5 };
  const plain = reactiveRecipe(cfg);
  const curved = validateRecipe({ ...plain, energyCurve: { rate: 4, values: new Array(80).fill(0.3) } });
  const frames = (r: Recipe, d: AudioDrive) => Array.from({ length: 300 }, (_, n) => JSON.stringify(frameAt(r, n, d).pose));

  it("replaces the analysed energy for tempo and amplitude: the track's loudness no longer shows", () => {
    expect(frames(curved, quietThenLoud)).toEqual(frames(curved, loud));
    expect(frames(plain, quietThenLoud)).not.toEqual(frames(plain, loud));
    expect(frames(curved, loud)).not.toEqual(frames(plain, loud));
    expect(frameAt(curved, 150, loud).energy).toBeCloseTo(0.3, 6);
  });

  it("keeps the track's onsets, so the hits land where they did", () => {
    const at = (r: Recipe) => planReactive(r, effectiveDrive(r, loud)).hits.map(h => h.seconds);
    expect(at(curved)).toEqual(at(plain));
  });

  it("switching between a recipe with and without the curve re-plans each time (the plan's memo)", () => {
    const n = 40;
    const a = JSON.stringify(frameAt(plain, n, quietThenLoud)), b = JSON.stringify(frameAt(curved, n, quietThenLoud));
    expect(b).not.toBe(a);
    expect(JSON.stringify(frameAt(plain, n, quietThenLoud))).toBe(a);
    expect(JSON.stringify(frameAt(curved, n, quietThenLoud))).toBe(b);
  });
});
