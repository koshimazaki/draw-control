/** Picking several path points on the map and moving them as one (map-select.ts). */
import { describe, expect, it } from "vitest";
import { insertAt, nearLine, pointsInRect, raisePoints, shiftPoints } from "../src/beat-path/map-select";

const path = [{ x: -6, z: 3 }, { x: -2, z: -1, y: 1 }, { x: 2, z: 1.5 }, { x: 6, z: -1 }];
describe("Map: a group of path points", () => {
  it("a box picks the points inside it, drawn in any direction", () => {
    const screen: [number, number][] = [[10, 10], [50, 40], [90, 20], [140, 60]];
    expect(pointsInRect(screen, { x0: 40, y0: 0, x1: 100, y1: 50 })).toEqual([1, 2]);
    expect(pointsInRect(screen, { x0: 100, y0: 50, x1: 40, y1: 0 })).toEqual([1, 2]);
  });
  it("the pointer is on the path's line within a few pixels, not off it", () => {
    const line: [number, number][] = [[0, 0], [100, 0], [100, 100]];
    expect(nearLine(line, 50, 5, 7)).toBe(true);
    expect(nearLine(line, 104, 60, 7)).toBe(true);
    expect(nearLine(line, 50, 20, 7)).toBe(false);
  });
  it("the whole path moves by one offset and keeps its shape and heights", () => {
    const moved = shiftPoints(path, [0, 1, 2, 3], 0, 2.5, 60);
    expect(moved.map(p => [p.x, p.z])).toEqual([[-6, 5.5], [-2, 1.5], [2, 4], [6, 1.5]]);
    expect(moved[1].y).toBe(1);
    expect(path[0].z).toBe(3);   // the original is untouched
  });
  it("part of it moves, the rest stays", () => {
    expect(shiftPoints(path, [2, 3], 1, 0, 60).map(p => p.x)).toEqual([-6, -2, 3, 7]);
  });
  it("at the edge the offset stops, so the shape never squashes", () => {
    const moved = shiftPoints(path, [0, 1, 2, 3], 100, 0, 60);
    expect(moved.map(p => p.x)).toEqual([48, 52, 56, 60]);
  });
  it("in the side view the group rises together, each within the height range", () => {
    const up = raisePoints(path, [0, 1], 1.5, 0, 3);
    expect(up.slice(0, 2).map(p => p.y)).toEqual([1.5, 2.5]);
    expect(raisePoints(path, [1], -5, 0, 3)[1].y).toBeUndefined();
  });
  it("a click on the line adds a point after the start of the nearest segment", () => {
    const screen: [number, number][] = [[0, 0], [100, 0], [100, 100], [200, 100]];
    expect(insertAt(screen, 50, 3)).toBe(1);
    expect(insertAt(screen, 97, 60)).toBe(2);
    expect(insertAt(screen, 160, 104)).toBe(3);
  });
});
