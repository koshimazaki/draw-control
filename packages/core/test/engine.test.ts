import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, POSES, classifySpeed, frameAt, makeClipMove, makeMove, poseDistance, poseSpeed, timeline, type Recipe,
} from "../src";

const recipe = (moves: Recipe["moves"], over: Partial<Recipe> = {}): Recipe => ({ ...structuredClone(DEFAULT_RECIPE), moves, ...over });

describe("engine", () => {
  it("is deterministic: two renders give identical pose arrays", () => {
    const render = () => Array.from({ length: 200 }, (_, n) => frameAt(DEFAULT_RECIPE, n));
    expect(render()).toEqual(render());
  });
  it("random access matches sequential access", () => {
    const seq = Array.from({ length: 100 }, (_, n) => frameAt(DEFAULT_RECIPE, n));
    expect(frameAt(DEFAULT_RECIPE, 73)).toEqual(seq[73]);
  });
  it("lands each phase's pose on the beat grid (120 BPM, 24 fps, 12 frames per beat)", () => {
    const r = recipe([makeMove("stepTouch", 0)]);
    // stepTouch: "left" over beat 0–1, "right" over beat 1–2, then loops.
    expect(poseDistance(frameAt(r, 12).pose, POSES.stepLeft)).toBeLessThan(1e-9);
    expect(poseDistance(frameAt(r, 24).pose, POSES.stepRight)).toBeLessThan(1e-9);
    expect(frameAt(r, 11).active?.phaseName).toBe("left");
    expect(frameAt(r, 12).active?.phaseName).toBe("right");
    expect(frameAt(r, 24).active?.phaseName).toBe("left");
  });
  it("follows the beat offset and BPM", () => {
    const r = recipe([makeMove("stepTouch", 0)], { beatGrid: { bpm: 90, offsetSeconds: 0.5, beatsPerBar: 4, source: "analysis" } });
    // beat 1 at 0.5 + 60/90 s = 1.1667 s = frame 28
    expect(poseDistance(frameAt(r, 28).pose, POSES.stepLeft)).toBeLessThan(1e-9);
    expect(frameAt(r, 0).beat).toBeCloseTo(-0.75);
  });
  it("starts the next move on its beat and cross-fades from the previous one", () => {
    const r = recipe([makeMove("bounce", 0), makeMove("armsUp", 4)]);
    expect(frameAt(r, 47).active?.moveName).toBe("Bounce");
    expect(frameAt(r, 48).active?.moveName).toBe("Arms up");
    const mid = frameAt(r, 54); // half way through the one-beat blend
    expect(mid.active?.moveName).toBe("Arms up");
    expect(poseDistance(mid.pose, POSES.armsOut)).toBeGreaterThan(0.1);
  });
  it("produces weighted clip layers for embedded clips", () => {
    const r = recipe([makeClipMove("Idle", 0, 4, { id: "a" }), makeClipMove("Dance", 4, 2, { id: "b" })]);
    expect(frameAt(r, 24).layers).toEqual([{ moveId: "a", clip: "Idle", cyclePhase: 0.5, weight: 1 }]);
    const blend = frameAt(r, 54).layers;
    expect(blend.map(l => l.clip)).toEqual(["Idle", "Dance"]);
    expect(blend[0].weight + blend[1].weight).toBeCloseTo(1);
    expect(frameAt(r, 72).layers[0]).toMatchObject({ clip: "Dance", cyclePhase: 0, weight: 1 });
  });
  it("steps the pose at a lower preview fps", () => {
    const r = recipe([makeMove("stepTouch", 0, { previewFps: 12 })]);
    expect(frameAt(r, 1).pose).toEqual(frameAt(r, 0).pose);
    expect(frameAt(r, 2).pose).not.toEqual(frameAt(r, 1).pose);
  });
  it("types pose speed as hold, move or fast", () => {
    const r = recipe([makeMove("run", 0)]);
    expect(poseSpeed(r, 0)).toBe(0);
    expect(classifySpeed(poseSpeed(r, 3))).toBe("fast");
    expect(classifySpeed(0.1)).toBe("hold");
  });
  it("lays out which move sits on which beats", () => {
    const blocks = timeline(recipe([makeMove("bounce", 0), makeMove("kick", 4)], { durationBeats: 8 }));
    expect(blocks.map(b => [b.name, b.startBeat, b.endBeat])).toEqual([["Bounce", 0, 4], ["Kick", 4, 8]]);
    expect(blocks[0].phases).toHaveLength(8);
    expect(blocks[1].phases.map(p => p.name)).toEqual(["chamber", "kick", "recover", "chamber", "kick", "recover"]);
  });
  it("adds jump height inside the jump window only", () => {
    const r = recipe([makeMove("bounce", 0)], { jumps: [{ atBeat: 2, durationBeats: 1, height: 0.5 }] });
    expect(frameAt(r, 24).root.y).toBe(0);
    expect(frameAt(r, 30).root.y).toBeCloseTo(0.5);
    expect(frameAt(r, 36).root.y).toBe(0);
  });
});
