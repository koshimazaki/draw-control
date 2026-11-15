/**
 * Selecting more than one path point on the map: the points inside a dragged box, a pointer on
 * the path's line (which picks the whole path), and moving a group by one offset, so a whole path
 * or part of it can be slid closer to the camera or further out without editing each point.
 * Also the pen's simplifier (a freehand stroke to a few points). Pure geometry in screen pixels
 * and metres; map.ts draws and wires it.
 */
import type { PathPt } from "./script";

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The indices of the screen points inside a box (its corners in any order). */
export function pointsInRect(pts: readonly [number, number][], r: Rect): number[] {
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  return pts.flatMap(([x, y], i) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [i] : []));
}

/** Is (px, py) within `tol` pixels of the polyline? */
export function nearLine(line: readonly [number, number][], px: number, py: number, tol: number): boolean {
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= tol) return true;
  }
  return false;
}

/** Where a point clicked on the line goes: the index after the start of the nearest segment of the control polygon (1…n−1). */
export function insertAt(pts: readonly [number, number][], px: number, py: number): number {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0, d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
/** The points with those in `group` moved on the floor by (dx, dz) metres, kept inside ±limit. */
export function shiftPoints(pts: readonly PathPt[], group: readonly number[], dx: number, dz: number, limit: number): PathPt[] {
  const on = new Set(group);
  // The whole group moves by one offset, so the clamp is applied to the offset (the shape never squashes at the edge).
  const xs = group.map(i => pts[i].x), zs = group.map(i => pts[i].z);
  const cx = Math.max(-limit - Math.min(...xs), Math.min(limit - Math.max(...xs), dx));
  const cz = Math.max(-limit - Math.min(...zs), Math.min(limit - Math.max(...zs), dz));
  return pts.map((p, i) => (on.has(i) ? { ...p, x: r2(p.x + cx), z: r2(p.z + cz) } : { ...p }));
}

/** The points with those in `group` raised by dy metres, each kept within [lo, hi] (0 drops the height). */
export function raisePoints(pts: readonly PathPt[], group: readonly number[], dy: number, lo: number, hi: number): PathPt[] {
  const on = new Set(group);
  return pts.map((p, i) => {
    if (!on.has(i)) return { ...p };
    const y = r2(Math.max(lo, Math.min(hi, (p.y ?? 0) + dy)));
    const q: PathPt = { x: p.x, z: p.z };
    if (y > 0) q.y = y;
    return q;
  });
}

/** Ramer–Douglas–Peucker on the floor, the tolerance raised until at most `max` points are left. */
export function simplifyPen(points: PathPt[], max = 8): PathPt[] {
  if (points.length <= 2) return points;
  const off = (p: PathPt, a: PathPt, b: PathPt) => {
    const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  };
  for (let tol = 0.15; ; tol *= 1.5) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let worst = -1, wd = tol;
      for (let i = a + 1; i < b; i++) { const d = off(points[i], points[a], points[b]); if (d > wd) { wd = d; worst = i; } }
      if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
    }
    const out = points.filter((_, i) => keep[i]);
    if (out.length <= max) return out;
  }
}

/** How far one Smooth press moves a point towards the midpoint of its two neighbours. */
export const SMOOTH_STEP = 0.5;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/**
 * One Smooth press: each interior point in `group` (every interior point when the group is empty)
 * moves part of the way towards the midpoint of its two neighbours on the path, read before the
 * press. The first and last points never move; a picked point at the edge of a selection uses its
 * real neighbours. Heights smooth the same way where the points have them (a neighbour without one
 * counts as `baseY`; a result at or below 0 drops the height, as a drag does). Same point count.
 */
export function smoothPoints(pts: readonly PathPt[], group: readonly number[] = [], step = SMOOTH_STEP, baseY = 0): PathPt[] {
  const on = group.length ? new Set(group) : null, y = (p: PathPt) => p.y ?? baseY;
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1 || (on && !on.has(i))) return { ...p };
    const a = pts[i - 1], b = pts[i + 1], q: PathPt = { x: r3(p.x + step * ((a.x + b.x) / 2 - p.x)), z: r3(p.z + step * ((a.z + b.z) / 2 - p.z)) };
    if (p.y !== undefined || a.y !== undefined || b.y !== undefined) {
      const h = r3(y(p) + step * ((y(a) + y(b)) / 2 - y(p)));
      if (h > 0 && (p.y !== undefined || Math.abs(h - baseY) > 1e-9)) q.y = h;
    }
    return q;
  });
}
/** Would Smooth move anything (a path of three points or more, with an interior point to move)? */
export const canSmooth = (pts: readonly PathPt[], group: readonly number[] = []) =>
  pts.length >= 3 && (!group.length || group.some(i => i > 0 && i < pts.length - 1));
