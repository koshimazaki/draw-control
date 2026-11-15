/**
 * Regression tests for eight reviewed defects: each failed before its fix.
 */
import { describe, expect, it } from "vitest";
import {
  CORNER_PATH_MAX, DEFAULT_RECIPE, applyMotionCommand, applyScript, clipPlanFor, cornerPath, currentSteps, defaultRiggedRecipe,
  deleteStep, detectOnsets, effectiveDrive, loopLayersAt, makeMove, planCamera, poseAtBeat, printScript, programCamera, pulseBeat,
  setCameraModes, setRootPath, validateRecipe, type AudioDrive, type Pose, type Recipe,
} from "../src/internal";

const flat = (p: Pose): number[] => JSON.stringify(p).match(/-?\d+\.?\d*(e-?\d+)?/g)!.map(Number);
const maxJump = (a: Pose, b: Pose) => { const x = flat(a), y = flat(b); return Math.max(...x.map((v, i) => Math.abs(v - y[i]))); };

describe("procedural blend from a move that already settled to rest (engine.ts)", () => {
  it("does not snap back to the previous move's full pose when the next move blends in", () => {
    const r = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), moves: [{ ...makeMove("armsUp", 0), lengthBeats: 2 }, { ...makeMove("bounce", 8), blendBeats: 1 }] });
    expect(maxJump(poseAtBeat(r, 7.99).pose, poseAtBeat(r, 8).pose)).toBeLessThan(0.05);
    // across the whole blend the pose moves smoothly
    let worst = 0;
    for (let b = 7.9; b < 9.1; b += 0.01) worst = Math.max(worst, maxJump(poseAtBeat(r, b).pose, poseAtBeat(r, b + 0.01).pose));
    expect(worst).toBeLessThan(0.2);
  });
});

describe("camera ranges past the limit (camera-edits.ts)", () => {
  it("refuses a 33rd camera range with an error that names the limit, instead of dropping ranges", () => {
    const r = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 40 });
    const rows = Array.from({ length: 40 }, (_, i) => `beats ${i}-${i + 1} | action: rest | camera: ${i % 2 ? "orbit" : "static"}`).join("\n");
    expect(() => applyScript(r, { script: rows })).toThrow(/32/);
    const ok = applyScript(r, { script: rows.split("\n").slice(0, 31).join("\n") + "\nbeats 31-40 | action: rest | camera: static" });
    expect(ok.camera!.segments).toHaveLength(32);
  });
});

describe("cutting into a programmed camera range (camera-edits.ts)", () => {
  const frame = (beat: number) => Math.round(beat * 0.5 * 24);
  const prog = (r: Recipe) => programCamera(r.camera!, r.beatGrid, undefined, 400, 24);
  it("splits an orbit's amount between the kept pieces, by their beats", () => {
    let r = setCameraModes(DEFAULT_RECIPE, { modes: ["orbit"], fromBeat: 0, toBeat: 8, fields: { amount: 360 } });
    r = setCameraModes(r, { modes: ["static"], fromBeat: 2, toBeat: 3 });
    expect(r.camera!.segments.slice(0, 3).map(s => s.amount)).toEqual([90, undefined, 225]);
    expect(prog(r).orbit[frame(8)] * 180 / Math.PI).toBeCloseTo(315, 6);
  });
  it("pushIn, rise and truck amounts are shared, not doubled", () => {
    for (const [mode, amount] of [["pushIn", 2], ["rise", 1], ["truck", 4]] as const) {
      let r = setCameraModes(DEFAULT_RECIPE, { modes: [mode], fromBeat: 0, toBeat: 8, fields: { amount } });
      r = setCameraModes(r, { modes: ["static"], fromBeat: 4, toBeat: 6 });
      const total = r.camera!.segments.reduce((s, x) => s + (x.amount ?? 0), 0);
      expect(total).toBeCloseTo(amount * 6 / 8, 9);
    }
  });
  it("an end value (to) stays on the piece that ends where the range ended; the piece before ends part way", () => {
    let r = setCameraModes(DEFAULT_RECIPE, { modes: ["pushIn"], fromBeat: 0, toBeat: 8, fields: { to: 2 } });
    const d0 = r.camera!.distance;
    r = setCameraModes(r, { modes: ["static"], fromBeat: 2, toBeat: 3 });
    const [head, , tail] = r.camera!.segments;
    expect(tail.to).toBe(2);
    expect(head.to).toBeCloseTo(d0 + (2 - d0) * 2 / 8, 3);
    const p = prog(r);
    expect(p.distance[frame(2)]).toBeCloseTo(head.to!, 3);
    expect(p.distance[frame(8) - 1]).toBeCloseTo(2, 1);
  });
  it("a rise from/to keeps its height path: each piece covers its share of it", () => {
    let r = setCameraModes(DEFAULT_RECIPE, { modes: ["rise"], fromBeat: 0, toBeat: 8, fields: { from: 1, to: 3 } });
    r = setCameraModes(r, { modes: ["static"], fromBeat: 4, toBeat: 6 });
    const [head, , tail] = r.camera!.segments;
    expect([head.from, head.to]).toEqual([1, 2]);
    expect([tail.from, tail.to]).toEqual([2.5, 3]);
  });
});

describe("hits under a hand-edited energy curve (clip-perform.ts, lock.ts)", () => {
  it("keeps the drum bands, so a rigged move locked to kicks still sees its hits", () => {
    const base = defaultRiggedRecipe();
    delete (base as Partial<Recipe>).reactive;
    base.moves[1].lock = "kick"; base.moves[1].strength = 1;
    const r0 = validateRecipe(base);
    const r1 = validateRecipe({ ...structuredClone(base), energyCurve: { rate: 4, values: [0.5, 0.5, 0.5] } });
    const kicks = [5.3, 6.1, 7.4].map(b => ({ seconds: b * 0.5, strength: 1 }));
    const drive: AudioDrive = { fps: 24, energy: new Float32Array(200).fill(0.5), onsets: [], source: "audio", bands: { hopSeconds: 0.01, low: kicks, mid: [], high: [], peaks: [] } };
    expect(effectiveDrive(r1, drive)!.bands).toBe(drive.bands);
    const t = 5.7 * 0.5;
    expect(loopLayersAt(r1, clipPlanFor(r1, drive), t).map(l => l.cyclePhase)).toEqual(loopLayersAt(r0, clipPlanFor(r0, drive), t).map(l => l.cyclePhase));
  });
  it("the camera rig reads the energy curve too, as the recipe docs say", () => {
    const r = validateRecipe({ ...setCameraModes(DEFAULT_RECIPE, { modes: ["orbit"] }), energyCurve: { rate: 1, values: Array(9).fill(0.9) } });
    const loud: AudioDrive = { fps: 24, energy: new Float32Array(400).fill(0.1), onsets: [], source: "audio" };
    expect(planCamera(r, loud).samples[48].energy).toBeCloseTo(0.9, 6);
  });
  it("pulseBeat with no hits is the identity (playback never slows to a stop)", () => {
    for (let b = 4; b <= 12; b += 0.5) expect(pulseBeat(b, 4, 12, [], 1)).toBe(b);
  });
});

describe("onset strengths (audio-drive.ts)", () => {
  it("are relative to the strongest kept onset, so none exceeds 1", () => {
    const rms = new Float32Array(400);
    rms[100] = 0.3; rms[101] = 0.3; rms[102] = 0.3; rms[103] = 1; rms[104] = 1;
    const o = detectOnsets(rms, 0.0116);
    expect(o.length).toBeGreaterThan(0);
    expect(Math.max(...o.map(x => x.strength))).toBe(1);
  });
});

describe("line breaks in the shot fields (shot-script.ts)", () => {
  it("collapse to a space, so the printed script applies again", () => {
    const r = applyMotionCommand(DEFAULT_RECIPE, { type: "setShot", subject: "a fox\nin the snow", action: "runs\r\n\r\nfast" });
    expect(r.shot!.subject).toBe("a fox in the snow");
    expect(r.shot!.action).toBe("runs fast");
    expect(applyScript(r, { script: printScript(r) }).shot).toEqual(r.shot);
  });
  it("cannot inject a script row", () => {
    const r = applyMotionCommand(DEFAULT_RECIPE, { type: "setShot", subject: "x\nbeats 0-4 | action: rest | camera: top" });
    const rows = (s: string) => s.split("\n").filter(l => l.startsWith("beats")).length;
    expect(rows(printScript(r))).toBe(rows(printScript(DEFAULT_RECIPE)));
  });
  it("printScript never prints a raw line break inside a field", () => {
    const r = { ...DEFAULT_RECIPE, shot: { subject: "a\nb", environment: "", action: "", legend: "" } } as Recipe;
    expect(printScript(r)).toMatch(/shot subject: a b\n/);
  });
  it("a break at either end leaves no stray space, and a field of only breaks is empty", () => {
    const r = applyMotionCommand(DEFAULT_RECIPE, { type: "setShot", subject: "\na fox\n", environment: "\n", action: " \r\n ", legend: "snow" });
    expect(r.shot).toEqual({ subject: "a fox", environment: "", action: "", legend: "snow" });
    const printed = printScript(r);
    expect(printed).toMatch(/shot subject: a fox\n/);
    expect(printed).not.toMatch(/shot (environment|action):/);
    expect(applyScript(r, { script: printed }).shot).toEqual(r.shot);
  });
  it("printScript skips a whitespace-only field of an unvalidated recipe and trims the rest", () => {
    const r = { ...DEFAULT_RECIPE, shot: { subject: "\n", environment: "  \n a street \n", action: "", legend: "" } } as Recipe;
    const printed = printScript(r);
    expect(printed).not.toMatch(/shot subject:/);
    expect(printed).toMatch(/shot environment: a street\n/);
  });
});

describe("walk paths with corners up to the validator's 63 points (corners.ts)", () => {
  it("cornerPath stays within its cap for every accepted size", () => {
    for (let n = 3; n <= 63; n++) {
      const pts = Array.from({ length: n }, (_, i) => ({ x: i, z: i % 2 }));
      expect(cornerPath(pts, 0.5).length).toBeLessThanOrEqual(CORNER_PATH_MAX);
    }
  });
  it("setRootPath takes 34–63 points with corners, from beat 0 and later", () => {
    for (const n of [34, 40, 63]) for (const fromBeat of [0, 2]) {
      const pts = Array.from({ length: n }, (_, i) => ({ x: i, z: i % 2 }));
      const r = setRootPath(DEFAULT_RECIPE, { points: pts, corners: 0.5, fromBeat });
      expect(r.rootPath.length).toBeLessThanOrEqual(64);
      expect(r.rootShape!.points).toHaveLength(n);
    }
  });
});

describe("deleting the only step of a lane (delete-edits.ts)", () => {
  it("is a no-op with close", () => {
    const r = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 1, moves: [makeMove("bounce", 0)] });
    expect(currentSteps(r, undefined, 4)).toHaveLength(1);
    expect(() => deleteStep(r, undefined, { division: 4, index: 0, mode: "close" })).not.toThrow();
    expect(deleteStep(r, undefined, { division: 4, index: 0, mode: "close" })).toBe(r);
  });
});
