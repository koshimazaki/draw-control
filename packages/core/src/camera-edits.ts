/**
 * Camera and floor-path edits, shared by the studio and agents:
 * - camera rig settings (distance, height, fov, intensity, orbit speed) and modes per range;
 * - "start camera move X on kick/snare N": a camera range that begins on an onset;
 * - the camera path drawn in the top view;
 * - the root path: a floor path the character travels over a range of beats, drawn freehand,
 *   smoothed into a spline and resampled evenly so the speed along it is steady, with the
 *   facing turned along the path (or held, for a glide), and its travel lock.
 * Every edit is pure and returns a fresh validated recipe.
 */
import { CAMERA_MODES, DEFAULT_CAMERA, type CameraConfig, type CameraMode, type CameraSegment } from "./camera";
import type { BandAnalysis } from "./audio-bands";
import { onsetBeats, makeMoveFor } from "./move-edits";
import { RecipeError, SPEED_RANGE, validateRecipe, type Recipe, type RootPoint } from "./recipe";
import { buildSpline } from "./spline";
import { LOOP_CLIPS, loopCycleBeats } from "./clip-library";
import type { LockTarget } from "./lock";
import { sampleRootPath } from "./root-travel";

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clone = (r: Recipe): Recipe => structuredClone(r);
const cameraOf = (r: Recipe): CameraConfig => structuredClone(r.camera ?? { ...DEFAULT_CAMERA, segments: [{ fromBeat: 0, toBeat: r.durationBeats, modes: ["static"] }] });

function checkModes(modes: unknown): CameraMode[] {
  const list = (Array.isArray(modes) ? modes : [modes]) as unknown[];
  if (!list.length || list.some(m => !CAMERA_MODES.includes(m as CameraMode))) throw new RecipeError(`camera modes must be from ${CAMERA_MODES.join(", ")}`);
  return list as CameraMode[];
}

/** Camera rig numbers; any left out keep their value. A recipe without a rig gets one (static). */
export function setCamera(recipe: Recipe, args: Partial<Pick<CameraConfig, "distance" | "height" | "fov" | "intensity" | "orbitDegreesPerBeat" | "startYaw">>): Recipe {
  const cam = cameraOf(recipe);
  for (const k of ["distance", "height", "fov", "intensity", "orbitDegreesPerBeat", "startYaw"] as const) if (args[k] !== undefined) cam[k] = args[k]!;
  return validateRecipe({ ...clone(recipe), camera: cam });
}

/**
 * Put camera modes on a beat range, cutting the ranges it overlaps (the parts outside it
 * stay). Without a range it covers the whole recipe.
 */
export function setCameraModes(recipe: Recipe, args: { modes: CameraMode[] | CameraMode; fromBeat?: number; toBeat?: number }): Recipe {
  const modes = checkModes(args.modes);
  const from = r3(Math.max(0, args.fromBeat ?? 0)), to = r3(Math.min(recipe.durationBeats, args.toBeat ?? recipe.durationBeats));
  if (!(to > from)) throw new RecipeError("setCameraModes: toBeat must be after fromBeat");
  const cam = cameraOf(recipe);
  const kept: CameraSegment[] = [];
  for (const s of cam.segments) {
    if (s.toBeat <= from || s.fromBeat >= to) { kept.push(s); continue; }
    if (s.fromBeat < from) kept.push({ ...s, toBeat: from });
    if (s.toBeat > to) kept.push({ ...s, fromBeat: to });
  }
  kept.push({ fromBeat: from, toBeat: to, modes });
  cam.segments = kept.sort((a, b) => a.fromBeat - b.fromBeat).slice(0, 32);
  return validateRecipe({ ...clone(recipe), camera: cam });
}

/** Start camera move X on the Nth kick or snare (0-based; or a beat), for `lengthBeats` (default: until the next range or 8 beats). */
export function startCameraMove(recipe: Recipe, args: { modes: CameraMode[] | CameraMode; target: string; index?: number; lengthBeats?: number }, bands?: BandAnalysis): Recipe {
  let at: number;
  if (args.target === "beat") at = args.index ?? 0;
  else {
    const list = onsetBeats(recipe, bands, args.target);
    const i = args.index ?? 0;
    if (!list.length) throw new RecipeError(`startCameraMove: no ${args.target} onsets (analyse a track first)`);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new RecipeError(`startCameraMove: index must be 0–${list.length - 1}`);
    at = list[i];
  }
  const len = args.lengthBeats ?? 8;
  return setCameraModes(recipe, { modes: args.modes, fromBeat: at, toBeat: Math.min(recipe.durationBeats, at + len) });
}

/** The camera path (top view), 2–32 points; y is the camera height (default: the rig height). Uses the path mode over the whole recipe unless `useMode` is false. */
export function setCameraPath(recipe: Recipe, args: { points: { x: number; z: number; y?: number }[]; useMode?: boolean }): Recipe {
  const cam = cameraOf(recipe);
  if (!Array.isArray(args.points) || args.points.length < 2 || args.points.length > 4096) throw new RecipeError("setCameraPath: points needs 2–4096 { x, z, y? } points");
  // Up to 12 points are kept as given (with their heights); a longer stroke is thinned evenly at the rig height.
  cam.path = args.points.length <= 12
    ? args.points.map(p => ({ x: r3(p.x), y: r3(p.y ?? cam.height), z: r3(p.z) }))
    : resample(args.points, 12).map(p => ({ x: r3(p.x), y: r3(cam.height), z: r3(p.z) }));
  if (args.useMode !== false) cam.segments = [{ fromBeat: 0, toBeat: recipe.durationBeats, modes: ["path"] }];
  return validateRecipe({ ...clone(recipe), camera: cam });
}

export function clearCameraPath(recipe: Recipe): Recipe {
  if (!recipe.camera?.path) return recipe;
  const cam = cameraOf(recipe);
  delete cam.path;
  cam.segments = cam.segments.map(s => (s.modes.includes("path") ? { ...s, modes: ["orbit"] } : s));
  return validateRecipe({ ...clone(recipe), camera: cam });
}

/** `count` points evenly spaced by arc length (on the floor) along a polyline; a height `y` is carried along. */
export function resample<P extends { x: number; z: number; y?: number }>(points: P[], count: number): { x: number; z: number; y?: number }[] {
  if (points.length < 2) return points.map(p => ({ ...p }));
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = cum[cum.length - 1] || 1;
  const hasY = points.some(p => p.y !== undefined);
  return Array.from({ length: count }, (_, k) => {
    const t = total * k / (count - 1);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = points[i - 1], b = points[i];
    const q: { x: number; z: number; y?: number } = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    if (hasY) q.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f;
    return q;
  });
}

/** Gaits that need no clip: the figure slides along the path holding its pose or its move. */
export const GLIDE = "glide";

/**
 * Playback speed for a rigged gait so its steps cover the path's speed (less foot slide):
 * one cycle of the clip travels `travel * seconds` metres as authored; it plays on the beat
 * grid at `loopCycleBeats`, so the speed that matches `metresPerSecond` follows from both.
 */
export function gaitSpeedFor(name: string, metresPerSecond: number, bpm: number): number | undefined {
  const lib = LOOP_CLIPS[name];
  if (!lib?.travel || metresPerSecond <= 0) return undefined;
  const cycleSeconds = loopCycleBeats(lib, bpm, 1) * 60 / bpm;
  const speed = metresPerSecond * cycleSeconds / (lib.travel * lib.seconds);
  return Math.round(Math.max(SPEED_RANGE[0], Math.min(SPEED_RANGE[1], speed)) * 1000) / 1000;
}

/**
 * The character travels a drawn floor path from `fromBeat` to `toBeat` at a steady speed:
 * the stroke is thinned to 12 control points, smoothed (centripetal Catmull-Rom), and
 * resampled into up to 48 root points. Before the range it stands at the start, after it at
 * the end. `gait`:
 * - a walk or run (Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, or walk/run on the procedural
 *   figures) adds a move block over the range, facing along the path; a rigged gait plays
 *   at the speed that matches the path's speed, so the feet slide less (no foot locking);
 * - "glide" adds no block: the figure slides along the path (sideways, backwards, and up
 *   where points carry a height `y`) holding its pose or whatever move is on the Action
 *   track, facing the way it faced at the start (`face: "path"` turns it along the path).
 * `lock` and `strength` set the travel lock (stations on each locked hit, root-travel.ts).
 */
export function setRootPath(recipe: Recipe, args: { points: { x: number; z: number; y?: number }[]; fromBeat?: number; toBeat?: number; gait?: string; face?: "path" | "hold"; lock?: string; strength?: number }): Recipe {
  if (!Array.isArray(args.points) || args.points.length < 2 || args.points.length > 4096) throw new RecipeError("setRootPath: points needs 2–4096 { x, z, y? } points");
  for (const p of args.points) if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z) || Math.abs(p.x) > 100 || Math.abs(p.z) > 100 || (p.y !== undefined && !(p.y >= 0 && p.y <= 30))) throw new RecipeError("setRootPath: each point needs x and z within ±100 m (and y, if given, 0–30 m)");
  const from = Math.max(0, args.fromBeat ?? 0), to = Math.min(recipe.durationBeats, args.toBeat ?? recipe.durationBeats);
  if (!(to > from)) throw new RecipeError("setRootPath: toBeat must be after fromBeat");
  const glide = args.gait === GLIDE;
  const face = args.face ?? (glide ? "hold" : "path");
  const control = resample(args.points, Math.min(12, args.points.length));
  const hasY = control.some(p => p.y);
  const spline = buildSpline(control.map(p => ({ x: p.x, y: p.y ?? 0, z: p.z })));
  const n = Math.max(2, Math.min(from > 0 ? 47 : 48, Math.round(spline.length * 4) + 2));
  const startYaw = sampleRootPath(recipe.rootPath, from).yaw;
  const pts: RootPoint[] = [];
  let lastYaw: number | null = null;
  for (let k = 0; k < n; k++) {
    const s = k / (n - 1), [x, y, z] = spline.at(s), [x2, , z2] = spline.at(Math.min(1, s + 0.01)), [x0, , z0] = spline.at(Math.max(0, s - 0.01));
    let heading = face === "hold" ? startYaw : Math.atan2(x2 - x0, z2 - z0) * 180 / Math.PI;
    if (lastYaw !== null) heading += 360 * Math.round((lastYaw - heading) / 360);   // unwrap: no spin on a ±180° crossing
    const yaw = Math.max(-720, Math.min(720, heading));
    lastYaw = yaw;
    const point: RootPoint = { beat: r3(from + (to - from) * s), x: r3(x), z: r3(z), yaw: r3(yaw) };
    if (hasY && r3(y) > 0) point.y = r3(Math.min(30, Math.max(0, y)));
    pts.push(point);
  }
  const rootPath = from > 0 ? [{ ...pts[0], beat: 0 }, ...pts] : pts;
  let next: Recipe = { ...clone(recipe), rootPath };
  if (args.gait && !glide) {
    const m = makeMoveFor(next, args.gait, from);
    m.id = `${m.id}-path`;
    m.lengthBeats = r3(to - from);
    const sp = gaitSpeedFor(args.gait, spline.length / ((to - from) * 60 / recipe.beatGrid.bpm), recipe.beatGrid.bpm);
    if (sp !== undefined && sp !== 1) m.speed = sp;
    next.moves = [...next.moves.filter(x => x.atBeat < from - 1e-6 || x.atBeat >= to), m].sort((a, b) => a.atBeat - b.atBeat);
  }
  if (args.lock !== undefined) {
    if (args.lock === "off") delete next.travelLock;
    else next.travelLock = { lock: args.lock as LockTarget, ...(args.strength !== undefined ? { strength: args.strength } : {}) };
  }
  next = validateRecipe(next);
  return next;
}

/** Lock the travel along the walk path to the beat, kicks, snares or hats (`off` clears it). */
export function setTravelLock(recipe: Recipe, args: { lock: string; strength?: number }): Recipe {
  const next = clone(recipe);
  if (args.lock === "off") delete next.travelLock;
  else next.travelLock = { lock: args.lock as LockTarget, ...(args.strength !== undefined ? { strength: args.strength } : {}) };
  return validateRecipe(next);
}

/** Back to standing at the origin, facing the front camera. */
export function clearRootPath(recipe: Recipe): Recipe {
  return validateRecipe({ ...clone(recipe), rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }] });
}
