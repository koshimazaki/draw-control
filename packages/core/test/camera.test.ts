import { describe, expect, it } from "vitest";
import {
  ACCENT_RELEASE_BEATS, ACCENT_RISE_BEATS, CAMERA_LIMITS, DEFAULT_RECIPE, cameraAtFrame, cameraTimeline, energyEnvelope, flatDrive,
  planCamera, secondsAtBeat, validateRecipe, type AudioDrive, type CameraConfig, type Recipe,
} from "../src";

const FPS = 24, DT = 1 / FPS;
const withCamera = (camera: Partial<CameraConfig>, over: Partial<Recipe> = {}): Recipe => validateRecipe({
  ...structuredClone(DEFAULT_RECIPE), durationBeats: 32, ...over,
  camera: { segments: [{ fromBeat: 0, toBeat: 32, modes: ["orbit"] }], intensity: 1, orbitDegreesPerBeat: 8, distance: 4.4, height: 1.15, fov: 32, startYaw: 0, ...camera },
});
/** A drive that is quiet for 4 s, then loud. */
const stepDrive = (frames = 600): AudioDrive => {
  const rms = new Float32Array(Math.ceil(frames / FPS * 86));
  for (let i = 0; i < rms.length; i++) rms[i] = i / 86 < 4 ? 0.1 : 0.9;
  return { fps: FPS, energy: energyEnvelope(rms, 1 / 86, FPS, frames), onsets: [], source: "audio" };
};
const second = (a: Float64Array, n: number) => a[n + 1] - 2 * a[n] + a[n - 1];

describe("energy envelope", () => {
  const drive = stepDrive();
  it("stays inside 0–1 and is deterministic", () => {
    expect(Math.min(...drive.energy)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drive.energy)).toBeLessThanOrEqual(1);
    expect(stepDrive().energy).toEqual(drive.energy);
  });
  it("follows a step up smoothly (no jump bigger than the attack allows) and settles high", () => {
    const at4 = 4 * FPS;
    for (let n = 1; n < drive.energy.length; n++) expect(Math.abs(drive.energy[n] - drive.energy[n - 1])).toBeLessThan(0.35);
    expect(drive.energy[at4 - 2]).toBeLessThan(0.2);
    expect(drive.energy[at4 + 24]).toBeGreaterThan(0.9);
  });
  it("attacks faster than it releases", () => {
    const rms = new Float32Array(860);
    for (let i = 0; i < rms.length; i++) rms[i] = i >= 172 && i < 430 ? 1 : 0;
    const e = energyEnvelope(rms, 1 / 86, FPS, 240);
    const rise = e[47 + 6] - e[47], fall = e[119] - e[119 + 6];
    expect(rise).toBeGreaterThan(fall * 1.5);
  });
});

describe("camera rig", () => {
  const recipe = withCamera({});
  const drive = stepDrive();
  it("is deterministic and seekable: the same inputs give identical samples", () => {
    const a = planCamera(recipe, drive), b = planCamera(recipe, drive);
    expect(a.samples).toEqual(b.samples);
    expect(cameraAtFrame(a, 137)).toEqual(a.samples[137]);
  });
  it("orbits faster when the music is loud", () => {
    const plan = planCamera(withCamera({ intensity: 1 }, { beatGrid: { bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "manual" } }), drive);
    const rate = (n: number) => plan.channels.yaw[n + 12] - plan.channels.yaw[n];
    // Compare away from beat accents' yaw nudges: take whole-beat spans (they cancel per beat pair).
    const quiet = plan.channels.yaw[3 * 24] - plan.channels.yaw[2 * 24], loud = plan.channels.yaw[9 * 24] - plan.channels.yaw[8 * 24];
    expect(loud).toBeGreaterThan(quiet * 2);
    expect(rate(10)).toBeGreaterThan(0);
  });
  it("lands each beat accent within one frame of its beat", () => {
    const r = withCamera({ segments: [{ fromBeat: 0, toBeat: 32, modes: ["static"] }] }, { beatGrid: { bpm: 117, offsetSeconds: 0.31, beatsPerBar: 4, source: "manual" } });
    const plan = planCamera(r, drive);
    const base = planCamera({ ...r, camera: { ...r.camera!, intensity: 0 } }, drive);
    const push = plan.channels.distance.map((d, n) => base.channels.distance[n] - d);
    for (const a of plan.accents.filter(x => x.beat >= 1 && x.beat < 30)) {
      const from = Math.floor((a.seconds - ACCENT_RISE_BEATS * 60 / 117) * FPS), to = Math.ceil((a.seconds + ACCENT_RELEASE_BEATS * 60 / 117) * FPS);
      let peak = from;
      for (let n = from; n <= to; n++) if (push[n] > push[peak]) peak = n;
      expect(Math.abs(peak * DT - secondsAtBeat(r.beatGrid, a.beat))).toBeLessThanOrEqual(DT);
    }
    expect(plan.accents.filter(a => a.downbeat)[2].amount).toBeGreaterThan(plan.accents.filter(a => !a.downbeat)[2].amount);
  });
  it("clamps acceleration on every channel, including mode changes and accents", () => {
    const r = withCamera({ segments: [
      { fromBeat: 0, toBeat: 6, modes: ["orbit"] }, { fromBeat: 6, toBeat: 12, modes: ["pushIn", "orbit"] },
      { fromBeat: 12, toBeat: 20, modes: ["rise"] }, { fromBeat: 20, toBeat: 32, modes: ["pullOut", "orbit"] },
    ], orbitDegreesPerBeat: -30 }, { beatGrid: { bpm: 170, offsetSeconds: 0, beatsPerBar: 4, source: "manual" } });
    const plan = planCamera(r, drive);
    const yawLimit = (CAMERA_LIMITS.yawAccel + CAMERA_LIMITS.accentYawAccel) * DT * DT * 1.001;
    const linLimit = (CAMERA_LIMITS.linearAccel + CAMERA_LIMITS.accentPushAccel) * DT * DT * 1.001;
    for (let n = 1; n < plan.frames - 1; n++) {
      expect(Math.abs(second(plan.channels.yaw, n))).toBeLessThanOrEqual(yawLimit);
      expect(Math.abs(second(plan.channels.distance, n))).toBeLessThanOrEqual(linLimit);
      expect(Math.abs(second(plan.channels.height, n))).toBeLessThanOrEqual(CAMERA_LIMITS.linearAccel * DT * DT * 1.001);
    }
    // The push-in really moved in, and the rise really rose.
    const at = (beat: number) => Math.round(beat * 60 / 170 * FPS);
    expect(plan.channels.distance[at(12)]).toBeLessThan(plan.channels.distance[at(6)] - 0.6);
    expect(plan.channels.height[at(20)]).toBeGreaterThan(plan.channels.height[at(12)] + 0.8);
  });
  it("holds still in static with intensity 0", () => {
    const plan = planCamera(withCamera({ segments: [{ fromBeat: 0, toBeat: 32, modes: ["static"] }], intensity: 0 }), flatDrive(FPS, 400));
    expect(plan.samples[300]).toEqual(plan.samples[0]);
    expect(plan.samples[0].position[2]).toBeCloseTo(4.4);
  });
  it("chase sits behind the subject's heading", () => {
    const r = withCamera({ segments: [{ fromBeat: 0, toBeat: 32, modes: ["chase"] }], intensity: 0 },
      { rootPath: [{ beat: 0, x: 0, z: 0, yaw: 90 }, { beat: 32, x: 16, z: 0, yaw: 90 }] });
    const s = planCamera(r).samples[200];
    expect(s.position[0]).toBeLessThan(s.target[0] - 3); // subject heads +X, camera trails on -X
  });
  it("builds a combination timeline from chosen modes", () => {
    expect(cameraTimeline(["orbit", "pushIn"], 16, { sequence: true, beatsEach: 8 })).toEqual([
      { fromBeat: 0, toBeat: 8, modes: ["orbit"] }, { fromBeat: 8, toBeat: 16, modes: ["pushIn"] }]);
    expect(() => withCamera({ segments: [{ fromBeat: 0, toBeat: 8, modes: ["lead", "chase"] }] })).toThrow(/one follow rig/);
  });
});

describe("drawn camera path", () => {
  const path = [{ x: -3, y: 1.2, z: 4 }, { x: 0, y: 1.8, z: 5 }, { x: 3, y: 1.4, z: 3.5 }, { x: 4, y: 1.1, z: 0 }];
  const r = withCamera({ segments: [{ fromBeat: 0, toBeat: 32, modes: ["path"] }], path, intensity: 0.8 });
  it("starts on the first point, ends on the last, and looks at the subject", () => {
    const plan = planCamera(r, stepDrive());
    const first = plan.samples[0].position, end = plan.samples[Math.round(16.0 * FPS)].position;
    expect(Math.hypot(first[0] + 3, first[2] - 4)).toBeLessThan(0.1);
    expect(Math.hypot(end[0] - 4, end[2] - 0)).toBeLessThan(0.15);
    expect(plan.samples[100].target[0]).toBe(0);
  });
  it("moves faster along the path when the music is loud, and smoothly", () => {
    const plan = planCamera(r, stepDrive());
    const step = (n: number) => Math.hypot(...plan.samples[n + 1].position.map((v, k) => v - plan.samples[n].position[k]) as [number, number, number]);
    expect(step(8 * FPS)).toBeGreaterThan(step(2 * FPS) * 1.8);
    for (let n = 1; n < 16 * FPS - 2; n++) expect(Math.abs(step(n) - step(n - 1))).toBeLessThan(0.02);
  });
  it("refuses the path mode without a path", () => {
    expect(() => withCamera({ segments: [{ fromBeat: 0, toBeat: 8, modes: ["path"] }] })).toThrow(/needs camera.path/);
  });
});
