import { describe, expect, it } from "vitest";
import { applyScript, beatPathBase, describeRecipe } from "../src/internal";

const base = () => beatPathBase({ seconds: 8 });

describe("describe", () => {
  it("says the walk path travels from when the subject starts moving", () => {
    const r = applyScript(base(), { script: "beats 0-14 | action: walk on path (-18,-1.5) (-10,-1.5) (-3,1.5) (4,-1.5) | camera: chase | shot: -\n" });
    expect(r.rootPath[1].beat).toBeGreaterThan(0);
    expect(describeRecipe(r)).toMatch(/travels beats 0–14/);
    const late = applyScript(base(), { script: "beats 0-4 | action: rest | camera: chase | shot: -\nbeats 4-14 | action: walk on path (0,0) (4,0) (8,2) | camera: continue\n" });
    expect(describeRecipe(late)).toMatch(/travels beats 4–14/);
  });
});
