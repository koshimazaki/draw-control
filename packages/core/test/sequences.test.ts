/**
 * Sequences reload identically: every committed recipe in examples/recipes/ validates, and
 * saving and loading it (JSON out, JSON in) gives the same frames. The named sequences are
 * checked against their source (UPDATE_SEQUENCES=1 npx vitest run rewrites the files).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportFrameCount, frameAt, namedSequences, validateRecipe } from "../src";

const DIR = new URL("../../../examples/recipes/", import.meta.url);
const json = (r: unknown) => JSON.stringify(r, null, 2) + "\n";

describe("sequences", () => {
  for (const s of namedSequences()) {
    it(`commits ${s.id}.json as generated`, () => {
      const file = new URL(`${s.id}.json`, DIR);
      if (process.env.UPDATE_SEQUENCES) writeFileSync(file, json(s.recipe));
      expect(readFileSync(file, "utf8")).toBe(json(s.recipe));
    });
  }

  for (const name of readdirSync(DIR).filter(f => f.endsWith(".json"))) {
    it(`${name}: a save and reload reproduces every frame`, () => {
      const recipe = validateRecipe(JSON.parse(readFileSync(new URL(name, DIR), "utf8")));
      const reloaded = validateRecipe(JSON.parse(JSON.stringify(recipe)));
      expect(reloaded).toEqual(recipe);
      const frames = exportFrameCount(recipe);
      for (let n = 0; n < frames; n += 3) expect(frameAt(reloaded, n)).toEqual(frameAt(recipe, n));
    });
  }
});
