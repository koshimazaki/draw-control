/**
 * Corner rounding for a path given point by point, like corner rounding in a vector tool:
 * `corners` 0 keeps the points joined by straight segments (the figure or the camera turns
 * hard at each point); 1 rounds every corner as far as it can go, so neighbouring rounds
 * meet half way along each segment and the path is one smooth curve. In between, each
 * corner is cut back by `corners` × half its shorter segment and replaced by a quadratic
 * curve (tangent to both segments). Heights (`y`) are carried along. Pure; no dependencies.
 */
import type { Spline } from "./spline";

type P = { x: number; z: number; y?: number };
/** Most points `cornerPath` returns (setRootPath takes up to 63 given points). */
export const CORNER_PATH_MAX = 63;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: P, b: P, t: number, hasY: boolean): P => {
  const p: P = { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
  if (hasY) p.y = lerp(a.y ?? 0, b.y ?? 0, t);
  return p;
};

/** The path with its corners rounded by `corners` (0–1): a polyline of at most CORNER_PATH_MAX points. */
export function cornerPath<T extends P>(points: readonly T[], corners: number): P[] {
  const c = Math.max(0, Math.min(1, corners)), n = points.length;
  const hasY = points.some(p => p.y !== undefined);
  const copy = (p: P): P => (hasY ? { x: p.x, z: p.z, y: p.y ?? 0 } : { x: p.x, z: p.z });
  if (n < 3 || c <= 0) return points.map(copy);
  // Samples per corner, so the whole path fits.
  const per = Math.max(2, Math.min(8, Math.floor((CORNER_PATH_MAX - 2) / (n - 2))));
  const out: P[] = [copy(points[0])];
  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1], b = points[i], d = points[i + 1];
    const inLen = Math.hypot(b.x - a.x, b.z - a.z), outLen = Math.hypot(d.x - b.x, d.z - b.z);
    const cut = c * 0.5 * Math.min(inLen, outLen);
    if (cut < 1e-6) { out.push(copy(b)); continue; }
    const p0 = mix(b, a, cut / inLen, hasY), p2 = mix(b, d, cut / outLen, hasY);
    for (let k = 0; k < per; k++) {
      const t = k / (per - 1);
      out.push(mix(mix(p0, b, t, hasY), mix(b, p2, t, hasY), t, hasY));
    }
  }
  out.push(copy(points[n - 1]));
  // Drop points that coincide (a full round meets its neighbour at the segment's middle).
  return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z, (p.y ?? 0) - (out[i - 1].y ?? 0)) > 1e-4);
}

/** A polyline with the spline's interface: straight between its points, parameterised by arc length. */
export function polylineSpline(points: readonly { x: number; y: number; z: number }[]): Spline {
  const P = points.map(p => [p.x, p.y, p.z] as [number, number, number]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
  const length = cum[cum.length - 1];
  return {
    length,
    at(s: number) {
      if (P.length === 1 || length <= 0) return P[0];
      const target = Math.max(0, Math.min(1, s)) * length;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < target) i++;
      const t = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = P[i - 1], b = P[i];
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    },
  };
}
