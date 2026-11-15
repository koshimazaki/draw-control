/**
 * The glider's smoothed heading and lean (glide-heading.ts) must leave every other character
 * exactly as it was: the frames and the camera's subject of the committed example recipes
 * (the rigged mannequin) and of the procedural figures are fingerprinted, and the hashes were
 * taken on main before the smoothing landed.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, PROCEDURAL_DANCE, frameAt, setRootPath, subjectAt, secondsAtBeat, validateRecipe, type Recipe,
} from "../src/internal";

const dir = new URL("../../../examples/recipes/", import.meta.url);
const committed = readdirSync(dir).filter(f => f.endsWith(".json")).sort();

const walker = (kind: Recipe["character"]["kind"], reactive: boolean): Recipe => {
  let r: Recipe = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 16, moves: PROCEDURAL_DANCE().filter(m => m.atBeat < 16), character: { kind, name: kind, licence: "MIT" } });
  r = setRootPath(r, { points: [{ x: -3, z: 0 }, { x: -1, z: 2 }, { x: 1, z: -2 }, { x: 3, z: 0 }], fromBeat: 2, toBeat: 14, gait: "walk", corners: 0.5 });
  if (reactive) r = { ...r, reactive: { seed: 3, speed: 0.7, amplitude: 0.8, drive: 1, accents: ["jump", "spin", "cross"], accentOn: "both", accentGapBeats: 2, onsetThreshold: 0.6, idleBelow: 0.1, humanise: 0.7 } };
  return r;
};

const PROCEDURAL: Record<string, () => Recipe> = {
  "mannequin walking a path": () => walker("mannequin", false),
  "mannequin walking a path, reactive": () => walker("mannequin", true),
  "block walking a path": () => walker("block", false),
  "stick walking a path, reactive": () => walker("stick", true),
  "mannequin with a travel lock and a freeze": () => ({ ...walker("mannequin", false), travelLock: { lock: "kick", strength: 0.8 }, freezes: [{ fromBeat: 6, toBeat: 8 }] }),
};

function fingerprint(recipe: Recipe): string {
  const frames = Math.floor(secondsAtBeat(recipe.beatGrid, recipe.durationBeats) * recipe.fps);
  const h = createHash("sha256");
  for (let n = 0; n < frames; n++) {
    h.update(JSON.stringify(frameAt(recipe, n)));
    h.update(JSON.stringify(subjectAt(recipe, n / 12)));
  }
  return h.digest("hex").slice(0, 16);
}

// Taken on main (baac351), before the smoothing.
const EXPECTED: Record<string, string> = {
  "A.json": "9c60268ccdb66e5a", "C.json": "9c60268ccdb66e5a", "D.json": "15555f91396a38d9", "D8.json": "15555f91396a38d9",
  "fight-combo.json": "8e9e4d0230e9df9b", "gait-change.json": "8e8c66a230ffd3d1",
  "mannequin walking a path": "a59f2bb97c0fd75f", "mannequin walking a path, reactive": "32f214b7a3295c9d",
  "block walking a path": "a59f2bb97c0fd75f", "stick walking a path, reactive": "32f214b7a3295c9d",
  "mannequin with a travel lock and a freeze": "acfb181ecf82248a",
};

describe("characters other than the glider are untouched", () => {
  it.each(committed)("examples/recipes/%s", f => {
    const r = validateRecipe(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
    expect(fingerprint(r)).toBe(EXPECTED[f]);
  });
  it.each(Object.keys(PROCEDURAL))("procedural %s", name => {
    expect(fingerprint(PROCEDURAL[name]())).toBe(EXPECTED[name]);
  });
});
