import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA, DEFAULT_RECIPE, RIGGED_CHARACTER, applyMotionCommand, applyScript, beatAtSeconds, describeRecipe, moveMarker, printScript, validateRecipe,
  type BandAnalysis, type Recipe,
} from "../src/internal";

// 120 BPM from 0 s: kicks on every beat, snares on 1, 3, 5, … (beat b = b / 2 s).
const beats = (list: number[]) => list.map(b => ({ seconds: b / 2, strength: 1 }));
const bands: BandAnalysis = { hopSeconds: 0.01, low: beats(Array.from({ length: 16 }, (_, i) => i)), mid: beats([1, 3, 5, 7, 9, 11, 13, 15]), high: [], peaks: [] };
const base = (): Recipe => {
  const r = validateRecipe({
    ...structuredClone(DEFAULT_RECIPE), durationBeats: 16, moves: [],
    character: { kind: "rigged", name: RIGGED_CHARACTER.name, licence: RIGGED_CHARACTER.licence },
    camera: { ...DEFAULT_CAMERA, segments: [{ fromBeat: 0, toBeat: 16, modes: ["orbit"] }] },
  });
  return applyMotionCommand(r, { type: "setRootPath", points: [{ x: 0, z: 0 }, { x: 3, z: -2 }, { x: 6, z: -6 }], fromBeat: 0, toBeat: 8 });
};

/** The owner's spoken direction, as a script (there is no fall move: beats 10-12 rest under a top shot). */
const SPOKEN = `
# camera follows; the character jumps and the camera moves around it; it falls and the camera goes to the top; then it follows behind
beats 0-8   | action: run on path lock kick 0.5 | camera: chase     | shot: wide
beats 8-10  | action: jump @kick 2             | camera: orbit 360 | shot: medium
beats 10-12 | action: rest                     | camera: top       | shot: wide
beats 12-16 | action: run                      | camera: chase     | shot: close
`;

describe("shot script", () => {
  const r = applyScript(base(), { script: SPOKEN }, { bands });
  it("builds the Action and Camera tracks from the rows", () => {
    expect(r.moves.map(m => [m.clip, m.atBeat, m.lengthBeats])).toEqual([["Jog_Fwd_Loop", 0, 8], ["Jog_Fwd_Loop", 12, 4]]);
    expect(r.moves[0].lock).toBe("kick");
    expect(r.travelLock).toEqual({ lock: "kick", strength: 0.5 });
    expect(r.rootPath.at(-1)!.beat).toBe(8);
    expect(r.reactive!.markers!.map(m => [m.accent, beatAtSeconds(r.beatGrid, m.seconds)])).toEqual([["jump", 9]]);
    expect(r.camera!.segments).toEqual([
      { fromBeat: 0, toBeat: 8, modes: ["chase"], shot: "wide" }, { fromBeat: 8, toBeat: 10, modes: ["orbit"], amount: 360, shot: "medium" },
      { fromBeat: 10, toBeat: 12, modes: ["top"], shot: "wide" }, { fromBeat: 12, toBeat: 16, modes: ["chase"], shot: "close" },
    ]);
  });
  it("round trip: script → recipe → script is stable", () => {
    const once = printScript(r, bands);
    expect(once.split("\n")[1]).toMatch(/^beats 8-10 +\| action: jump @kick 2 +\| camera: orbit 360 +\| shot: medium$/);
    const again = applyScript(r, { script: once }, { bands });
    expect(printScript(again, bands)).toBe(once);
    // The first pass turns the drawn path into the printed points (spaced by distance); from then on the recipe is fixed too.
    expect(applyScript(again, { script: once }, { bands })).toEqual(again);
  });
  it("continue rows keep one block over several rows; amounts, locks and anchors read back", () => {
    const s = applyScript(base(), { script: [
      "beats 0-4 | action: walk | camera: dolly in 2m lock snare 0.8 punch 0.5m | shot: close cut",
      "beats 4-6 | action: continue, spin @snare 1 | camera: truck left 1.5m",
      "beats 6-8 | action: idle lock beat | camera: rise 0.3m to 2m + chase",
      "beats 8-16 | action: glide on path | camera: jib down 1m",
    ].join("\n") }, { bands });
    expect(s.moves.map(m => [m.clip, m.atBeat, m.lengthBeats])).toEqual([["Walk_Loop", 0, 6], ["Idle_Loop", 6, 2]]);
    expect(s.camera!.segments[0]).toMatchObject({ modes: ["pushIn"], amount: 2, lock: "snare", strength: 0.8, onHit: "punch", punch: 0.5, shot: "close", cut: true });
    expect(s.camera!.segments[1]).toMatchObject({ modes: ["truck"], amount: -1.5 });
    expect(s.camera!.segments[2]).toMatchObject({ modes: ["rise", "chase"], from: 0.3, to: 2 });
    expect(s.camera!.segments[3]).toMatchObject({ modes: ["rise"], amount: -1 });
    const text = printScript(s, bands);
    expect(text).toContain("action: continue, spin @kick 2");   // the snare on beat 5 is also a kick: kicks name it first
    expect(text).toContain("action: glide on path");
    expect(printScript(applyScript(s, { script: text }, { bands }), bands)).toBe(text);
  });
  it("unknown words fail with the valid ones; there is no fall move", () => {
    expect(() => applyScript(base(), { script: "beats 0-4 | action: fall" })).toThrow(/unknown action "fall".*walk, run/);
    expect(() => applyScript(base(), { script: "beats 0-4 | action: run | camera: swoop" })).toThrow(/unknown camera move "swoop".*orbit/);
    expect(() => applyScript(base(), { script: "beats 0-4 | action: run | camera: orbit | shot: extreme" })).toThrow(/wide, medium, close, low, top/);
    expect(() => applyScript(base(), { script: "beats 0-2 | action: jump @kick 5" }, { bands })).toThrow(/have 2 kicks/);
    // No kick to land on (no track analysed): the accent lands on its row's start, as a camera start with hits does.
    expect(applyScript(base(), { script: "beats 2-4 | action: jump @kick 1" }).reactive!.markers!.map(m => [m.accent, m.fellBack])).toEqual([["jump", "@kick 1"]]);
    // A mistyped index on a row with no such hit falls back too, and describe says which anchor it asked for.
    const typo = applyScript(base(), { script: "beats 0-2 | action: rest\nbeats 2-4 | action: jump @hat 5" }, { bands });
    expect(describeRecipe(typo, bands)).toMatch(/\(@hat 5: no such hit in its row, on the row's start\)/);
    expect(moveMarker(typo, undefined, 0, 1).reactive!.markers![0].fellBack).toBeUndefined();
    // The marker tagged is the one that fell back, not another accent at the same time.
    const two = applyScript(base(), { script: "beats 0-2 | action: rest, jump @beat 2\nbeats 2-4 | action: jump @hat 1" }, { bands }).reactive!.markers!;
    expect(two.map(m => m.fellBack)).toEqual([undefined, "@hat 1"]);
    // An index the grammar takes but no row can count to is refused on its line, not inside the recipe.
    for (const n of ["1000", "1.5", "0"]) expect(() => applyScript(base(), { script: `beats 0-2 | action: jump @kick ${n}` }, { bands })).toThrow(new RegExp(`script line 1: @kick ${n.replace(".", "\\.")}: count from 1 to 64`));
    expect(() => applyScript(base(), { script: "beats 0-2 | camera: orbit @kick 65" }, { bands })).toThrow(/count from 1 to 64/);
    expect(() => validateRecipe({ ...typo, reactive: { ...typo.reactive!, markers: [{ ...typo.reactive!.markers![0], fellBack: "@kick" }] } })).toThrow(/fellBack/);
    expect(() => applyScript(base(), { script: "beats 0-2 | camera: top\nbeats 2-4 | camera: orbit @kick 1" })).toThrow(/analyse a track first/);
  });
});

describe("path points in the shot script", () => {
  const script = [
    "beats 0-4  | action: idle | camera: chase | shot: wide",
    "beats 4-12 | action: glide on path (0,0) (2,0) (2,3,1.5) lock kick 0.8 | camera: path (4,2,1.6) (0,4,2) (-4,2,1.6) | shot: -",
    "beats 12-16 | action: run on path (0,0) (0,-4) | camera: path",
  ].join("\n");
  it("gives the walk path and the camera path in metres, without drawing", () => {
    expect(() => applyScript(base(), { script })).toThrow(/one walk path/);
    const one = script.replace("run on path (0,0) (0,-4)", "run");
    const r = applyScript(base(), { script: one }, { bands });
    const moving = r.rootPath.filter(p => p.beat >= 4);
    expect(moving.map(p => [p.x, p.z, p.y ?? 0])).toEqual([[0, 0, 0], [2, 0, 0], [2, 3, 1.5]]);
    expect(moving.at(-1)!.beat).toBe(12);
    expect(r.travelLock).toEqual({ lock: "kick", strength: 0.8 });
    expect(r.camera!.path).toEqual([{ x: 4, y: 1.6, z: 2 }, { x: 0, y: 2, z: 4 }, { x: -4, y: 1.6, z: 2 }]);
    expect(r.camera!.segments.map(s => s.modes[0])).toEqual(["chase", "path", "path"]);
    const text = printScript(r, bands);
    expect(text).toContain("action: glide on path (0,0) (2,0) (2,3,1.5) lock kick 0.8");
    expect(text).toContain("camera: path (4,2,1.6) (0,4,2) (-4,2,1.6) | shot: -");
    expect(text).toMatch(/^beats 12-16 +\| action: run +\| camera: path +\| shot: -$/m);   // later path blocks reuse the points
    const again = applyScript(r, { script: text }, { bands });
    expect(printScript(again, bands)).toBe(text);
    expect(again).toEqual(r);
  });
  it("refuses points in the wrong place or of the wrong shape", () => {
    expect(() => applyScript(base(), { script: "beats 0-4 | action: run (0,0) (1,1)" })).toThrow(/points belong after "on path"/);
    expect(() => applyScript(base(), { script: "beats 0-4 | action: run | camera: orbit (0,0) (1,1)" })).toThrow(/camera points belong after "path"/);
    expect(() => applyScript(base(), { script: "beats 0-4 | action: glide on path (0,0) (1,x)" })).toThrow(/a point reads \(x,z\)/);
    expect(() => applyScript(base(), { script: "beats 0-4 | action: run | camera: path" })).toThrow(/camera: path needs points/);
  });
});

describe("a drawn walk path prints as thinned points", () => {
  it("a 200-point stroke → script → fresh recipe: within 0.15 m at every beat; stable on the second pass", async () => {
    const { rootAt, thinPath, MAX_PRINTED_PATH_POINTS } = await import("../src/internal");
    const stroke = Array.from({ length: 200 }, (_, i) => { const t = i / 199; return { x: 6 * Math.sin(t * Math.PI * 1.5), z: -8 * t + Math.cos(t * 9) * 0.6 }; });
    const drawn = applyMotionCommand(base(), { type: "setRootPath", points: stroke, fromBeat: 0, toBeat: 16, gait: "Walk_Loop" });
    expect(drawn.rootPath.length).toBeGreaterThan(MAX_PRINTED_PATH_POINTS);
    const text = printScript(drawn, bands);
    const row = text.split("\n")[0];
    const printed = row.match(/\([^)]*\)/g)!;
    expect(printed.length).toBeLessThanOrEqual(MAX_PRINTED_PATH_POINTS);
    const fresh = validateRecipe({ ...base(), rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }] });
    const again = applyScript(fresh, { script: text }, { bands });
    let worst = 0;
    for (let b = 0; b <= 16; b += 0.25) {
      const p = rootAt(drawn, b), q = rootAt(again, b);
      worst = Math.max(worst, Math.hypot(p.x - q.x, p.z - q.z));
    }
    expect(worst).toBeLessThan(0.15);
    const second = printScript(again, bands);
    expect(printScript(applyScript(again, { script: second }, { bands }), bands)).toBe(second);
    expect(thinPath([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toHaveLength(2);
  });
  it("plain \"on path\" still means the path already there", () => {
    const r = applyScript(base(), { script: "beats 0-8 | action: walk on path" });
    expect(r.rootPath.at(-1)).toMatchObject({ x: 6, z: -6, beat: 8 });
  });
});
