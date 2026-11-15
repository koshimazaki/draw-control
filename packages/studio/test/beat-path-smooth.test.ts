/** Smooth on the map's tool row (map-select.ts `smoothPoints`): evens out a hand-drawn path, or the picked part of it. */
import { describe, expect, it } from "vitest";
import { canSmooth, smoothPoints } from "../src/beat-path/map-select";
import type { PathPt } from "../src/beat-path/script";

/** How far the interior points sit off the straight line between the ends, at most (the path's unevenness, metres). */
const wobble = (pts: readonly PathPt[]) => {
  const a = pts[0], b = pts.at(-1)!, dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  return Math.max(0, ...pts.slice(1, -1).map(p => Math.abs(((p.x - a.x) * dz - (p.z - a.z) * dx) / L)));
};
const zigzag: PathPt[] = Array.from({ length: 9 }, (_, i) => ({ x: i, z: i === 0 || i === 8 ? 0 : i % 2 ? 1 : -1 }));

describe("Smooth: a drawn path evened out", () => {
  it("a straight line is unchanged", () => {
    // Evenly spaced points on a line do not move at all.
    const even = [{ x: 0, z: 0 }, { x: 1, z: 2 }, { x: 2, z: 4 }, { x: 3, z: 6 }];
    expect(smoothPoints(even)).toEqual(even);
    // Unevenly spaced, the points may slide along the line but never leave it.
    const line = [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 4, z: 4 }];
    expect(wobble(smoothPoints(line))).toBeCloseTo(0, 9);
  });
  it("a zig-zag gets flatter with each press and converges to a line", () => {
    let pts = zigzag, last = wobble(pts);
    for (let press = 0; press < 200; press++) {
      pts = smoothPoints(pts);
      const w = wobble(pts);
      expect(w).toBeLessThanOrEqual(last + 1e-9);
      if (press < 3) expect(w).toBeLessThan(last);
      last = w;
    }
    expect(last).toBeLessThan(0.02);   // within 2 cm of a line (points are kept to the millimetre)
  });
  it("the first and last points never move, and the point count is the same", () => {
    const out = smoothPoints(zigzag);
    expect(out).toHaveLength(zigzag.length);
    expect(out[0]).toEqual(zigzag[0]);
    expect(out.at(-1)).toEqual(zigzag.at(-1));
  });
  it("only the picked points move; a picked point at the selection's edge uses its real neighbours", () => {
    const out = smoothPoints(zigzag, [3, 4]);
    out.forEach((p, i) => { if (i !== 3 && i !== 4) expect(p).toEqual(zigzag[i]); });
    // Point 3 (z 1) between 2 (z -1, not picked) and 4 (z -1): half way to their midpoint.
    expect(out[3]).toEqual({ x: 3, z: 0 });
    expect(out[4]).toEqual({ x: 4, z: 0 });
    // Picking an endpoint moves nothing there.
    expect(smoothPoints(zigzag, [0, 8])).toEqual(zigzag);
  });
  it("heights smooth the same way where the points have them", () => {
    const hilly: PathPt[] = [{ x: 0, z: 0 }, { x: 1, z: 0, y: 2 }, { x: 2, z: 0 }, { x: 3, z: 0, y: 2 }, { x: 4, z: 0 }];
    const out = smoothPoints(hilly);
    expect(out.map(p => p.y)).toEqual([undefined, 1, 1, 1, undefined]);
    // A camera path (heights above 2 m by default): a point without a height between two at 2 m stays without one.
    const cam: PathPt[] = [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 0 }];
    expect(smoothPoints(cam, [], 0.5, 2)[1]).toEqual({ x: 1, z: 0.5 });
  });
  it("has nothing to do below three points or with only endpoints picked", () => {
    expect(canSmooth([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBe(false);
    expect(canSmooth(zigzag)).toBe(true);
    expect(canSmooth(zigzag, [0, 8])).toBe(false);
    expect(canSmooth(zigzag, [0, 4])).toBe(true);
  });
});
