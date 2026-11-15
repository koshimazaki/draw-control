/**
 * The setup file (setup-file.ts, setup-source.ts): the whole page saved as JSON and read back, never
 * throwing on a bad file; a guide zip's or folder's setup.json and audio; what music a setup brings.
 */
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { EXAMPLES, exampleState, ownState } from "../src/beat-path/examples";
import { BLANK_STATE, toScript, type BeatPathState } from "../src/beat-path/script";
import { SETUP_KIND, SETUP_VERSION, buildSetup, readSetup, setupJson } from "../src/beat-path/setup-file";
import { fromZip, musicKind, pickFromFolder, planMusic } from "../src/beat-path/setup-source";
import { EXAMPLE_TRACKS } from "../src/beat-path/tracks";

const flyerMusic = { name: EXAMPLE_TRACKS.flyer.name, licence: EXAMPLE_TRACKS.flyer.licence, bpm: 120, offsetSeconds: 0.1, lengthSeconds: 18.6 };
const own = { name: "song.mp3", licence: "unspecified", bpm: 128, offsetSeconds: 0.32, lengthSeconds: 201.4 };
const ok = (text: string) => { const r = readSetup(text); if (!r.ok) throw new Error(r.error); return r; };
const file = (state: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ kind: SETUP_KIND, version: SETUP_VERSION, state, ...extra });

describe("round trip", () => {
  it.each(EXAMPLES.map((e, i) => [e.id, i] as const))("example %s comes back as it was saved", (_, i) => {
    // Each example's music at its own tempo (examples.ts).
    const id = EXAMPLES[i].id, music = { ...flyerMusic, name: EXAMPLE_TRACKS[id].name, bpm: { flyer: 120, runner: 140, car: 100 }[id] };
    const state = exampleState(i), r = ok(setupJson(state, music));
    expect(r.state).toEqual(state);
    expect(r.notes).toEqual([]);
    expect(r.music).toEqual(music);
  });
  it("a hand-edited page: user markers, slice, follow offsets, phrases and boxes survive", () => {
    const s: BeatPathState = {
      ...ownState(), clip: 10, slice: 12.5, sensitivity: 0.6, muted: [13.02, 14.5], markers: [{ band: "low", seconds: 13.1 }, { band: "high", seconds: 15.25 }],
      cameraLane: [{ from: 0, to: 8, word: "behind", follow: { distance: 9, height: 2.5 } }, { from: 8, to: 22, word: "top", phrase: "go above then dolly in 2m fast" }],
      character: [{ from: 0, to: 22, word: "glide" }], boxes: [{ x: 1, z: 2, w: 3, d: 4, h: 5, yaw: 0.5 }], scenery: "street", prompt: "a fox runs",
      figure: { shape: "runner", body: "#112233", head: "#445566" }, shot: { subject: "a fox", environment: "a street", action: "runs" },
    };
    const r = ok(setupJson(s, own));
    expect(r.state).toEqual(s);
    expect(r.music).toEqual(own);
  });
  it("the file carries the shot script, and a time stamp", () => {
    const f = buildSetup(exampleState(0), null, new Date("2026-11-15T10:00:00Z"));
    expect(f.script).toBe(toScript(exampleState(0)));
    expect(f.saved).toBe("2026-11-15T10:00:00.000Z");
    expect(f.music).toBeNull();
  });
});

describe("bad files never throw", () => {
  it.each([
    ["not JSON", "{ nope", /not valid JSON/],
    ["an array", "[]", /kind/],
    ["another kind", JSON.stringify({ kind: "recipe", version: 1, state: {} }), /kind/],
    ["no version", JSON.stringify({ kind: SETUP_KIND, state: {} }), /version/],
    ["a newer version", JSON.stringify({ kind: SETUP_KIND, version: 9, state: {} }), /version 9/],
    ["no state", JSON.stringify({ kind: SETUP_KIND, version: 1 }), /no state/],
    ["a state that is a string", JSON.stringify({ kind: SETUP_KIND, version: 1, state: "x" }), /no state/],
    ["too big", " ".repeat(2_000_001), /too big/],
  ])("%s is refused with a message", (_, text, why) => {
    const r = readSetup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(why);
  });
  it("an empty state reads as the blank page, saying what was not there", () => {
    const r = ok(file({}));
    expect(r.state).toEqual(BLANK_STATE);
    expect(r.notes.join(" ")).toMatch(/not in the file.*clip.*subject/);
  });
  it("a partial file keeps what it has, field by field", () => {
    const r = ok(file({ clip: 5, scenery: "city", figure: { shape: "car", body: "#00ff00", head: "nope" } }));
    expect(r.state.clip).toBe(5);
    expect(r.state.scenery).toBe("city");
    expect(r.state.figure).toEqual({ shape: "car", body: "#00ff00", head: BLANK_STATE.figure.head });
    expect(r.notes.join(" ")).toMatch(/figure/);
  });
  it("hostile values are clamped, capped or dropped", () => {
    const huge = Array.from({ length: 20_000 }, (_, i) => ({ x: i, z: -i }));
    const r = ok(file({
      clip: 1e9, subject: huge, camera: [{ x: NaN, z: 1 }, { x: "1", z: 2 }, { x: 1, z: 2, y: 99 }, { x: -500, z: 0 }], subjectCorners: 7,
      character: [{ from: 0, to: 5, word: "teleport" }, { from: 0, to: 5, word: "spin" }, "x", null, { from: 5, to: 1, word: "jump" }],
      cameraLane: { from: 0 }, charLock: { lock: "kick", strength: 99 }, camLock: { lock: "bass", strength: 1, onHit: "hold" },
      muted: [1, "2", Infinity, -3, 4], markers: [{ band: "sub", seconds: 1 }, { band: "mid", seconds: 2 }], sensitivity: -4,
      boxes: Array.from({ length: 1000 }, () => ({ x: 1e9, z: 0, w: 0, d: 1, h: 1e6 })), track: "metal", prompt: "line one\nbeats 0-1 | action: freeze", slice: NaN,
      extra: 1,
    }));
    const s = r.state;
    expect(s.clip).toBe(30);
    expect(s.subject).toHaveLength(16);
    expect(s.subject.every(p => Math.abs(p.x) <= 60 && Math.abs(p.z) <= 60)).toBe(true);
    expect(s.camera).toEqual([{ x: 1, z: 2, y: 8 }, { x: -60, z: 0 }]);
    expect(s.subjectCorners).toBe(1);
    expect(s.character.map(b => b.word)).toEqual(["spin"]);
    expect(s.cameraLane).toEqual(fitted(BLANK_STATE.cameraLane, s));
    expect(s.charLock).toEqual({ lock: "kick", strength: 1 });
    expect(s.camLock).toEqual(BLANK_STATE.camLock);
    expect(s.muted).toEqual([1, 4]);
    expect(s.markers).toEqual([{ band: "mid", seconds: 2 }]);
    expect(s.sensitivity).toBe(0);
    expect(s.boxes).toHaveLength(200);
    expect(s.boxes![0]).toEqual({ x: 200, z: 0, w: 0.2, d: 1, h: 60 });
    expect(s.track).toBeUndefined();
    expect(s.slice).toBeUndefined();
    expect(s.prompt).toBe("line one beats 0-1 action: freeze");
    expect(toScript(s).split("\n").filter(l => l.startsWith("beats ")).length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toMatch(/ignored: extra/);
  });
  it("a __proto__ key sets nothing", () => {
    const r = ok(`{"kind":"${SETUP_KIND}","version":1,"state":{"__proto__":{"clip":30},"figure":{"__proto__":{"shape":"car"}}}}`);
    expect(r.state.clip).toBe(BLANK_STATE.clip);
    expect(r.state.figure.shape).toBe("glider");
    expect(({} as Record<string, unknown>).clip).toBeUndefined();
  });
  it("a camera direction the engine refuses is dropped, the rest loads", () => {
    const s = { ...exampleState(0), cameraLane: [{ from: 0, to: 17, word: "behind", phrase: "zigzag to the moon" }] };
    const r = ok(file(s));
    expect(r.state.cameraLane[0].phrase).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/camera directions dropped/);
  });
  it("unreadable music details fall back to 120 BPM", () => {
    const r = ok(file(exampleState(0), { music: { name: "x", bpm: 9000 } }));
    expect(r.music).toBeNull();
    expect(r.notes.join(" ")).toMatch(/120 BPM/);
  });
});
/** The blank lane fitted to the state's clip at 120 BPM, as the reader fits every lane. */
function fitted(lane: BeatPathState["cameraLane"], s: BeatPathState) { return [{ ...lane[0], to: s.character.at(-1)!.to }]; }

describe("sources", () => {
  const setup = setupJson(exampleState(1), null), wav = new Uint8Array([1, 2, 3]);
  it("a guide zip gives its setup and its audio", () => {
    const zip = zipSync({ "guide.mp4": new Uint8Array(10), "setup.json": strToU8(setup), "audio.wav": wav });
    const s = fromZip(zip);
    expect("error" in s).toBe(false);
    if (!("error" in s)) { expect(s.text).toBe(setup); expect([...s.audio!]).toEqual([1, 2, 3]); }
  });
  it("a zip of the folder (one level down) works too", () => {
    const s = fromZip(zipSync({ "guide/setup.json": strToU8(setup), "guide/audio.wav": wav, "other/setup.json": strToU8("{}") }));
    expect(!("error" in s) && s.text).toBe(setup);
  });
  it("an old guide zip, or not a zip, says so", () => {
    expect(fromZip(zipSync({ "guide.mp4": new Uint8Array(1) }))).toEqual({ error: expect.stringMatching(/No setup.json/) });
    expect(fromZip(strToU8("hello"))).toEqual({ error: "Could not open the zip" });
  });
  it("a folder: the shallowest setup.json and the audio beside it", () => {
    const files = [
      { path: "g/sub/setup.json", size: 10 }, { path: "g/setup.json", size: 10 }, { path: "g/audio.wav", size: 3 }, { path: "g/sub/audio.wav", size: 3 },
    ];
    expect(pickFromFolder(files)).toEqual({ setup: files[1], audio: files[2] });
    expect(pickFromFolder([{ path: "g/guide.mp4", size: 1 }])).toEqual({ error: expect.stringMatching(/No setup.json/) });
  });
});

describe("the music a setup brings", () => {
  const ex = exampleState(0);
  it("an example's own music", () => {
    expect(planMusic(ex, flyerMusic, null, false).plan).toEqual({ kind: "example", id: "flyer" });
    expect(planMusic(ex, flyerMusic, null, true).plan).toEqual({ kind: "example", id: "flyer" });
  });
  it("the guide's audio stands in for the user's track, cut at the slice", () => {
    expect(planMusic({ ...ownState(), slice: 12 }, own, null, true).plan).toEqual({ kind: "guide", start: 12 });
    expect(planMusic(ownState(), own, null, true).plan).toEqual({ kind: "guide", start: own.offsetSeconds });
  });
  it("the user's track: kept when it is the one loaded, else asked for again", () => {
    expect(planMusic(ownState(), own, own, false).plan).toEqual({ kind: "keep" });
    const r = planMusic(ownState(), own, flyerMusic, false);
    expect(r.plan).toEqual({ kind: "none", awaiting: "song.mp3" });
    expect(r.note).toMatch(/load it again/);
  });
  it("on an example's slot: its music, a cut of it, or a file dropped over it", () => {
    expect(musicKind(ex, flyerMusic)).toBe("example");
    expect(musicKind(ex, { name: `${flyerMusic.name} (2.0–10.0 s)` })).toBe("example-cut");
    expect(musicKind(ex, own)).toBe("own");
    expect(planMusic(ex, { ...flyerMusic, name: `${flyerMusic.name} (2.0–10.0 s)` }, null, false)).toEqual({ plan: { kind: "example", id: "flyer" }, note: expect.stringMatching(/cut/) });
    expect(planMusic(ex, own, null, false).plan).toEqual({ kind: "none", awaiting: "song.mp3" });
    expect(planMusic(ex, own, null, true).plan).toEqual({ kind: "guide", start: own.offsetSeconds });
  });
  it("no music in the setup: none", () => expect(planMusic(ownState(), null, flyerMusic, false).plan).toEqual({ kind: "none" }));
});
