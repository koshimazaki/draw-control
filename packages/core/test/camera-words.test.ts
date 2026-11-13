import { describe, expect, it } from "vitest";
import {
  analyseSamples, applyMotionCommand, applyScript, beatPathBase, buildDrive, frameAt, planCamera, printScript, travelStations, type Recipe,
} from "@motion-studio/core";
import { patternTimes, synthDrums } from "@motion-studio/core/internal";

const f = analyseSamples([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100);
const drive = buildDrive(f, 24, 500), ctx = { drive, bands: drive.bands };
const base = () => beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: f.estimatedOffsetSeconds });
const PATH = "walk on path (-6,2) (0,-2) (6,2) corners 0.5";
const run = (camera: string, r: Recipe = base()) => applyScript(r, { script: `beats 0-17 | action: ${PATH} lock kick 1 | camera: ${camera}` }, ctx);

describe("typed camera direction", () => {
  it("over shoulder, above, pace words map to the rig and read back", () => {
    const r = run("over shoulder slow lock kick 1 hold");
    expect(r.camera!.segments[0]).toMatchObject({ modes: ["chase"], shoulder: true, pace: "slow", lock: "kick", onHit: "hold" });
    expect(printScript(r)).toMatch(/camera: over shoulder slow lock kick 1 hold/);
    expect(run("go above").camera!.segments[0].modes).toEqual(["top"]);
    expect(run("orbit 180 fast").camera!.segments[0]).toMatchObject({ modes: ["orbit"], amount: 180, pace: "fast" });
    expect(applyScript(base(), { script: printScript(r) }, ctx)).toEqual(r);
  });
  it("then chains two moves in one block, split evenly or on a locked hit near the middle", () => {
    const even = run("go above then dolly in 2m").camera!.segments;
    expect(even.map(s => [s.fromBeat, s.toBeat, s.modes.join("+"), s.amount])).toEqual([[0, 8.5, "top", undefined], [8.5, 17, "pushIn", 2]]);
    const locked = run("follow side then push in fast lock kick 1 hold").camera!.segments;
    expect(locked[1].fromBeat).not.toBe(8.5);   // moved to the kick near the middle
    expect(locked.every(s => s.lock === "kick" && s.onHit === "hold")).toBe(true);
    expect(locked[1].pace).toBe("fast");
  });
  it("invalid words fail with the valid ones", () => {
    expect(() => run("swoop around")).toThrow(/use one of .*over shoulder.*then.*slow \| even \| fast/);
  });
  it("fast reaches a programmed target early, slow late", () => {
    const at = (r: Recipe, beat: number) => planCamera(r, drive, 420).channels.distance[Math.round((f.estimatedOffsetSeconds + beat / 2) * 24)];
    const [fast, even, slow] = ["fast", "even", "slow"].map(p => run(`dolly in 3m ${p}`));
    // a quarter of the way in, fast has covered more of the 3 m than even, and even more than slow
    expect(at(fast, 4)).toBeLessThan(at(even, 4));
    expect(at(even, 4)).toBeLessThan(at(slow, 4));
  });
  it("over the shoulder sits closer and higher than following behind", () => {
    const [behind, shoulder] = [run("follow behind"), run("over shoulder")].map(r => planCamera(r, drive, 420).samples[200]);
    const root = frameAt(run("follow behind"), 200, drive).root;
    const d = (s: { position: number[] }) => Math.hypot(s.position[0] - root.x, s.position[2] - root.z);
    expect(d(shoulder)).toBeLessThan(d(behind) * 0.8);
    expect(shoulder.position[1]).toBeGreaterThan(behind.position[1]);
  });
});

describe("muted hits", () => {
  it("a muted kick is skipped by the stations; the script and commands round-trip; reset restores", () => {
    const r = run("follow behind lock kick 1 hold");
    const stations = travelStations(r, drive), kick = drive.bands!.low.find(o => Math.abs(o.seconds - (f.estimatedOffsetSeconds + stations[1] / 2)) < 0.03)!;
    const muted = applyMotionCommand(r, { type: "muteHit", seconds: kick.seconds }, ctx);
    expect(muted.mutedHits).toEqual([Math.round(kick.seconds * 1000) / 1000]);
    expect(travelStations(muted, drive)).toEqual(stations.filter((_, i) => i !== 1));
    expect(printScript(muted)).toMatch(/^landmarks: on seed 7\nmuted: [\d.]+\n/);
    expect(applyScript(base(), { script: printScript(muted) }, ctx)).toEqual(muted);
    expect(applyMotionCommand(muted, { type: "muteHit", seconds: kick.seconds }, ctx).mutedHits).toBeUndefined();   // toggles back
    expect(applyMotionCommand(muted, { type: "resetMutedHits" }, ctx).mutedHits).toBeUndefined();
    // the camera's hits skip it too
    const camHits = (x: Recipe) => planCamera(x, drive, 420).programmed.hits.flat();
    expect(camHits(muted).length).toBe(camHits(r).length - 1);
  });
});
