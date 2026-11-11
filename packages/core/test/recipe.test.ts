import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, makeClipMove, makeMove, validateRecipe, type Recipe } from "../src";

const withMoves = (moves: Recipe["moves"]): Recipe => ({ ...structuredClone(DEFAULT_RECIPE), moves });

describe("recipe schema", () => {
  it("round-trips through JSON unchanged", () => {
    const recipe = withMoves([makeMove("bounce", 0), makeClipMove("Dance", 4, 4), makeMove("kick", 8, { previewFps: 12 })]);
    recipe.moves[0].phases[0].expression = "smile";
    recipe.moves[2].phases[1].length = { frames: 7 };
    recipe.audio = { name: "own-track.wav", licence: "owner's own music" };
    const back = validateRecipe(JSON.parse(JSON.stringify(recipe)));
    expect(back).toEqual(recipe);
  });
  it("returns a fresh copy", () => {
    const back = validateRecipe(DEFAULT_RECIPE);
    back.moves[0].phases[0].amplitude = 2;
    expect(DEFAULT_RECIPE.moves[0].phases[0].amplitude).toBe(1);
  });
  it("keeps the optional expression field and refuses unknown ones", () => {
    const r = withMoves([makeMove("clap", 0)]);
    r.moves[0].phases[1].expression = "surprised";
    expect(validateRecipe(r).moves[0].phases[1].expression).toBe("surprised");
    (r.moves[0].phases[1] as { expression: string }).expression = "smirk";
    expect(() => validateRecipe(r)).toThrow(/expression/);
  });
  it("refuses unknown keys, URLs, bad poses and beats outside the recipe; takes off-grid starts", () => {
    expect(() => validateRecipe({ ...DEFAULT_RECIPE, model: "x" })).toThrow(/unknown field/);
    const url = withMoves([{ ...makeMove("clap", 0), name: "https://example.com" }]);
    expect(() => validateRecipe(url)).toThrow(/URL/);
    const pose = withMoves([makeMove("clap", 0)]);
    (pose.moves[0].phases[0] as { pose: string }).pose = "backflip";
    expect(() => validateRecipe(pose)).toThrow(/pose/);
    expect(() => validateRecipe(withMoves([makeMove("clap", -1)]))).toThrow(/inside the recipe/);
    expect(validateRecipe(withMoves([makeMove("clap", 0.5)])).moves[0].atBeat).toBe(0.5);
  });
  it("requires moves in beat order with unique ids", () => {
    expect(() => validateRecipe(withMoves([makeMove("clap", 4), makeMove("bounce", 2)]))).toThrow(/after/);
    expect(() => validateRecipe(withMoves([makeMove("clap", 0, { id: "a" }), makeMove("bounce", 2, { id: "a" })]))).toThrow(/unique/);
  });
});

describe("abstract figures", () => {
  it("stick and capsule figures are procedural kinds that keep every library move", async () => {
    const { incompatibleMoves, PROCEDURAL_KINDS } = await import("../src");
    for (const kind of PROCEDURAL_KINDS) {
      const r = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), character: { kind, name: kind, licence: "MIT (motion-studio)" } });
      expect(incompatibleMoves(r, kind)).toEqual([]);
      expect(r.moves).toEqual(DEFAULT_RECIPE.moves);
    }
  });
});
