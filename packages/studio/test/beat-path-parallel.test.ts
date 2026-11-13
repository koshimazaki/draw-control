/**
 * Examples 1 and 2 (round 8): parallel-street shots authored as shot scripts. The subject is
 * visible for well over half the clip through the placed blocks, a drawn camera path is paced
 * to the subject (abreast on the parallel street), and the new script words round-trip.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseSamples, applyScript, beatPathBase, buildDrive, frameAt, hiddenSamples, placeLandmarks, planCamera, printScript, scenePaths, type Recipe } from "@motion-studio/core";
import { grooveTimes, synthDrums } from "@motion-studio/core/internal";
import { BLANK_STATE, fromScript, toScript } from "../src/beat-path/script";
import { parallelStreet } from "../src/beat-path/page-follow";

const scripts = new URL("../../../examples/scripts/", import.meta.url);
function load(file: string, style: "straight" | "drive", bars: number) {
  const bpm = { straight: 120, drive: 140 }[style], f = analyseSamples([synthDrums(grooveTimes(style, bars, 0.1), 0.1 + bars * 4 * 60 / bpm + 0.5)], 44100);
  const drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1), grid = { bpm: f.estimatedBpm!, offsetSeconds: f.estimatedOffsetSeconds };
  const text = readFileSync(new URL(file, scripts), "utf8"), s = fromScript(text, BLANK_STATE, grid).state;
  const r = applyScript(beatPathBase({ seconds: s.clip, ...grid }), { script: toScript(s) }, { drive, bands: drive.bands });
  return { r, drive, text, state: s };
}
/** The share of the clip's samples on which a placed block hides the subject. */
function hiddenShare(r: Recipe, drive: ReturnType<typeof buildDrive>) {
  const plan = planCamera(r, drive, 220), blocks = placeLandmarks(r, plan, drive), { subject, camera } = scenePaths(r, plan, drive);
  const hidden = new Uint8Array(Math.min(subject.length, camera.length));
  for (const b of blocks) for (const i of hiddenSamples(b, subject, camera)) hidden[i] = 1;
  return hidden.reduce((a, v) => a + v, 0) / hidden.length;
}

describe("parallel-street examples", () => {
  for (const [file, style, bars] of [["beat-path-ex1-flyer.txt", "straight", 9], ["beat-path-ex2-runner.txt", "drive", 10]] as const) it(`${file}: the subject is visible for well over half the clip`, () => {
    const { r, drive, state } = load(file, style, bars);
    expect(r.sceneryBoxes?.length).toBeGreaterThan(5);
    expect(state.sight).toBe("passes");
    const share = hiddenShare(r, drive);
    console.log(`${file}: hidden ${(share * 100).toFixed(1)} % of the clip`);
    expect(share).toBeLessThan(0.4);
  });
  it("the drawn camera path keeps abreast of the subject (paced to its progress)", () => {
    const { r, drive } = load("beat-path-ex1-flyer.txt", "straight", 9);
    const plan = planCamera(r, drive, 220);
    for (const n of [110, 140, 170]) {
      const root = frameAt(r, n, drive).root, c = plan.samples[n].position;
      expect(Math.abs(c[0] - root.x), `frame ${n}`).toBeLessThan(3);   // the same x on the parallel street
      expect(c[2]).toBeGreaterThan(12);                                   // on the far side of the block row
    }
  });
  it("follow front, fov and offsets round-trip through printScript and applyScript", () => {
    const { r, drive } = load("beat-path-ex2-runner.txt", "drive", 10);
    const last = r.camera!.segments.at(-1)!;
    expect(last).toMatchObject({ modes: ["lead"], fov: 100, follow: { distance: 2.5, height: 0.4 } });
    expect(applyScript(beatPathBase({ seconds: 8, bpm: r.beatGrid.bpm, offsetSeconds: r.beatGrid.offsetSeconds }), { script: printScript(r) }, { drive, bands: drive.bands }).camera).toEqual(r.camera);
  });
  it("the page reads both examples back unchanged", () => {
    for (const [file, style, bars] of [["beat-path-ex1-flyer.txt", "straight", 9], ["beat-path-ex2-runner.txt", "drive", 10]] as const) {
      const { state } = load(file, style, bars);
      expect(fromScript(toScript(state), BLANK_STATE).state.cameraLane).toEqual(state.cameraLane);
    }
  });
});

describe("Parallel street preset", () => {
  it("picks the side with the blocks and clears them", () => {
    const subject = [{ x: -20, z: 0 }, { x: 20, z: 0 }];   // heading +X: its right is +Z
    const row = [-12, -4, 4, 12].map(x => ({ x, z: 8, w: 3.5, d: 5 }));
    expect(parallelStreet(subject, row)).toEqual({ side: "right", distance: 14.5, angle: 180 });
    expect(parallelStreet(subject, row.map(b => ({ ...b, z: -8 })))).toEqual({ side: "left", distance: 14.5 });
  });
});
