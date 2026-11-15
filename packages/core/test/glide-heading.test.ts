/**
 * The glider's heading and lean along a drawn path (glide-heading.ts). The S-curve is what the
 * Beat Path pen keeps of a hand-drawn stroke with tremor (8 points), flown by the flyer over
 * the 8 s clip with a kick lock, as the page's first example does. On the straight polyline
 * interpolation the yaw stepped up to 8.6° a frame at Corners 0.5, its rate jumped 5.4° a
 * frame at the points, and the bank reversed 16 times with 18° roll steps: the jitter on the
 * joints.
 */
import { describe, expect, it } from "vitest";
import {
  analyseSamples, applyMotionCommand, beatPathBase, buildDrive, frameAt, grooveTimes, secondsAtBeat, subjectAt, synthDrums,
  type AudioDrive, type Recipe,
} from "../src/internal";
import { rootAt } from "../src/root-travel";

const S_CURVE = "(-11.979,-0.142,3) (-9.018,4.536,3) (-6.168,6.143,3) (-2.722,4.091,3) (1.938,-3.281,3) (4.383,-5.805,3) (7.892,-5.343,3) (11.861,0.07,3)";

let drive: AudioDrive | undefined;
function track(): AudioDrive {
  if (!drive) {
    const f = analyseSamples([synthDrums(grooveTimes("straight", 9, 0.1), 18.6)], 44100);
    drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1);
  }
  return drive;
}
const base = () => beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: 0.093, audio: { name: "drums", licence: "MIT" } });
const scripted = (script: string): Recipe => applyMotionCommand(base(), { type: "applyScript", script }, { drive: track(), bands: track().bands });
const flyer = (action: string, shape = "flyer") =>
  scripted(`figure: shape ${shape} body #ff6a13 head #ffb27a\nbeats 0-5 | action: ${action} | camera: follow behind\nbeats 5-17 | action: continue\n`);

const deg = (r: number) => r * 180 / Math.PI;
function measure(recipe: Recipe) {
  const frames = Math.floor(secondsAtBeat(recipe.beatGrid, recipe.durationBeats) * recipe.fps);
  const roots = Array.from({ length: frames }, (_, n) => frameAt(recipe, n, track()).root);
  const yaw = roots.map(r => deg(r.yawRadians)), bank = roots.map(r => deg(r.bank ?? 0));
  const d = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
  const dy = d(yaw), db = d(bank), max = (a: number[]) => Math.max(...a.map(Math.abs));
  const reversals = db.filter((v, i) => i && Math.sign(v) !== Math.sign(db[i - 1]) && Math.abs(v) > 0.5).length;
  return { roots, yaw, bank, yawStep: max(dy), yawRateJump: max(d(dy)), bankStep: max(db), bankMax: max(bank), reversals };
}

describe("the glider turns and leans smoothly along a drawn path", () => {
  it.each([0.5, 1])("an S-curve at Corners %s: no jitter on the joints, still a clear lean", corners => {
    const m = measure(flyer(`walk on path ${S_CURVE} corners ${corners} lock kick 0.8`));
    expect(m.reversals).toBeLessThanOrEqual(3);
    expect(m.bankStep).toBeLessThanOrEqual(2);
    // The turning rate no longer jumps at the path's points (on main: 5.4° and 3.2° a frame, frame to frame).
    expect(m.yawRateJump).toBeLessThanOrEqual(2);
    // What is left of the yaw step is the curve itself: the figure must turn ~3.3° a frame on
    // this S at steady speed, and the kick lock pulses the speed to 1.6× (on main: 8.6° and 5.0°).
    expect(m.yawStep).toBeLessThanOrEqual(corners === 1 ? 4.5 : 6);
    expect(m.bankMax).toBeGreaterThanOrEqual(15);
    expect(m.bankMax).toBeLessThan(deg(0.65));
  });

  it("moves only the heading and the lean: the position along the path is the path's own", () => {
    const r = flyer(`walk on path ${S_CURVE} corners 0.5 lock kick 0.8`);
    for (let n = 0; n < 206; n += 3) {
      const root = frameAt(r, n, track()).root, p = rootAt(r, frameAt(r, n, track()).beat, track());
      expect([root.x, root.y, root.z]).toEqual([p.x, p.y, p.z]);
    }
  });

  it("starts and ends facing along the path", () => {
    const r = flyer(`walk on path ${S_CURVE} corners 0.5`), m = measure(r), path = r.rootPath;
    expect(m.yaw[0]).toBeCloseTo(path[0].yaw, 6);
    expect(m.yaw[m.yaw.length - 1]).toBeCloseTo(path[path.length - 1].yaw, 6);
  });

  it("a straight path: no lean, a constant heading", () => {
    const m = measure(flyer("walk on path (-10,0,3) (0,2,3) (10,4,3) corners 0.5"));
    expect(m.bankMax).toBeLessThan(1e-9);
    expect(Math.max(...m.yaw) - Math.min(...m.yaw)).toBeLessThan(1e-9);
  });

  it("holds its heading while it holds at a station of the travel lock", () => {
    const r = flyer(`walk on path ${S_CURVE} corners 0.5 lock kick 1`), m = measure(r);
    let held = 0;
    for (let n = 1; n < m.roots.length; n++) {
      const a = m.roots[n - 1], b = m.roots[n];
      if (a.x === b.x && a.z === b.z && a.y === b.y) { held++; expect(m.yaw[n]).toBe(m.yaw[n - 1]); }
    }
    expect(held).toBeGreaterThan(5);
  });

  it("keeps a held facing (a glide that does not turn along the path)", () => {
    const m = measure(flyer(`glide on path ${S_CURVE} corners 0.5`));
    expect(Math.max(...m.yaw) - Math.min(...m.yaw)).toBeLessThan(1e-9);
    expect(m.bankMax).toBeLessThan(1e-9);
  });

  it("holds through a freeze, then carries on", () => {
    const r = { ...flyer(`walk on path ${S_CURVE} corners 0.5`), freezes: [{ fromBeat: 6, toBeat: 8 }] };
    const yaw = (n: number) => frameAt(r, n, track()).root.yawRadians;
    // Beats 6-8 are frames ~74-98 at 120 BPM with the first beat at 0.093 s.
    expect(yaw(80)).toBe(yaw(90));
    expect(yaw(110)).not.toBe(yaw(90));
  });

  it("stands still facing where it was: one point, no spin, no lean", () => {
    const r = { ...flyer(`walk on path ${S_CURVE} corners 0.5`), rootPath: [{ beat: 0, x: 1, z: 2, yaw: 40 }] };
    const m = measure(r);
    expect(m.yaw.every(v => Math.abs(v - 40) < 1e-9)).toBe(true);
    expect(m.bankMax).toBe(0);
  });

  it("a two-point path keeps its single direction", () => {
    const r = flyer("walk on path (-5,0,3) (5,5,3)"), m = measure(r);
    expect(Math.max(...m.yaw) - Math.min(...m.yaw)).toBeLessThan(1e-6);
    expect(m.bankMax).toBeLessThan(1e-6);
  });

  it("the car and the runner lean only a little", () => {
    for (const [shape, most] of [["car", 0.08], ["runner", 0.2]] as const) {
      const m = measure(flyer(`walk on path ${S_CURVE} corners 0.5 lock kick 0.8`, shape));
      expect(m.bankMax).toBeLessThan(deg(most));
      expect(m.bankStep).toBeLessThanOrEqual(1);
    }
  });

  it("the camera's subject turns with the figure, not with the path's points", () => {
    const r = flyer(`walk on path ${S_CURVE} corners 0.5 lock kick 0.8`), m = measure(r);
    for (let n = 0; n < m.roots.length; n += 5) expect(subjectAt(r, frameAt(r, n, track()).beat, track()).heading).toBeCloseTo(m.roots[n].yawRadians, 9);
  });
});

/**
 * A path drawn toward -Z faces ±180°, where the stored yaw can wrap. On main the heading
 * averaged the yaw numbers, so a path whose stored yaw went -179.8, 179.9, -179.8 was
 * smoothed through 0°: the flyer (and the follow camera) swung ~180° the wrong way and back,
 * up to 30° in one frame. "Draw a path, then write `walk on path`" stored exactly that,
 * because the script's retime recomputed the facing without unwrapping it.
 */
describe("a path facing ±180° does not swing the glider round", () => {
  const off180 = (v: number) => Math.abs(((v % 360) + 360) % 360 - 180);
  const toward = (n: number) => Array.from({ length: n }, (_, i) => ({ x: Math.round(Math.sin(i * 2.3) * 100) / 10000, z: 10 - 20 * i / (n - 1) }));
  const withFigure = () => scripted("figure: shape flyer body #ff6a13 head #ffb27a\nbeats 0-17 | action: rest | camera: follow behind\n");
  function check(r: Recipe) {
    const m = measure(r);
    expect(Math.max(...m.yaw.map(off180))).toBeLessThan(5);
    const steps = m.yaw.slice(1).map((v, i) => Math.abs(v - m.yaw[i]));
    expect(Math.max(...steps)).toBeLessThan(1);
    expect(m.bankMax).toBeLessThan(2);
    for (let n = 0; n < m.roots.length; n += 7) expect(off180(subjectAt(r, frameAt(r, n, track()).beat, track()).heading * 180 / Math.PI)).toBeLessThan(5);
    return m;
  }

  it("draw a path toward -Z, then `walk on path`: the stored yaw stays unwrapped and the heading stays at 180°", () => {
    const drawn = applyMotionCommand(withFigure(), { type: "setRootPath", points: toward(24), smooth: false, gait: "glide", face: "path" });
    const r = applyMotionCommand(drawn, { type: "applyScript", script: "figure: shape flyer body #ff6a13 head #ffb27a\nbeats 0-8 | action: walk on path | camera: follow behind\nbeats 8-17 | action: continue\n" }, { drive: track(), bands: track().bands });
    const yaws = r.rootPath.map(p => p.yaw);
    for (let i = 1; i < yaws.length; i++) expect(Math.abs(yaws[i] - yaws[i - 1])).toBeLessThan(10);
    check(r);
  });

  it("a hand-written path whose yaw wraps between points is smoothed the short way round", () => {
    const rootPath = toward(24).map((p, i) => ({ ...p, beat: i * 8 / 23, yaw: i % 2 ? 179.88 : -179.76 }));
    check({ ...withFigure(), rootPath });
  });
});
