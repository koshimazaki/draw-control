import { describe, expect, it } from "vitest";
import { analyseSamples, buildDrive, frameAt, planCamera, travelStations, type Recipe } from "@motion-studio/core";
import { patternTimes, synthDrums } from "@motion-studio/core/internal";
import { beatPathRecipe, exportRange, type TrackInfo } from "../src/beat-path/recipe-map";
import { fitLanes, fromScript, setWord, toScript, type BeatPathState } from "../src/beat-path/script";
import { BLANK_STATE, EXAMPLES, exampleState } from "../src/beat-path/examples";

const samples = synthDrums(patternTimes(120, 8, 0.1), 16.6);
const features = analyseSamples([samples], 44100);
const drive = buildDrive(features, 24, Math.ceil(features.lengthSeconds * 24) + 1);
const info: TrackInfo = { name: "demo-drums-120.wav", licence: "generated", bpm: features.estimatedBpm!, offsetSeconds: features.estimatedOffsetSeconds, lengthSeconds: features.lengthSeconds };
const ctx = { drive, bands: drive.bands };
const S = (over: Partial<BeatPathState> = {}): BeatPathState => ({ ...exampleState(0), ...over });
const build = (s: BeatPathState) => beatPathRecipe(s, info, ctx);
const seg = (r: Recipe, i = 0) => r.camera!.segments[i];
const frames = (r: Recipe) => Array.from({ length: 193 }, (_, n) => frameAt(r, n, drive).root);
const cams = (r: Recipe) => planCamera(r, drive, 200).samples.slice(0, 193).map(s => s.position);

describe("Beat Path: the page state is a shot script", () => {
  it("every example reads back to the same state and the same script", () => {
    for (let i = 0; i < EXAMPLES.length; i++) {
      const s = exampleState(i), printed = toScript(s);
      const again = fromScript(printed, BLANK_STATE);
      expect(again.notes).toEqual([]);
      expect(again.state).toEqual(s);
      expect(toScript(again.state)).toBe(printed);
      expect(s.prompt).toMatch(/orange figure/);
    }
  });
  it("a typed camera phrase and muted hits round-trip through the script", () => {
    const s = S({ muted: [2.1, 4.6], cameraLane: [{ from: 0, to: 9, word: "behind", phrase: "go above then dolly in 2m fast" }, { from: 9, to: 17, word: "orbit", phrase: "orbit 180 slow" }] });
    const printed = toScript(s);
    expect(printed).toMatch(/^muted: 2\.1 4\.6$/m);
    expect(printed).toMatch(/camera: go above then dolly in 2m fast lock kick 1 hold/);
    const back = fromScript(printed, BLANK_STATE);
    expect(back.notes).toEqual([]);
    expect(back.state.cameraLane.map(b => b.phrase)).toEqual(["go above then dolly in 2m fast", "orbit 180 slow"]);
    expect(back.state.muted).toEqual([2.1, 4.6]);
    const r = build(s);
    expect(r.mutedHits).toEqual([2.1, 4.6]);
    expect(r.camera!.segments.map(x => x.modes.join("+"))).toEqual(["top", "pushIn", "orbit"]);
  });
  it("only one glide block: making a second one turns the first to hover", () => {
    const lane = setWord([{ from: 0, to: 4, word: "glide" }, { from: 4, to: 8, word: "hover" }], 1, "glide", "glide");
    expect(lane.map(b => b.word)).toEqual(["hover", "glide"]);
  });
  it("lanes fit a new clip length on half beats, each block at least a beat", () => {
    const s = fitLanes(S(), 11);
    for (const lane of [s.character, s.cameraLane]) {
      expect(lane[0].from).toBe(0);
      expect(lane.at(-1)!.to).toBe(11);
      for (const b of lane) { expect(b.to - b.from).toBeGreaterThanOrEqual(1); expect(b.to * 2 % 1).toBe(0); }
    }
  });
});

describe("Beat Path: each control's recipe fields", () => {
  it("each lane locks on its own: the character on kicks, the camera on snares", () => {
    const r = build(S({ charLock: { lock: "kick", strength: 0.7 }, camLock: { lock: "snare", strength: 0.5, onHit: "hold", advance: false } }));
    expect(r.travelLock).toEqual({ lock: "kick", strength: 0.7 });
    for (const s of r.camera!.segments) expect([s.lock, s.strength, s.onHit]).toEqual(["snare", 0.5, "hold"]);
    const back = fromScript(toScript(S({ charLock: { lock: "kick", strength: 0.7 }, camLock: { lock: "snare", strength: 0.5, onHit: "punch", advance: true } })), BLANK_STATE).state;
    expect([back.charLock, back.camLock]).toEqual([{ lock: "kick", strength: 0.7 }, { lock: "snare", strength: 0.5, onHit: "punch", advance: true }]);
    expect(travelStations(r, drive).length).toBeGreaterThan(2);
  });
  it("on each hit: keeps moving leaves the camera unlocked, punches in sets the punch", () => {
    const cam = (patch: Partial<BeatPathState["camLock"]>) => ({ camLock: { ...S().camLock, ...patch } });
    for (const s of build(S(cam({ onHit: "move" }))).camera!.segments) expect(s.lock).toBeUndefined();
    for (const s of build(S(cam({ onHit: "punch" }))).camera!.segments) expect([s.onHit, s.punch]).toEqual(["punch", 0.9]);
  });
  it("camera words map to rig modes", () => {
    const words = ["behind", "side", "orbit", "top", "path", "push"] as const;
    const lane = words.map((word, i) => ({ from: i * 2, to: i * 2 + 2, word }));
    lane[5].to = 17;
    const r = build(S({ cameraLane: lane, camera: [{ x: -6, z: 6, y: 2 }, { x: 4, z: 7, y: 2.4 }], cameraCorners: 0.3 }));
    expect(r.camera!.segments.map(s => s.modes.join("+"))).toEqual(["chase", "side", "orbit", "top", "path", "pushIn"]);
    expect([seg(r, 2).amount, seg(r, 5).to, r.camera!.corners, r.camera!.path!.length]).toEqual([30, 2.6, 0.3, 2]);
    expect(seg(r, 0).shot).toBe("wide");
  });
  it("character words: glide travels the path with its corners, spin and jump are accents on the glider", () => {
    const r = build(S({ subjectCorners: 0.25, character: [{ from: 0, to: 9, word: "glide" }, { from: 9, to: 13, word: "spin" }, { from: 13, to: 17, word: "jump" }] }));
    expect(r.character.kind).toBe("glider");
    expect(r.rootShape?.corners).toBe(0.25);
    expect(r.reactive?.markers?.map(m => m.accent)).toEqual(["spin", "jump"]);
    const end = r.rootPath.at(-1)!;
    expect(end.beat).toBe(9);
  });
  it("heights on the path lift the figure; the camera follows the height", () => {
    const r = build(S({ subject: [{ x: -4, z: 0, y: 2 }, { x: 4, z: 0, y: 2 }] }));
    expect(frameAt(r, 100, drive).root.y).toBeCloseTo(2, 3);
    expect(r.camera!.followHeight).toBe(true);
  });
  it("clip 5 s exports 121 frames, 8 s exports 193", () => {
    expect(exportRange(build(fitLanes(S({ clip: 5 }), 11)), 5).frames).toBe(121);
    expect(exportRange(build(S({ clip: 8 })), 8).frames).toBe(193);
  });
  it("lock off and strength 0 give the unlocked motion and camera", () => {
    const off = build(S({ charLock: { lock: "off", strength: 1 }, camLock: { lock: "off", strength: 1, onHit: "hold", advance: false } }));
    for (const onHit of ["hold", "punch"] as const) {
      const zero = build(S({ charLock: { lock: "kick", strength: 0 }, camLock: { lock: "kick", strength: 0, onHit, advance: false } }));
      expect(frames(zero)).toEqual(frames(off));
      expect(cams(zero)).toEqual(cams(off));
    }
    expect(frames(build(S({ charLock: { lock: "kick", strength: 1 } })))).not.toEqual(frames(off));
  });
});
