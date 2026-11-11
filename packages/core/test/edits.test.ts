import { describe, expect, it } from "vitest";
import {
  addMarker, clearSteps, clipPlanFor, currentMarkers, currentSteps, defaultRiggedRecipe, frameAt, markerPhases, moveMarker,
  paintEnergy, removeMarker, retimePhase, riggedMove, secondsAtBeat, setMarkerAccent, setMoveAtBeat, setMoveBlend, setStepAmplitude,
  snapSeconds, validateRecipe, type AudioDrive, type Recipe,
} from "../src/internal";

const FPS = 24;
const drive: AudioDrive = { fps: FPS, energy: new Float32Array(800).fill(0.5), onsets: [{ seconds: 3.37, strength: 1 }], source: "audio" };
const base = (): Recipe => validateRecipe({ ...defaultRiggedRecipe(), durationBeats: 24, moves: [riggedMove("Dance_Loop", 0)] });

describe("performance edits", () => {
  it("sets a transition's blend in frames, clamped to 6–24", () => {
    const r = validateRecipe({ ...base(), moves: [riggedMove("Idle_Loop", 0), riggedMove("Dance_Loop", 4)] });
    expect(setMoveBlend(r, { moveId: "Dance_Loop-4", frames: 9 }).moves[1].blendBeats).toBeCloseTo(9 / 24 * 2, 4);
    expect(setMoveBlend(r, { moveId: "Dance_Loop-4", frames: 2 }).moves[1].blendBeats).toBeCloseTo(6 / 24 * 2, 4);
    expect(setMoveBlend(r, { moveId: "Dance_Loop-4", frames: 99 }).moves[1].blendBeats).toBeCloseTo(24 / 24 * 2, 4);
    expect(setMoveBlend(r, { moveId: "nope", frames: 9 })).toBe(r);
  });
  it("dragging a step bar changes the amplitude on that step only", () => {
    const r = base();
    const before = currentSteps(r, drive, 8);
    const edited = setStepAmplitude(r, { division: 8, index: 10, value: 1.4, drive });
    expect(edited.steps!.amplitude[10]).toBe(1.4);
    expect(edited.steps!.amplitude[3]).toBeCloseTo(before[3], 4);
    const at = (rr: Recipe, beat: number) => frameAt(rr, Math.round(secondsAtBeat(rr.beatGrid, beat) * FPS), drive).amplitude!;
    expect(at(edited, 5.4)).toBeGreaterThan(at(r, 5.4) + 0.3);   // step 10 at 1/8 = beats 5–5.5
    expect(Math.abs(at(edited, 2) - at(r, 2))).toBeLessThan(0.05);
    expect(clearSteps(edited).steps).toBeUndefined();
  });
  it("the move lane writes clip moves on whole beats", () => {
    const r = setMoveAtBeat(base(), 8, "Jog_Fwd_Loop");
    expect(r.moves.map(m => [m.clip, m.atBeat])).toEqual([["Dance_Loop", 0], ["Jog_Fwd_Loop", 8]]);
    expect(setMoveAtBeat(r, 8, null).moves).toHaveLength(1);
  });
  it("markers: add, move, re-accent, remove", () => {
    let r = base();
    const n = currentMarkers(r, drive).length;
    r = addMarker(r, drive, 5.0, "jab");
    let ms = currentMarkers(r, drive);
    expect(ms).toHaveLength(n + 1);
    const i = ms.findIndex(m => m.seconds === 5);
    r = setMarkerAccent(moveMarker(r, drive, i, 5.5), drive, ms.findIndex(m => m.seconds === 5), "sword");
    ms = currentMarkers(r, drive);
    expect(ms.find(m => m.seconds === 5.5)?.accent).toBe("sword");
    r = removeMarker(r, drive, ms.findIndex(m => m.seconds === 5.5));
    expect(currentMarkers(r, drive)).toHaveLength(n);
  });
  it("retiming a phase keeps the key frame on the hit; dragging the key moves the hit", () => {
    let r = validateRecipe({ ...base(), reactive: { ...base().reactive!, markers: [{ seconds: 4, accent: "jump", source: "manual" }] } });
    const b = markerPhases(r, currentMarkers(r)[0])!;
    r = retimePhase(r, drive, 0, 1, b[1] - 0.5);   // take-off half a beat earlier
    const nb = markerPhases(r, currentMarkers(r)[0])!;
    expect(nb[1]).toBeCloseTo(b[1] - 0.5, 4);
    expect(nb.indexOf(0)).toBe(b.indexOf(0));
    const plan = clipPlanFor(r, drive);
    expect(plan.hits[0].seconds).toBe(4);
    expect(plan.hits[0].boundaries[1]).toBeCloseTo(b[1] - 0.5, 4);
    r = retimePhase(r, drive, 0, b.indexOf(0), 0.5);  // key boundary: the hit moves a half beat later
    expect(currentMarkers(r)[0].seconds).toBeCloseTo(4.25, 4);
  });
  it("snaps to subdivisions, to onsets when asked, and not at all when free", () => {
    const r = base();
    expect(snapSeconds(r, drive, 3.3, { division: 8 })).toBe(3.25);
    expect(snapSeconds(r, drive, 3.34, { division: 8, onsets: true })).toBe(3.37);
    expect(snapSeconds(r, drive, 3.34, { division: 8 })).toBe(3.25);
    expect(snapSeconds(r, drive, 3.3, { division: 8, free: true })).toBe(3.3);
  });
  it("painting the energy curve overrides the analysed energy", () => {
    const r = paintEnergy(base(), drive, 2, 4, 1, 1);
    expect(r.energyCurve!.values[36]).toBe(1);
    expect(frameAt(r, 72, drive).energy).toBeGreaterThan(0.9);
    expect(frameAt(r, 200, drive).energy).toBeCloseTo(0.5, 2);
  });
});
