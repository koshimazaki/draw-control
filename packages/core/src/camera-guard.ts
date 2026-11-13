/**
 * The framing guard (camera.keepInFrame, on for Beat Path): the camera never loses the
 * subject. The rig aims at a smoothed, acceleration-limited follow point; when the subject
 * turns or speeds up faster than that point can follow, or a drawn camera path wanders
 * away, the subject can drift to the frame's edge or out of it. The guard measures where
 * the subject's centre lands in the 16:9 frame on every frame and, only where it nears the
 * edge, turns the aim towards the subject (a weight that rises smoothly over a few frames
 * before it is needed and falls after), so normal motion is untouched. A last pass aims
 * straight at the subject on any frame still outside the margin. Pure and deterministic.
 */
import type { CameraSample, Vec3 } from "./camera-rig";

/** Where the guard starts to act and where it holds the aim fully on the subject (fraction of the half-frame). */
export const GUARD = { soft: 0.5, firm: 0.72, hard: 0.82, reach: 8 } as const;

/** The larger of |x| and |y| of a point in a camera's 16:9 frame (Infinity behind the camera). */
export function frameOffset(s: { position: Vec3; target: Vec3; fov: number }, p: Vec3): number {
  const f = [s.target[0] - s.position[0], s.target[1] - s.position[1], s.target[2] - s.position[2]], fl = Math.hypot(f[0], f[1], f[2]) || 1;
  const fw = [f[0] / fl, f[1] / fl, f[2] / fl];
  const r = [-fw[2], 0, fw[0]], rl = Math.hypot(r[0], r[2]) || 1, rt = [r[0] / rl, 0, r[2] / rl];
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const rel = [p[0] - s.position[0], p[1] - s.position[1], p[2] - s.position[2]];
  const z = rel[0] * fw[0] + rel[1] * fw[1] + rel[2] * fw[2];
  if (z <= 0.05) return Infinity;
  const ty = Math.tan(s.fov * Math.PI / 360), tx = ty * 16 / 9;
  return Math.max(Math.abs((rel[0] * rt[0] + rel[2] * rt[2]) / (z * tx)), Math.abs((rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2]) / (z * ty)));
}

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/** Turn the aim of `samples` towards `subject` (the subject's centre per frame) wherever it nears the edge. */
export function guardFraming(samples: CameraSample[], subject: Vec3[]): number {
  const n = Math.min(samples.length, subject.length), raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = smooth((frameOffset(samples[i], subject[i]) - GUARD.soft) / (GUARD.firm - GUARD.soft));
  // Rise before it is needed, fall after: a running maximum, then a running mean, over `reach` frames each side.
  const R = GUARD.reach, peak = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) m = Math.max(m, raw[k]); peak[i] = m; }
  for (let i = 0; i < n; i++) { let sum = 0, c = 0; for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) { sum += peak[k]; c++; } w[i] = smooth(sum / c); }
  let acted = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i], p = subject[i];
    if (w[i] > 0) { acted++; s.target = [s.target[0] + (p[0] - s.target[0]) * w[i], s.target[1] + (p[1] - s.target[1]) * w[i], s.target[2] + (p[2] - s.target[2]) * w[i]]; }
    if (frameOffset(s, p) > GUARD.hard) s.target = [p[0], p[1], p[2]];
  }
  return acted;
}
