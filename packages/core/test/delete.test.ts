import { describe, expect, it } from "vitest";
import {
  CLIP_ACCENTS, clipPlanFor, currentSteps, defaultRiggedRecipe, deleteMove, deletePhase, deleteStep, frameAt, restorePhase, riggedMove,
  validateRecipe, type HitMarker, type Recipe,
} from "../src/internal";

const markers: HitMarker[] = [{ seconds: 2, accent: "spin", source: "manual" }, { seconds: 4, accent: "jab", source: "manual" }];
const base = (): Recipe => {
  const r = defaultRiggedRecipe();
  return validateRecipe({ ...r, durationBeats: 16, moves: [riggedMove("Idle_Loop", 0), riggedMove("Dance_Loop", 4), riggedMove("Sword_Idle", 8)],
    reactive: { ...r.reactive!, markers } });
};

describe("delete with a choice of gap", () => {
  it("deletes a move: close moves the later moves earlier, hold lets the move before play on", () => {
    const r = base();
    const closed = deleteMove(r, { moveId: "Dance_Loop-4", mode: "close" });
    expect(closed.moves.map(m => [m.clip, m.atBeat])).toEqual([["Idle_Loop", 0], ["Sword_Idle", 4]]);
    const held = deleteMove(r, { moveId: "Dance_Loop-4", mode: "hold" });
    expect(held.moves.map(m => [m.clip, m.atBeat])).toEqual([["Idle_Loop", 0], ["Sword_Idle", 8]]);
    expect(deleteMove(r, { moveId: "missing", mode: "hold" })).toBe(r);
  });

  it("removes 'spin' from gather, spin, settle: close keeps the key frame on the hit, no turn", () => {
    const r = base();
    const spinIndex = CLIP_ACCENTS.spin!.phases.findIndex(p => p.name === "spin");
    const closed = deletePhase(r, undefined, { marker: 0, phase: spinIndex, mode: "close" });
    expect(closed.reactive!.markers![0].skip).toEqual([spinIndex]);
    const hit = clipPlanFor(closed).hits[0];
    expect(hit.boundaries[spinIndex]).toBe(hit.boundaries[spinIndex + 1]);   // zero length
    expect(hit.boundaries).toContain(0);
    // The turn is gone: before the hit the root no longer turns.
    const n = Math.round(2 * 24) - 3;
    expect(frameAt(r, n).root.yawRadians).not.toBeCloseTo(0, 2);
    expect(Math.abs(Math.sin(frameAt(closed, n).root.yawRadians))).toBeLessThan(1e-6);
    // Hold: the phase keeps its time, the root does not turn either.
    const held = deletePhase(r, undefined, { marker: 0, phase: spinIndex, mode: "hold" });
    expect(held.reactive!.markers![0].hold).toEqual([spinIndex]);
    expect(frameAt(held, n).root.yawRadians).toBe(0);
    expect(restorePhase(held, undefined, { marker: 0, phase: spinIndex }).reactive!.markers![0]).toEqual(markers[0]);
  });

  it("deleting every phase deletes the marker", () => {
    let r = base();
    for (let k = 0; k < CLIP_ACCENTS.jab!.phases.length; k++) r = deletePhase(r, undefined, { marker: 1, phase: k, mode: "close" });
    expect(r.reactive!.markers!.map(m => m.accent)).toEqual(["spin"]);
  });

  it("deletes a step: close shifts the later steps, hold repeats the step before", () => {
    const r = validateRecipe({ ...base(), steps: { division: 4, amplitude: Array.from({ length: 16 }, (_, i) => i / 10) } });
    expect(deleteStep(r, undefined, { division: 4, index: 3, mode: "close" }).steps!.amplitude.slice(2, 5)).toEqual([0.2, 0.4, 0.5]);
    expect(deleteStep(r, undefined, { division: 4, index: 3, mode: "hold" }).steps!.amplitude.slice(2, 5)).toEqual([0.2, 0.2, 0.4]);
    expect(currentSteps(deleteStep(r, undefined, { division: 4, index: 15, mode: "close" }), undefined, 4)).toHaveLength(16);
  });
});
