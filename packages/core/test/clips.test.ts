import { describe, expect, it } from "vitest";
import {
  CLIP_ACCENTS, LOOP_CLIPS, clipPlanFor, defaultPhaseBoundaries, defaultRiggedRecipe, frameAt, riggedMove, secondsAtBeat,
  stepCount, validateRecipe, type AudioDrive, type HitMarker, type Recipe,
} from "../src";

const FPS = 24, DT = 1 / FPS;
const flat = (energy = 0.6, frames = 800): AudioDrive => ({ fps: FPS, energy: new Float32Array(frames).fill(energy), onsets: [], source: "audio" });
const rigged = (over: Partial<Recipe> = {}, markers?: HitMarker[]): Recipe => {
  const r = defaultRiggedRecipe();
  return validateRecipe({ ...r, durationBeats: 24, moves: [riggedMove("Dance_Loop", 0)], ...over,
    reactive: { ...r.reactive!, ...(markers ? { markers } : {}) } });
};
const layer = (f: ReturnType<typeof frameAt>, clip: string) => f.layers.filter(l => l.clip === clip).sort((a, b) => b.weight - a.weight)[0];

describe("clip performance (rigged mannequin)", () => {
  it("is deterministic: the same recipe and drive give the same schedule", () => {
    const r = rigged(), d = flat();
    const run = () => Array.from({ length: 300 }, (_, n) => frameAt(r, n, d));
    expect(run()).toEqual(run());
    expect(frameAt(r, 177, d)).toEqual(run()[177]);
  });
  it("time-warps loops so a step lands on every beat", () => {
    const r = rigged({ reactive: undefined });
    const lib = LOOP_CLIPS.Dance_Loop; // two bounces per cycle, first at 0.267 s
    for (const b of [1, 2, 5, 8]) {
      const n = Math.round(secondsAtBeat(r.beatGrid, b) * FPS);
      const t = layer(frameAt(r, n), "Dance_Loop").time!;
      const fromStep = ((t - lib.firstStep) % (lib.seconds / lib.steps) + lib.seconds) % (lib.seconds / lib.steps);
      expect(Math.min(fromStep, lib.seconds / lib.steps - fromStep)).toBeLessThan(1e-6);
    }
  });
  const markers: HitMarker[] = [
    { seconds: 3.0, accent: "jump", source: "manual" },
    { seconds: 6.27, accent: "jab", source: "manual" },
    { seconds: 8.5, accent: "sword", source: "manual" },
    { seconds: 10.6, accent: "cross", source: "manual" },
  ];
  it("lands the jump and places each impact frame within one frame of its marker", () => {
    const r = rigged({}, markers), d = flat();
    const plan = clipPlanFor(r, d);
    expect(plan.hits.map(h => h.key)).toEqual(["jump", "jab", "sword", "cross"]);
    for (const m of markers) {
      const accent = CLIP_ACCENTS[m.accent]!;
      const key = accent.phases[accent.contact];
      // The frame where the key phase's clip reaches its key time.
      let at = -1;
      for (let n = Math.floor(m.seconds * FPS) - 6; n <= m.seconds * FPS + 6 && at < 0; n++) {
        const l = layer(frameAt(r, n, d), key.clip!);
        if (l && l.accent && Math.abs(l.time! - key.to) < 0.05 && l.time! >= key.to - 1e-9) at = n;
      }
      expect(at, m.accent).toBeGreaterThanOrEqual(0);
      expect(Math.abs(at * DT - m.seconds)).toBeLessThanOrEqual(DT);
    }
    // Airborne before the landing, on the floor at it.
    expect(frameAt(r, Math.round((3.0 - 0.2) * FPS), d).root.y).toBeGreaterThan(0.1);
    expect(frameAt(r, Math.round(3.0 * FPS), d).root.y).toBeLessThan(0.01);
  });
  it("retimed phases move the take-off and keep the landing on the hit", () => {
    const def = defaultPhaseBoundaries(CLIP_ACCENTS.jump!, 0.5);
    const early = def.map((b, i) => (i <= 2 ? b - 0.5 : b)); // coil and take-off half a beat earlier
    const r = rigged({}, [{ seconds: 3.0, accent: "jump", source: "manual", phases: early }]), d = flat();
    const takeoff = (rr: Recipe) => {
      for (let n = 40; n < 72; n++) if (frameAt(rr, n, d).root.y > 0.005) return n;
      return -1;
    };
    expect(takeoff(r)).toBeLessThan(takeoff(rigged({}, [markers[0]])) - 3);
    expect(frameAt(r, Math.round(3.0 * FPS), d).root.y).toBeLessThan(0.01);
  });
  it("the step lane sets the amplitude per step", () => {
    const r = rigged();
    const d = flat();
    const count = stepCount(r.durationBeats, 8);
    const amplitude = Array.from({ length: count }, (_, i) => (i >= 16 && i < 24 ? 1.4 : 0.3));
    const edited = validateRecipe({ ...r, steps: { division: 8, amplitude } });
    const at = (beat: number) => frameAt(edited, Math.round(secondsAtBeat(r.beatGrid, beat) * FPS), d).amplitude!;
    expect(at(10.5)).toBeGreaterThan(1.2);   // steps 16–23 are beats 8–12 at 1/8
    expect(at(4.5)).toBeLessThan(0.4);
    const changed = { ...edited, steps: { division: 8 as const, amplitude: amplitude.map(() => 1) } };
    expect(frameAt(changed, 250, d).amplitude).not.toEqual(frameAt(edited, 250, d).amplitude);
  });
  it("an edited energy curve replaces the analysed one", () => {
    const r = rigged({ steps: undefined });
    const loud = validateRecipe({ ...r, energyCurve: { rate: 12, values: new Array(200).fill(1) } });
    expect(frameAt(loud, 100, flat(0.1)).amplitude!).toBeGreaterThan(frameAt(r, 100, flat(0.1)).amplitude! + 0.3);
  });
});
