import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, applyMotionCommand, extendPhase, frameAt, insertMove, setAmplitude, swapMove, type MotionCommand } from "../src";

describe("commands", () => {
  it("insertMove adds a library move on a beat, in order, without mutating input", () => {
    const r = insertMove(DEFAULT_RECIPE, { move: "clap", atBeat: 2 });
    expect(r.moves.map(m => m.atBeat)).toEqual([0, 2, 4, 8, 12]);
    expect(r.moves[1].name).toBe("Clap");
    expect(DEFAULT_RECIPE.moves).toHaveLength(4);
    expect(insertMove(r, { move: "disco", atBeat: 2 }).moves[1].name).toBe("Disco point");
  });
  it("swapMove keeps the beat and id", () => {
    const id = DEFAULT_RECIPE.moves[1].id;
    const r = swapMove(DEFAULT_RECIPE, { moveId: id, to: "walk" });
    expect(r.moves[1]).toMatchObject({ id, atBeat: 4, name: "Walk" });
  });
  it("setAmplitude sets one phase or the whole move", () => {
    const id = DEFAULT_RECIPE.moves[0].id;
    expect(setAmplitude(DEFAULT_RECIPE, { moveId: id, phase: "down", value: 1.5 }).moves[0].phases.map(p => p.amplitude)).toEqual([1.5, 1]);
    expect(setAmplitude(DEFAULT_RECIPE, { moveId: id, value: 0.5 }).moves[0].phases.map(p => p.amplitude)).toEqual([0.5, 0.5]);
  });
  it("extendPhase lengthens and shortens", () => {
    const id = DEFAULT_RECIPE.moves[0].id;
    expect(extendPhase(DEFAULT_RECIPE, { moveId: id, phase: 0, by: 0.5 }).moves[0].phases[0].length).toEqual({ beats: 1 });
    expect(() => extendPhase(DEFAULT_RECIPE, { moveId: id, phase: 0, by: -1 })).toThrow(/length/);
  });
  it("refuses invalid commands with a clear message", () => {
    expect(() => applyMotionCommand(DEFAULT_RECIPE, { type: "teleport" } as unknown as MotionCommand)).toThrow(/unknown command/);
    expect(() => applyMotionCommand(DEFAULT_RECIPE, { type: "swapMove", moveId: "nope", to: "walk" })).toThrow(/no move/);
    expect(() => applyMotionCommand(DEFAULT_RECIPE, { type: "insertMove", move: "clap", atBeat: 99 })).toThrow(/inside the recipe/);
  });
  it("a three-command script run twice gives identical frames", () => {
    const script: MotionCommand[] = [
      { type: "insertMove", move: "disco", atBeat: 2 },
      { type: "setAmplitude", moveId: "disco-2", value: 1.4 },
      { type: "extendPhase", moveId: "disco-2", phase: "up", by: 1 },
    ];
    const run = () => {
      const r = script.reduce((rr, c) => applyMotionCommand(rr, c), DEFAULT_RECIPE);
      return Array.from({ length: 193 }, (_, n) => frameAt(r, n));
    };
    expect(run()).toEqual(run());
  });
});
