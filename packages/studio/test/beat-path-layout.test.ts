/**
 * The page markup: every element id is unique. `$()` returns the first match, so a repeated id
 * silently rewires the first element (two zoom pairs once shared `zoomIn`/`zoomOut`, and the map's
 * buttons zoomed the timeline).
 */
import { describe, expect, it } from "vitest";
import { LAYOUT } from "../src/beat-path/layout";

const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);

describe("Draw Control layout", () => {
  it("declares each id once", () => {
    const all = ids(LAYOUT), seen = new Set<string>(), repeated = new Set<string>();
    for (const id of all) (seen.has(id) ? repeated : seen).add(id);
    expect(all.length).toBeGreaterThan(50);
    expect([...repeated]).toEqual([]);
  });
  it("gives the map and the timeline their own zoom buttons", () => {
    const all = ids(LAYOUT);
    for (const id of ["zoomIn", "zoomOut", "tlZoomIn", "tlZoomOut"]) expect(all.filter(x => x === id)).toEqual([id]);
  });
});
