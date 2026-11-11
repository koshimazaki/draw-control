/**
 * A smooth camera path through drawn points: centripetal Catmull-Rom (no cusps or loops
 * between close points), re-parameterised by arc length so equal steps in `s` move the
 * camera equal distances.
 */
export type PathPoint = { x: number; y: number; z: number };
type V = [number, number, number];

function catmull(p0: V, p1: V, p2: V, p3: V, t: number): V {
  const d = (a: V, b: V) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: V, b: V, ta: number, tb: number): V => {
    const k = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export type Spline = { length: number; at(s: number): V };

export function buildSpline(points: readonly PathPoint[], samplesPerSegment = 24): Spline {
  const P: V[] = points.map(p => [p.x, p.y, p.z]);
  if (P.length === 1) return { length: 0, at: () => P[0] };
  const ext: V[] = [
    [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1], 2 * P[0][2] - P[1][2]], ...P,
    [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1], 2 * P[P.length - 1][2] - P[P.length - 2][2]],
  ];
  const pts: V[] = [], cum: number[] = [0];
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < samplesPerSegment; k++) pts.push(catmull(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], k / samplesPerSegment));
  pts.push(P[P.length - 1]);
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const length = cum[cum.length - 1];
  return {
    length,
    at(s: number): V {
      const target = Math.max(0, Math.min(1, s)) * length;
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
      const span = cum[hi] - cum[lo], f = span > 0 ? (target - cum[lo]) / span : 0;
      const a = pts[lo], b = pts[hi];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    },
  };
}
