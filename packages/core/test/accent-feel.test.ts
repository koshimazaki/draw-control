import { describe, expect, it } from "vitest";
import {
  CLIP_ACCENTS, IMPACT_HOLD_FRAMES, anticipationBeats, clipPlanFor, defaultRiggedRecipe, frameAt, riggedMove, setAnticipation, setImpact,
  validateRecipe, type Recipe,
} from "../src";

const base = (): Recipe => {
  const r = defaultRiggedRecipe();
  return validateRecipe({ ...r, durationBeats: 16, moves: [riggedMove("Idle_Loop", 0)],
    reactive: { ...r.reactive!, humanise: 0, markers: [{ seconds: 3, accent: "jab", source: "manual" }] } });
};
const jabTime = (r: Recipe, n: number) => frameAt(r, n).layers.find(l => l.clip === "Punch_Jab" && l.accent)?.time;

describe("accent feel", () => {
  it("hit harder holds the impact frame and pushes past the key pose", () => {
    const soft = base(), hard = setImpact(soft, undefined, 0, 1);
    expect(hard.reactive!.markers![0].impact).toBe(1);
    const hit = 72;   // 3 s
    const key = CLIP_ACCENTS.jab!.phases[1].to;
    // Held on the key frame for the next frames, while the soft one follows through.
    for (let k = 0; k < IMPACT_HOLD_FRAMES; k++) expect(jabTime(hard, hit + k)).toBeCloseTo(key, 3);
    expect(jabTime(soft, hit + 2)!).toBeGreaterThan(key + 0.02);
    const layer = frameAt(hard, hit).layers.find(l => l.clip === "Punch_Jab")!;
    expect(layer.overshoot!.gain).toBeGreaterThan(0.4);
    expect(layer.overshoot!.refTime).toBe(CLIP_ACCENTS.jab!.phases[1].from);
    expect(frameAt(soft, hit).layers.find(l => l.clip === "Punch_Jab")!.overshoot).toBeUndefined();
    expect(setImpact(hard, undefined, 0, 0).reactive!.markers![0].impact).toBeUndefined();
  });

  it("anticipation scales the wind-up and keeps the strike on the hit", () => {
    const r = base();
    const before = anticipationBeats(r, r.reactive!.markers![0])!;
    const long = setAnticipation(r, undefined, 0, 1.5);
    expect(anticipationBeats(long, long.reactive!.markers![0])).toBeCloseTo(1.5, 4);
    const b0 = clipPlanFor(r).hits[0].boundaries, b1 = clipPlanFor(long).hits[0].boundaries;
    expect(b1.slice(1)).toEqual(b0.slice(1));   // the strike and everything after stay put
    expect(b1[0]).toBeCloseTo(b0[1] - 1.5, 4);
    expect(before).toBeLessThan(1.5);
    expect(anticipationBeats(setAnticipation(r, undefined, 0, 99), r.reactive!.markers![0])).not.toBeNull();
    expect(setAnticipation(r, undefined, 5, 1)).toBe(r);
  });
});
