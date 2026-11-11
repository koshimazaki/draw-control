/**
 * Automation lanes: one value per frame, stored as `[frame, value]` breakpoints with straight
 * lines between them (the amplitude envelope's shape, envelope.ts). Lanes:
 * - `amplitude`: the amplitude envelope (recipe `envelope`), 0–3, 1 everywhere without points;
 * - `distance`, `height`, `fov`: camera rig parameters (recipe `camera.lanes`), in metres and
 *   degrees. Where a lane has points (from its first to its last) it overrides the rig's value
 *   for that parameter: the shot, the amount, the energy drive and the beat accents. Outside
 *   that span the rig runs as usual;
 * - `yaw`: an offset in degrees added to the camera's angle around the subject, held at its
 *   first and last value outside its span (so it never jumps).
 */
import { fail, isObject, only } from "./validate";

export const ENVELOPE_LANES = ["amplitude", "distance", "height", "yaw", "fov"] as const;
export type EnvelopeLane = (typeof ENVELOPE_LANES)[number];
export const CAMERA_LANES = ["distance", "height", "yaw", "fov"] as const;
export type CameraLane = (typeof CAMERA_LANES)[number];
export type EnvelopePoint = [frame: number, value: number];
export type Envelope = { points: EnvelopePoint[] };
export type LaneSpec = { min: number; max: number; tolerance: number; unit: string; label: string; /** Value shown where the lane has no points. */ rest?: number };
export const LANE_SPECS: Record<EnvelopeLane, LaneSpec> = {
  amplitude: { min: 0, max: 3, tolerance: 0.01, unit: "", label: "amplitude envelope 0–3", rest: 1 },
  distance: { min: 0.3, max: 30, tolerance: 0.01, unit: "m", label: "camera distance m" },
  height: { min: 0.05, max: 30, tolerance: 0.01, unit: "m", label: "camera height m" },
  yaw: { min: -720, max: 720, tolerance: 0.1, unit: "°", label: "camera yaw offset °", rest: 0 },
  fov: { min: 10, max: 100, tolerance: 0.05, unit: "°", label: "camera fov °" },
};
export const ENVELOPE_MAX_POINTS = 8192;
export const isCameraLane = (x: unknown): x is CameraLane => CAMERA_LANES.includes(x as CameraLane);

/** Validate breakpoints for a lane (whole frames, increasing; values inside the lane's range). */
export function validateLanePoints(input: unknown, where: string, spec: LaneSpec): Envelope {
  if (!isObject(input)) return fail(`${where} must be an object`);
  only(input, ["points"], where);
  const pts = input.points;
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > ENVELOPE_MAX_POINTS) return fail(`${where}.points needs 1–${ENVELOPE_MAX_POINTS} [frame, value] pairs`);
  let last = -1;
  return {
    points: pts.map((p, i): EnvelopePoint => {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || p[0] < 0 || p[0] > 200000 || typeof p[1] !== "number" || !Number.isFinite(p[1]) || p[1] < spec.min || p[1] > spec.max)
        fail(`${where}.points[${i}] must be [whole frame, value ${spec.min}–${spec.max}]`);
      if (p[0] <= last) fail(`${where}.points[${i}] must come after the point before it`);
      last = p[0];
      return [p[0], p[1]];
    }),
  };
}

/** The camera lanes of a rig (`camera.lanes`). */
export function validateCameraLanes(input: unknown): Partial<Record<CameraLane, Envelope>> {
  if (!isObject(input)) return fail("camera.lanes must be an object");
  only(input, CAMERA_LANES, "camera.lanes");
  const out: Partial<Record<CameraLane, Envelope>> = {};
  for (const k of CAMERA_LANES) if (input[k] !== undefined) out[k] = validateLanePoints(input[k], `camera.lanes.${k}`, LANE_SPECS[k]);
  return out;
}

/** A lane at a (fractional) frame; held flat before the first and after the last point; `rest` without points. */
export function laneAt(env: Envelope | undefined, frame: number, rest = 1): number {
  const p = env?.points;
  if (!p?.length) return rest;
  if (frame <= p[0][0]) return p[0][1];
  if (frame >= p[p.length - 1][0]) return p[p.length - 1][1];
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] <= frame) lo = mid; else hi = mid; }
  const [f0, v0] = p[lo], [f1, v1] = p[hi];
  return v0 + (v1 - v0) * (frame - f0) / (f1 - f0);
}

/** Whether a frame lies inside a lane's points (from the first to the last). */
export const inLane = (env: Envelope | undefined, frame: number) => !!env?.points.length && frame >= env.points[0][0] && frame <= env.points[env.points.length - 1][0];
