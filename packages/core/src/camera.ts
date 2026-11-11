/**
 * Camera rig config, stored in the recipe as `camera`. The rig carries the rhythm: a
 * timeline of modes per beat range, with speed and accents driven by the music.
 * Modes:
 * - static: hold;
 * - orbit: continuous yaw around the subject (a carousel), speed scaled by energy;
 * - pushIn / pullOut: dolly towards or away from the subject over the range;
 * - rise: crane up while the aim tilts down;
 * - lead, threeQuarter, side, chase: follow rigs, in front of the subject, at 45°, at its
 *   side or behind it, turning with its heading as it travels;
 * - top: overhead, looking down on the subject (combines with a follow rig or orbit);
 * - fixed: a tripod: the camera stays where it was when the range began and pans to keep
 *   the subject in view;
 * - path: along a drawn path (smoothed spline, a height per point), looking at the
 *   subject; the music sets the speed along it and adds the accents.
 * - truck: sideways, camera and aim together (needs an amount, metres, + to the right).
 * Several modes may share a range ("orbit" + "pushIn"); one follow rig at a time; static,
 * fixed and path stand alone.
 *
 * A range may also carry (all optional, see camera-shots.ts):
 * - `shot`: a framing preset (wide, medium, close, low, top) for distance, height and fov,
 *   eased in over the first beat of the range (`cut`: switch on the range's first frame);
 * - an `amount` in real units, which makes the move a deterministic programmed move that
 *   ignores the energy: orbit degrees (signed), pushIn/pullOut metres, truck metres (signed),
 *   rise metres (signed: jib up or down); or `from`/`to` heights for rise and `to` (end
 *   distance) for pushIn/pullOut;
 * - a beat lock (`lock`, `strength`, lock.ts) with `onHit` hold or punch (`punch` metres).
 */
import { validateLock, type LockTarget } from "./lock";
import { fail, isObject, num, only } from "./validate";

export const CAMERA_MODES = ["static", "orbit", "pushIn", "pullOut", "rise", "lead", "chase", "side", "threeQuarter", "top", "fixed", "path", "truck"] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];
export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  static: "Static", orbit: "Orbit", pushIn: "Push in", pullOut: "Pull out", rise: "Rise and tilt", lead: "Follow from the front", chase: "Follow from behind",
  side: "Follow from the side", threeQuarter: "Follow three-quarter", top: "Top (overhead)", fixed: "Fixed (tripod, pans)", path: "Drawn path",
  truck: "Truck (sideways)",
};
/** Follow rigs: the camera sits at this angle from the subject's heading (0 = in front, π = behind) and turns with it. */
export const FOLLOW_ANGLES: Partial<Record<CameraMode, number>> = { lead: 0, threeQuarter: Math.PI / 4, side: Math.PI / 2, chase: Math.PI };
export const FOLLOW_MODES = Object.keys(FOLLOW_ANGLES) as CameraMode[];
export const SHOTS = ["wide", "medium", "close", "low", "top"] as const;
export type Shot = (typeof SHOTS)[number];
/** Framing presets: distance and height in metres, vertical fov in degrees at 16:9. */
export const SHOT_PRESETS: Record<Shot, { distance: number; height: number; fov: number }> = {
  wide: { distance: 7, height: 1.6, fov: 40 },
  medium: { distance: 4.2, height: 1.35, fov: 35 },
  close: { distance: 2.2, height: 1.45, fov: 28 },
  low: { distance: 3.4, height: 0.35, fov: 42 },
  top: { distance: 1.4, height: 6.5, fov: 45 },
};
/** Modes that take an amount; a range with an amount holds at most one of them. */
export const AMOUNT_MODES = ["orbit", "pushIn", "pullOut", "truck", "rise"] as const;
export const ON_HIT = ["hold", "punch"] as const;
export type OnHit = (typeof ON_HIT)[number];
/** Punch-in depth when none is given, metres. */
export const DEFAULT_PUNCH = 0.4;
export type CameraSegment = {
  fromBeat: number; toBeat: number; modes: CameraMode[];
  shot?: Shot; cut?: boolean;
  amount?: number; from?: number; to?: number;
  lock?: LockTarget; strength?: number; onHit?: OnHit; punch?: number;
};
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
  /** Drawn camera path for the "path" mode: 2–32 points, world metres, y = camera height. */
  path?: { x: number; y: number; z: number }[];
};

export const DEFAULT_CAMERA: CameraConfig = {
  segments: [{ fromBeat: 0, toBeat: 16, modes: ["orbit"] }],
  intensity: 0.6, orbitDegreesPerBeat: 6, distance: 4.4, height: 1.15, fov: 38, startYaw: 0,
};

export function validateCamera(input: unknown, durationBeats: number): CameraConfig {
  if (!isObject(input)) return fail("camera must be an object");
  only(input, ["segments", "intensity", "orbitDegreesPerBeat", "distance", "height", "fov", "startYaw", "path"], "camera");
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 32) fail("camera.segments needs 1–32 ranges");
  let last = -Infinity;
  const segments = (input.segments as unknown[]).map((s, i): CameraSegment => {
    const where = `camera.segments[${i}]`;
    if (!isObject(s)) return fail(`${where} must be an object`);
    only(s, ["fromBeat", "toBeat", "modes", "shot", "cut", "amount", "from", "to", "lock", "strength", "onHit", "punch"], where);
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
    if (modes.includes("path") && modes.length > 1) fail(`${where}: path cannot share a range`);
    if (modes.filter(m => FOLLOW_MODES.includes(m as CameraMode)).length > 1) fail(`${where}: one follow rig at a time (${FOLLOW_MODES.join(", ")})`);
    if (modes.includes("fixed") && modes.length > 1) fail(`${where}: fixed cannot share a range`);
    if (modes.includes("pushIn") && modes.includes("pullOut")) fail(`${where}: pushIn and pullOut exclude each other`);
    const seg: CameraSegment = { fromBeat, toBeat, modes: [...modes] as CameraMode[] };
    validateSegmentExtras(s, where, seg);
    return seg;
  });
  let path: CameraConfig["path"];
  if (input.path !== undefined) {
    if (!Array.isArray(input.path) || input.path.length < 2 || input.path.length > 32) fail("camera.path needs 2–32 points");
    path = (input.path as unknown[]).map((p, i) => {
      if (!isObject(p)) return fail(`camera.path[${i}] must be an object`);
      only(p, ["x", "y", "z"], `camera.path[${i}]`);
      return { x: num(p.x, -100, 100, `camera.path[${i}].x`), y: num(p.y, 0.1, 30, `camera.path[${i}].y`), z: num(p.z, -100, 100, `camera.path[${i}].z`) };
    });
  }
  if (segments.some(s => s.modes.includes("path")) && !path) fail("camera: the path mode needs camera.path");
  const out: CameraConfig = {
    segments,
    intensity: num(input.intensity, 0, 1, "camera.intensity"),
    orbitDegreesPerBeat: num(input.orbitDegreesPerBeat, -45, 45, "camera.orbitDegreesPerBeat"),
    distance: num(input.distance, 1.5, 12, "camera.distance"),
    height: num(input.height, 0.2, 6, "camera.height"),
    fov: num(input.fov, 15, 80, "camera.fov"),
    startYaw: num(input.startYaw, -360, 360, "camera.startYaw"),
  };
  if (path) out.path = path;
  return out;
}

/** The optional shot, amount and lock fields of a range. */
function validateSegmentExtras(s: Record<string, unknown>, where: string, seg: CameraSegment) {
  if (s.shot !== undefined) {
    if (!SHOTS.includes(s.shot as Shot)) fail(`${where}.shot must be one of ${SHOTS.join(", ")}`);
    seg.shot = s.shot as Shot;
  }
  if (s.cut !== undefined) { if (typeof s.cut !== "boolean") fail(`${where}.cut must be true or false`); if (s.cut) seg.cut = true; }
  const movers = seg.modes.filter(m => (AMOUNT_MODES as readonly string[]).includes(m));
  const programmed = s.amount !== undefined || s.from !== undefined || s.to !== undefined;
  if (programmed && movers.length !== 1) fail(`${where}: an amount needs exactly one of ${AMOUNT_MODES.join(", ")} in the range (give each move its own range)`);
  const mover = movers[0];
  if (s.amount !== undefined) {
    const lim = mover === "orbit" ? [-1440, 1440] : mover === "truck" ? [-20, 20] : mover === "rise" ? [-10, 10] : [0, 20];
    seg.amount = num(s.amount, lim[0], lim[1], `${where}.amount (${mover})`);
  }
  if (s.from !== undefined) { if (mover !== "rise") fail(`${where}.from is a start height, for rise only`); seg.from = num(s.from, 0.05, 30, `${where}.from`); }
  if (s.to !== undefined) {
    if (mover !== "rise" && mover !== "pushIn" && mover !== "pullOut") fail(`${where}.to is an end height (rise) or end distance (pushIn, pullOut)`);
    seg.to = num(s.to, mover === "rise" ? 0.05 : 0.5, 30, `${where}.to`);
  }
  if (seg.amount !== undefined && seg.to !== undefined) fail(`${where}: give an amount or an end value (to), not both`);
  if (seg.modes.includes("truck") && seg.amount === undefined) fail(`${where}: truck needs an amount in metres (+ right, - left)`);
  validateLock(s, where, seg);
  if (s.onHit !== undefined) {
    if (!ON_HIT.includes(s.onHit as OnHit)) fail(`${where}.onHit must be hold or punch`);
    if (seg.lock) seg.onHit = s.onHit as OnHit;
  }
  if (s.punch !== undefined) { const p = num(s.punch, 0, 3, `${where}.punch`); if (seg.lock) seg.punch = p; }
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
