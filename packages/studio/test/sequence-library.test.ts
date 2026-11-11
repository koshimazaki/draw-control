import { describe, expect, it } from "vitest";
import { defaultRiggedRecipe, frameAt, namedSequences } from "@motion-studio/core";
import { LIBRARY_KEY, cleanName, deleteSequence, fileNameFor, parseSequenceFile, readLibrary, saveSequence } from "../src/sequence-library";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe("sequence library", () => {
  it("saves, overwrites, lists newest first and deletes", () => {
    const s = memory(), r = defaultRiggedRecipe();
    saveSequence(s, "  intro   one ", r, new Date("2026-11-11T10:00:00Z"));
    saveSequence(s, "combo", namedSequences()[0].recipe, new Date("2026-11-11T11:00:00Z"));
    saveSequence(s, "intro one", { ...r, durationBeats: 8 }, new Date("2026-11-11T12:00:00Z"));
    expect(readLibrary(s).map(e => [e.name, e.recipe.durationBeats])).toEqual([["intro one", 8], ["combo", 32]]);
    deleteSequence(s, "combo");
    expect(readLibrary(s).map(e => e.name)).toEqual(["intro one"]);
  });

  it("reloads a saved sequence to the identical animation", () => {
    const s = memory(), r = namedSequences()[0].recipe;
    saveSequence(s, "fight", r);
    const back = readLibrary(s)[0].recipe;
    expect(back).toEqual(r);
    for (const n of [0, 37, 100, 250]) expect(frameAt(back, n)).toEqual(frameAt(r, n));
  });

  it("refuses bad names and skips entries the validator refuses", () => {
    const s = memory();
    expect(() => saveSequence(s, "<script>", defaultRiggedRecipe())).toThrow(/Name the sequence/);
    expect(cleanName("a".repeat(61))).toBeNull();
    s.setItem(LIBRARY_KEY, JSON.stringify({ broken: { savedAt: "x", recipe: { version: 1 } }, ok: { savedAt: "2026", recipe: defaultRiggedRecipe() } }));
    expect(readLibrary(s).map(e => e.name)).toEqual(["ok"]);
    s.setItem(LIBRARY_KEY, "not json");
    expect(readLibrary(s)).toEqual([]);
  });

  it("parses an uploaded recipe or library entry, and names the download", () => {
    const r = defaultRiggedRecipe();
    expect(parseSequenceFile(JSON.stringify(r))).toEqual(r);
    expect(parseSequenceFile(JSON.stringify({ recipe: r }))).toEqual(r);
    expect(() => parseSequenceFile("{")).toThrow(/not JSON/);
    expect(() => parseSequenceFile(JSON.stringify({ ...r, url: "http://x" }))).toThrow();
    expect(fileNameFor("Fight Combo (v2)")).toBe("fight-combo-v2.recipe.json");
  });
});
