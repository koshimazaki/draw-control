import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWav, frameAt, validateRecipe, type Recipe } from "../../packages/core/src/index.ts";
import { patternTimes, synthDrums } from "../../packages/core/src/drum-synth.ts";
import { main, parseArgs, parseValue } from "../src/main.ts";
import { readWav } from "../src/audio-file.ts";

const dir = mkdtempSync(join(tmpdir(), "ms-cli-"));
const wav = join(dir, "drums.wav");
writeFileSync(wav, encodeWav([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100, 0, 16.6));
const run = async (...argv: string[]) => {
  const out: string[] = [], err: string[] = [];
  const code = await main(argv, s => out.push(s), s => err.push(s));
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("motion-studio CLI", () => {
  it("a script on new --character glider (and mannequin) prints no rig line; rig: prints back after set", async () => {
    const script = join(dir, "orbit.txt");
    writeFileSync(script, "beats 0-4 | action: rest | camera: orbit 70 | shot: -\n");
    for (const character of ["glider", "mannequin"]) {
      const base = join(dir, `new-${character}.json`), out = join(dir, `new-${character}.out.json`);
      expect((await run("new", "--character", character, "--clip", "8", "--out", base)).code).toBe(0);
      expect((await run("script", base, script, "--out", out)).code).toBe(0);
      expect((await run("describe", out, "--script")).out).not.toMatch(/^rig:/m);
    }
    const yawed = join(dir, "new-glider.yaw.json");
    expect((await run("set", join(dir, "new-glider.out.json"), "camera.startYaw", "45", "--out", yawed)).code).toBe(0);
    expect((await run("describe", yawed, "--script")).out.split("\n")[0]).toBe("rig: yaw 45");
  });
  it("describe --timed prints the timed prompt (plain, or Seedance's brackets), and refuses a bad style", async () => {
    const script = join(dir, "timed.txt"), base = join(dir, "timed-base.json"), out = join(dir, "timed.json");
    writeFileSync(script, "beats 0-5 | action: glide on path (-10,0) (10,0) | camera: follow behind | shot: wide\nbeats 5-17 | action: continue | camera: top | shot: top\n");
    expect((await run("new", "--character", "glider", "--clip", "8", "--out", base)).code).toBe(0);
    expect((await run("script", base, script, "--out", out)).code).toBe(0);
    expect((await run("describe", out, "--timed")).out).toBe("0.0–2.5 s: wide shot; the camera follows from behind as it glides along its path\n2.5–8.0 s, on the beat: top view, looking straight down on it");
    expect((await run("describe", out, "--timed", "--style", "brackets", "--seconds", "4")).out.split("\n")[1]).toBe("[2.5-4s] on the beat: top view, looking straight down on it");
    expect((await run("describe", out, "--timed", "--style", "json")).code).not.toBe(0);
  });
  it("parses flags and values", () => {
    expect(parseArgs(["apply", "r.json", "--out", "x.json", "--grid"])).toEqual({ pos: ["apply", "r.json"], flags: { out: "x.json", grid: true } });
    expect(parseValue("2.5")).toBe(2.5);
    expect(parseValue("[\"orbit\"]")).toEqual(["orbit"]);
    expect(parseValue("Walk_Loop")).toBe("Walk_Loop");
  });
  it("reads 16-bit WAV", () => {
    const d = readWav(new Uint8Array(readFileSync(wav)));
    expect(d.sampleRate).toBe(44100);
    expect(d.channels[0].length).toBe(Math.round(16.6 * 44100));
  });
  it("worked example: analyse, a jump on every second kick, a camera push on the first snare, describe", async () => {
    const a = join(dir, "analysis.json"), r0 = join(dir, "recipe.json"), cmds = join(dir, "commands.json"), r1 = join(dir, "recipe.next.json");
    const an = await run("analyse", wav, "--out", a);
    expect(an.code).toBe(0);
    expect(an.err).toMatch(/120 BPM.*20 kicks, 16 snares/);
    expect((await run("new", "--analysis", a, "--out", r0)).code).toBe(0);
    writeFileSync(cmds, JSON.stringify([
      { type: "placeOnEvery", move: "jump", target: "kick", every: 2, replace: true },
      { type: "setCamera", distance: 4.8, height: 1.3 },
      { type: "setCameraModes", modes: ["orbit"] },
      { type: "startCameraMove", modes: ["pushIn"], target: "snare", index: 0, lengthBeats: 4 },
    ]));
    const ap = await run("apply", r0, cmds, "--analysis", a, "--out", r1);
    expect(ap.err).toBe("");
    const recipe = validateRecipe(JSON.parse(readFileSync(r1, "utf8"))) as Recipe;
    expect(recipe.reactive!.markers!.length).toBe(10);
    expect(recipe.camera!.segments.map(s => s.modes[0])).toEqual(["orbit", "pushIn", "orbit"]);
    const d = await run("describe", r1, "--analysis", a);
    expect(d.out).toMatch(/Hit markers \(10, edited\): jump@/);
    expect(d.out).toMatch(/pushIn 1\.\d+–5\.\d+/);
    expect(d.out).toMatch(/kicks 20/);
    // Same script, same frames.
    const again = join(dir, "again.json");
    await run("apply", r0, cmds, "--analysis", a, "--out", again);
    const r2 = JSON.parse(readFileSync(again, "utf8")) as Recipe;
    expect([0, 40, 97, 180].map(n => frameAt(r2, n))).toEqual([0, 40, 97, 180].map(n => frameAt(recipe, n)));
  });
  it("shot script: the spoken direction as a script, applied by the CLI and read back (docs/agents.md)", async () => {
    const a = join(dir, "analysis.json"), r0 = join(dir, "recipe.json"), path = join(dir, "path.json"), rp = join(dir, "recipe.path.json"), rs = join(dir, "recipe.shot.json");
    const script = new URL("../../examples/scripts/follow-jump-top.txt", import.meta.url).pathname;
    writeFileSync(path, JSON.stringify([{ type: "setRootPath", points: [{ x: 0, z: 0 }, { x: 2, z: -3 }, { x: 5, z: -5 }, { x: 8, z: -5 }], fromBeat: 0, toBeat: 8 }]));
    expect((await run("apply", r0, path, "--out", rp)).code).toBe(0);
    const s = await run("script", rp, script, "--analysis", a, "--out", rs);
    expect(s.err).toBe("");
    const d = await run("describe", rs, "--analysis", a, "--script");
    expect(d.out.split("\n")[0]).toMatch(/^beats 0-8 +\| action: run on path (\([-\d.,]+\) )+lock kick 0\.5 +\| camera: chase +\| shot: wide$/);
    expect(d.out).toMatch(/beats 8-10 +\| action: jump @snare 1 +\| camera: orbit 360 +\| shot: medium/);
    const bad = await run("script", rp, join(dir, "nope.txt"));
    expect(bad.code).toBe(1);
    writeFileSync(join(dir, "fall.txt"), "beats 0-4 | action: fall\n");
    expect((await run("script", rp, join(dir, "fall.txt"))).err).toMatch(/unknown action "fall"/);
  });
  it("a page setup file (setup.json) works in place of a script: its script is applied", async () => {
    const a = join(dir, "analysis.json"), r0 = join(dir, "recipe.json"), fromScript = join(dir, "s1.json"), fromSetup = join(dir, "s2.json"), setup = join(dir, "setup.json");
    const script = new URL("../../examples/scripts/glide-path.txt", import.meta.url).pathname;
    writeFileSync(setup, JSON.stringify({ kind: "beat-path-setup", version: 1, state: {}, script: readFileSync(script, "utf8") }));
    expect((await run("script", r0, script, "--analysis", a, "--out", fromScript)).err).toBe("");
    expect((await run("script", r0, setup, "--analysis", a, "--out", fromSetup)).err).toBe("");
    expect(readFileSync(fromSetup, "utf8")).toBe(readFileSync(fromScript, "utf8"));
    writeFileSync(setup, JSON.stringify({ kind: "beat-path-setup", version: 1, state: {} }));
    expect((await run("script", r0, setup)).err).toMatch(/no script/);
  });
  it("shot script with path points: the walk path and the camera path in metres, read back", async () => {
    const a = join(dir, "analysis.json"), r0 = join(dir, "recipe.json"), out = join(dir, "glide.json");
    const script = new URL("../../examples/scripts/glide-path.txt", import.meta.url).pathname;
    expect((await run("script", r0, script, "--analysis", a, "--out", out)).err).toBe("");
    const d = await run("describe", out, "--analysis", a, "--script");
    expect(d.out).toMatch(/action: glide on path \(0,0\) \(2,0\) \(2,3,0\.5\) lock kick 0\.8/);
    expect(d.out).toMatch(/camera: path \(6,3,1\.8\) \(2,8,2\.2\) \(-3,4,1\.8\)/);
  });
  it("set by path, with readable errors", async () => {
    const r0 = join(dir, "recipe.json");
    const s = await run("set", r0, "moves[1].speed", "2");
    expect(JSON.parse(s.out).moves[1].speed).toBe(2);
    const bad = await run("set", r0, "beatGrid.bpm", "900");
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/bpm must be 40–240/);
    const unknown = await run("apply", r0, join(dir, "nope.json"));
    expect(unknown.code).toBe(1);
  });
  it("lists the commands", async () => {
    const c = await run("commands");
    for (const k of ["placeOnEvery", "startCameraMove", "drawEnvelope", "setRootPath", "set"]) expect(c.out).toContain(k);
  });
});
