/**
 * Camera rig config, stored in the recipe as `camera`. The rig carries the rhythm: a
 * timeline of modes per beat range, with speed and accents driven by the music.
 * Modes:
 * - static: hold;
 * - orbit: continuous yaw around the subject (a carousel), speed scaled by energy;
 * - pushIn / pullOut: dolly towards or away from the subject over the range;
 * - rise: crane up while the aim tilts down;
 * - lead: in front of the subject, facing it as it travels (leading the runner);
 * - chase: behind the subject, following it.
 * Several modes may share a range ("orbit" + "pushIn"); lead and chase exclude each other.
 */
import { fail, isObject, num, only } from "./validate";

export const CAMERA_MODES = ["static", "orbit", "pushIn", "pullOut", "rise", "lead", "chase"] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];
export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  static: "Static", orbit: "Orbit", pushIn: "Push in", pullOut: "Pull out", rise: "Rise and tilt", lead: "Lead (front)", chase: "Chase (back)",
};
export type CameraSegment = { fromBeat: number; toBeat: number; modes: CameraMode[] };
export type CameraConfig = {
  /** Modes per beat range, in order, not overlapping. Beats outside every range hold (static). */
  segments: CameraSegment[];
  /** 0–1: how strongly the music drives speed and accents. 0 = a plain programmed move. */
  intensity: number;
  /** Orbit speed at mid energy, degrees per beat; the sign picks the direction. */
  orbitDegreesPerBeat: number;
  /** Starting distance from the subject, metres. */
  distance: number;
  /** Starting camera height, metres. */
  height: number;
  /** Vertical field of view at 16:9, degrees (narrower aspects widen to keep the subject). */
  fov: number;
  /** Starting angle around the subject, degrees (0 = in front, on +Z). */
  startYaw: number;
};

export const DEFAULT_CAMERA: CameraConfig = {
  segments: [{ fromBeat: 0, toBeat: 16, modes: ["orbit"] }],
  intensity: 0.6, orbitDegreesPerBeat: 6, distance: 4.4, height: 1.15, fov: 38, startYaw: 0,
};

export function validateCamera(input: unknown, durationBeats: number): CameraConfig {
  if (!isObject(input)) return fail("camera must be an object");
  only(input, ["segments", "intensity", "orbitDegreesPerBeat", "distance", "height", "fov", "startYaw"], "camera");
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 32) fail("camera.segments needs 1–32 ranges");
  let last = -Infinity;
  const segments = (input.segments as unknown[]).map((s, i): CameraSegment => {
    const where = `camera.segments[${i}]`;
    if (!isObject(s)) return fail(`${where} must be an object`);
    only(s, ["fromBeat", "toBeat", "modes"], where);
    const fromBeat = num(s.fromBeat, 0, durationBeats, `${where}.fromBeat`);
    const toBeat = num(s.toBeat, 0, durationBeats, `${where}.toBeat`);
    if (toBeat <= fromBeat) fail(`${where}.toBeat must be after fromBeat`);
    if (fromBeat < last) fail(`${where} overlaps the range before it`);
    last = toBeat;
    if (!Array.isArray(s.modes) || s.modes.length < 1 || s.modes.length > CAMERA_MODES.length) fail(`${where}.modes needs 1–${CAMERA_MODES.length} modes`);
    const modes = s.modes as unknown[];
    for (const m of modes) if (!CAMERA_MODES.includes(m as CameraMode)) fail(`${where}.modes: ${String(m)} is not one of ${CAMERA_MODES.join(", ")}`);
    if (new Set(modes).size !== modes.length) fail(`${where}.modes repeats a mode`);
    if (modes.includes("static") && modes.length > 1) fail(`${where}: static cannot share a range`);
    if (modes.includes("lead") && modes.includes("chase")) fail(`${where}: lead and chase exclude each other`);
    if (modes.includes("pushIn") && modes.includes("pullOut")) fail(`${where}: pushIn and pullOut exclude each other`);
    return { fromBeat, toBeat, modes: [...modes] as CameraMode[] };
  });
  return {
    segments,
    intensity: num(input.intensity, 0, 1, "camera.intensity"),
    orbitDegreesPerBeat: num(input.orbitDegreesPerBeat, -45, 45, "camera.orbitDegreesPerBeat"),
    distance: num(input.distance, 1.5, 12, "camera.distance"),
    height: num(input.height, 0.2, 6, "camera.height"),
    fov: num(input.fov, 15, 80, "camera.fov"),
    startYaw: num(input.startYaw, -360, 360, "camera.startYaw"),
  };
}

/** Modes active at a beat: those of the range that holds it, or static in a gap. */
export function modesAt(config: CameraConfig, beat: number): readonly CameraMode[] {
  for (const s of config.segments) if (beat >= s.fromBeat && beat < s.toBeat) return s.modes;
  return ["static"];
}

/** One range over the whole recipe, or ranges of `barsEach` bars cycling through the modes. */
export function cameraTimeline(modes: CameraMode[], durationBeats: number, opts: { sequence?: boolean; beatsEach?: number } = {}): CameraSegment[] {
  const list = modes.length ? modes : ["static" as const];
  if (!opts.sequence || list.length === 1) return [{ fromBeat: 0, toBeat: durationBeats, modes: [...list] }];
  const each = Math.max(1, opts.beatsEach ?? 8);
  const out: CameraSegment[] = [];
  for (let b = 0, i = 0; b < durationBeats; b += each, i++) out.push({ fromBeat: b, toBeat: Math.min(durationBeats, b + each), modes: [list[i % list.length]] });
  return out;
}
