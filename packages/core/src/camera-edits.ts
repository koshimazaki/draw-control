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
import { CAMERA_MODES, CAMERA_SEGMENTS_MAX, DEFAULT_CAMERA, type CameraConfig, type CameraMode, type CameraSegment } from "./camera";
import { rangeStarts } from "./camera-shots";
import type { BandAnalysis } from "./audio-bands";
import { onsetBeats, makeMoveFor } from "./move-edits";
import { RecipeError, SPEED_RANGE, validateRecipe, type Recipe, type RootPoint } from "./recipe";
import { buildSpline } from "./spline";
import { LOOP_CLIPS, loopCycleBeats } from "./clip-library";
import type { LockTarget } from "./lock";
import { sampleRootPath } from "./root-travel";
import { cornerPath } from "./corners";

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
 * stay). Without a range it covers the whole recipe. `fields` gives the new range its shot,
 * amount and lock (camera.ts).
 */
export function setCameraModes(recipe: Recipe, args: { modes: CameraMode[] | CameraMode; fromBeat?: number; toBeat?: number; fields?: Omit<Partial<CameraSegment>, "fromBeat" | "toBeat" | "modes"> }): Recipe {
  const modes = checkModes(args.modes);
  const from = r3(Math.max(0, args.fromBeat ?? 0)), to = r3(Math.min(recipe.durationBeats, args.toBeat ?? recipe.durationBeats));
  if (!(to > from)) throw new RecipeError("setCameraModes: toBeat must be after fromBeat");
  const cam = cameraOf(recipe), starts = rangeStarts(cam);
  const kept: CameraSegment[] = [];
  cam.segments.forEach((s, i) => {
    if (s.toBeat <= from || s.fromBeat >= to) { kept.push(s); return; }
    if (s.fromBeat < from) kept.push(pieceOf(s, starts[i], s.fromBeat, from));
    if (s.toBeat > to) kept.push(pieceOf(s, starts[i], to, s.toBeat));
  });
  kept.push({ ...(args.fields ?? {}), fromBeat: from, toBeat: to, modes });
  if (kept.length > CAMERA_SEGMENTS_MAX) throw new RecipeError(`setCameraModes: the camera holds up to ${CAMERA_SEGMENTS_MAX} ranges, and this edit would make ${kept.length} (use fewer, longer ranges)`);
  cam.segments = kept.sort((a, b) => a.fromBeat - b.fromBeat);
  return validateRecipe({ ...clone(recipe), camera: cam });
}

/**
 * The part of range `s` over beats a–b, when an edit cuts into it, performing the share of
 * the range's programmed move that falls in those beats (camera-shots.ts reads the fields):
 * - `amount` (orbit degrees, pushIn/pullOut/rise/truck metres) is relative, so each part gets
 *   the amount times its share of the range's beats: the parts add up to what is kept;
 * - `to` (pushIn/pullOut end distance, rise end height) is absolute: the part that ends where
 *   the range ended keeps it; a part ending earlier gets the value the range passed through
 *   there, on a straight line from the value it started at (`start`) to `to`;
 * - `from` (rise start height) is absolute too: a rise with from and to is the height path
 *   from → to, so each part runs from and to the heights at its own edges (from alone holds
 *   that height, and stays as it is).
 * Each part eases over its own beats, so the motion pauses at a cut; the totals are exact.
 */
function pieceOf(s: CameraSegment, start: { distance: number; height: number }, a: number, b: number): CameraSegment {
  const len = s.toBeat - s.fromBeat, u = (x: number) => (x - s.fromBeat) / len;
  const out: CameraSegment = { ...s, fromBeat: a, toBeat: b };
  if (s.amount !== undefined) out.amount = r3(s.amount * (b - a) / len);
  const clampTo = (x: number) => r3(Math.max(s.modes.includes("rise") ? 0.05 : 0.5, Math.min(30, x)));
  if (s.modes.includes("rise") && s.from !== undefined) {
    if (s.to !== undefined) { out.from = clampTo(s.from + (s.to - s.from) * u(a)); out.to = clampTo(s.from + (s.to - s.from) * u(b)); }
  } else if (s.to !== undefined && b < s.toBeat) {
    const v0 = s.modes.includes("rise") ? start.height : start.distance;
    out.to = clampTo(v0 + (s.to - v0) * u(b));
  }
  return out;
}

/** Start camera move X on the Nth kick or snare (0-based; or a beat), for `lengthBeats` (default: until the next range or 8 beats). */
export function startCameraMove(recipe: Recipe, args: { modes: CameraMode[] | CameraMode; target: string; index?: number; lengthBeats?: number; fields?: Omit<Partial<CameraSegment>, "fromBeat" | "toBeat" | "modes"> }, bands?: BandAnalysis): Recipe {
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
  return setCameraModes(recipe, { modes: args.modes, fromBeat: at, toBeat: Math.min(recipe.durationBeats, at + len), fields: args.fields });
}

/** The camera path (top view), 2–32 points; y is the camera height (default: the rig height). Uses the path mode over the whole recipe unless `useMode` is false. */
export function setCameraPath(recipe: Recipe, args: { points: { x: number; z: number; y?: number }[]; useMode?: boolean; corners?: number }): Recipe {
  const cam = cameraOf(recipe);
  if (!Array.isArray(args.points) || args.points.length < 2 || args.points.length > 4096) throw new RecipeError("setCameraPath: points needs 2–4096 { x, z, y? } points");
  // Up to 12 points are kept as given (with their heights); a longer stroke is thinned evenly at the rig height.
  cam.path = args.points.length <= 12
    ? args.points.map(p => ({ x: r3(p.x), y: r3(p.y ?? cam.height), z: r3(p.z) }))
    : resample(args.points, 12).map(p => ({ x: r3(p.x), y: r3(cam.height), z: r3(p.z) }));
  if (args.useMode !== false) cam.segments = [{ fromBeat: 0, toBeat: recipe.durationBeats, modes: ["path"] }];
  // Corner rounding (corners.ts): given, the camera follows the rounded polyline; absent, the smooth spline.
  if (args.corners !== undefined) cam.corners = args.corners; else delete cam.corners;
  return validateRecipe({ ...clone(recipe), camera: cam });
}

export function clearCameraPath(recipe: Recipe): Recipe {
  if (!recipe.camera?.path) return recipe;
  const cam = cameraOf(recipe);
  delete cam.path;
  delete cam.corners;
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
 * `smooth: false` keeps the points as given (up to 63, straight between them, spaced in time
 * by distance): the shot script's `on path (x,z) (x,z,y) …` uses it, so a script reads back
 * with the same points.
 */
export function setRootPath(recipe: Recipe, args: { points: { x: number; z: number; y?: number }[]; fromBeat?: number; toBeat?: number; gait?: string; face?: "path" | "hold"; lock?: string; strength?: number; smooth?: boolean; corners?: number }): Recipe {
  if (!Array.isArray(args.points) || args.points.length < 2 || args.points.length > 4096) throw new RecipeError("setRootPath: points needs 2–4096 { x, z, y? } points");
  for (const p of args.points) if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z) || Math.abs(p.x) > 100 || Math.abs(p.z) > 100 || (p.y !== undefined && !(p.y >= 0 && p.y <= 30))) throw new RecipeError("setRootPath: each point needs x and z within ±100 m (and y, if given, 0–30 m)");
  const from = Math.max(0, args.fromBeat ?? 0), to = Math.min(recipe.durationBeats, args.toBeat ?? recipe.durationBeats);
  if (!(to > from)) throw new RecipeError("setRootPath: toBeat must be after fromBeat");
  const glide = args.gait === GLIDE;
  const face = args.face ?? (glide ? "hold" : "path");
  const startYaw = sampleRootPath(recipe.rootPath, from).yaw;
  // Corner rounding (corners.ts): the points as given, their corners rounded, straight between the results.
  const shaped = args.corners !== undefined;
  if (shaped && !(args.corners! >= 0 && args.corners! <= 1)) throw new RecipeError("setRootPath: corners must be 0–1");
  if (shaped && args.points.length > 63) throw new RecipeError("setRootPath: a path with corners takes up to 63 points");
  const given = shaped ? hardTurns(cornerPath(args.points, args.corners!), from > 0 ? 63 : 64) : args.points;
  const smooth = !shaped && args.smooth !== false;
  if (!smooth && given.length > (from > 0 ? 63 : 64)) throw new RecipeError("setRootPath: a path given point by point (smooth false) takes up to 63 points");
  // Smooth: a spline through up to 12 control points, resampled evenly. Point by point: the points as given, straight between them.
  const control = smooth ? resample(args.points, Math.min(12, args.points.length)) : given;
  const hasY = control.some(p => p.y);
  const spline = buildSpline(control.map(p => ({ x: p.x, y: p.y ?? 0, z: p.z })));
  const cum = [0];
  for (let i = 1; i < control.length; i++) cum.push(cum[i - 1] + Math.hypot(control[i].x - control[i - 1].x, control[i].z - control[i - 1].z, (control[i].y ?? 0) - (control[i - 1].y ?? 0)));
  const total = cum[cum.length - 1] || 1, length = smooth ? spline.length : total;
  const n = smooth ? Math.max(2, Math.min(from > 0 ? 47 : 48, Math.round(spline.length * 4) + 2)) : control.length;
  const sample = (k: number): { s: number; p: [number, number, number]; dir: [number, number] } => {
    if (smooth) {
      const s = k / (n - 1), [x2, , z2] = spline.at(Math.min(1, s + 0.01)), [x0, , z0] = spline.at(Math.max(0, s - 0.01));
      return { s, p: spline.at(s), dir: [x2 - x0, z2 - z0] };
    }
    const a = control[Math.max(0, k - (k === n - 1 ? 1 : 0))], b = control[Math.min(n - 1, k + (k === n - 1 ? 0 : 1))];
    return { s: cum[k] / total, p: [control[k].x, control[k].y ?? 0, control[k].z], dir: [b.x - a.x, b.z - a.z] };
  };
  const pts: RootPoint[] = [];
  let lastYaw: number | null = null;
  for (let k = 0; k < n; k++) {
    const { s, p: [x, y, z], dir } = sample(k);
    let heading = face === "hold" || (dir[0] === 0 && dir[1] === 0) ? (lastYaw ?? startYaw) : Math.atan2(dir[0], dir[1]) * 180 / Math.PI;
    if (lastYaw !== null) heading += 360 * Math.round((lastYaw - heading) / 360);   // unwrap: no spin on a ±180° crossing
    const yaw = Math.max(-720, Math.min(720, heading));
    lastYaw = yaw;
    const point: RootPoint = { beat: r3(from + (to - from) * s), x: r3(x), z: r3(z), yaw: r3(yaw) };
    if (hasY && r3(y) > 0) point.y = r3(Math.min(30, Math.max(0, y)));
    pts.push(point);
  }
  const rootPath = from > 0 ? [{ ...pts[0], beat: 0 }, ...pts] : pts;
  let next: Recipe = { ...clone(recipe), rootPath };
  if (shaped) next.rootShape = { corners: args.corners!, points: args.points.map(p => ({ x: r3(p.x), z: r3(p.z), ...(p.y !== undefined ? { y: r3(p.y) } : {}) })) };
  else delete next.rootShape;
  if (args.gait && !glide) {
    const m = makeMoveFor(next, args.gait, from);
    m.id = `${m.id}-path`;
    m.lengthBeats = r3(to - from);
    const sp = gaitSpeedFor(args.gait, length / ((to - from) * 60 / recipe.beatGrid.bpm), recipe.beatGrid.bpm);
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

/**
 * A sharp corner turns the facing at the corner, not across the segment before it: a point
 * 3 cm before each corner that turns more than 20° carries the incoming heading (facing
 * is linear between points). Skipped when the path would pass `max` points.
 */
function hardTurns<P extends { x: number; z: number; y?: number }>(pts: P[], max: number): P[] {
  const out: P[] = [pts[0]];
  let room = max - pts.length;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (c && room > 0 && len > 0.09) {
      const turn = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
      if (turn > 20 * Math.PI / 180) {
        const k = 1 - 0.03 / len;
        const q = { ...b, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k } as P;
        if (b.y !== undefined || a.y !== undefined) q.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * k;
        out.push(q); room--;
      }
    }
    out.push(b);
  }
  return out;
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
  const next = clone(recipe);
  delete next.rootShape;
  return validateRecipe({ ...next, rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }] });
}
