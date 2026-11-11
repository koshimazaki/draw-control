/**
 * Draw the camera path in the top view: click-drag to draw (simplified to at most 12
 * points and smoothed by the core spline), drag a point to move it, click a point to
 * select it and set its height. Writes `recipe.camera.path` and the path mode, so the
 * camera follows the drawn path while the music sets its speed and accents.
 */
import { validateRecipe, type Recipe } from "@motion-studio/core";
import type { Viewport } from "./viewport";

type Edit = (fn: (r: Recipe) => Recipe) => void;
type P = { x: number; y: number; z: number };
const MAX_POINTS = 12;

/** At most `max` points, evenly spaced along the drawn stroke. */
export function simplifyStroke(points: { x: number; z: number }[], max = MAX_POINTS): { x: number; z: number }[] {
  if (points.length <= max) return points;
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = cum[cum.length - 1], out: { x: number; z: number }[] = [];
  for (let k = 0; k < max; k++) {
    const target = total * k / (max - 1);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const f = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    out.push({ x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, z: points[i - 1].z + (points[i].z - points[i - 1].z) * f });
  }
  return out;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export class PathDrawer {
  drawing = false;
  selected = -1;
  constructor(private viewport: Viewport, private recipe: () => Recipe, private edit: Edit, private onChange: () => void) {
    viewport.canvas.addEventListener("pointerdown", e => this.down(e));
  }

  private setPath(r: Recipe, path: P[], usePathMode: boolean): Recipe {
    const cam = r.camera ?? { segments: [], intensity: 0.6, orbitDegreesPerBeat: 6, distance: 4.4, height: 1.15, fov: 38, startYaw: 0 };
    const segments = usePathMode ? [{ fromBeat: 0, toBeat: r.durationBeats, modes: ["path" as const] }] : cam.segments;
    return validateRecipe({ ...r, camera: { ...cam, segments, path: path.map(p => ({ x: r3(p.x), y: r3(p.y), z: r3(p.z) })) } });
  }

  private down(e: PointerEvent) {
    if (this.viewport.view !== "top") return;
    const start = this.viewport.floorPoint(e.clientX, e.clientY);
    if (!start) return;
    const canvas = this.viewport.canvas;
    const path = this.recipe().camera?.path;
    let move: ((ev: PointerEvent) => void) | null = null, up: (() => void) | null = null;
    if (this.drawing) {
      const stroke = [start];
      move = ev => { const p = this.viewport.floorPoint(ev.clientX, ev.clientY); if (p && Math.hypot(p.x - stroke[stroke.length - 1].x, p.z - stroke[stroke.length - 1].z) > 0.2) { stroke.push(p); this.viewport.previewStroke(stroke); } };
      up = () => {
        this.viewport.previewStroke(null);
        this.drawing = false;
        if (stroke.length < 2) { this.onChange(); return; }
        const h = this.recipe().camera?.height ?? 1.15;
        this.edit(r => this.setPath(r, simplifyStroke(stroke).map(p => ({ x: p.x, y: h, z: p.z })), true));
        this.onChange();
      };
    } else if (path) {
      const i = path.findIndex(p => Math.hypot(p.x - start.x, p.z - start.z) < 0.35);
      if (i < 0) return;
      this.selected = i;
      this.onChange();
      move = ev => {
        const p = this.viewport.floorPoint(ev.clientX, ev.clientY);
        if (!p) return;
        this.edit(r => { const pts = r.camera!.path!.map(q => ({ ...q })); pts[i] = { ...pts[i], x: p.x, z: p.z }; return this.setPath(r, pts, false); });
      };
    }
    if (!move) return;
    canvas.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => move!(ev);
    const onUp = () => { canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); up?.(); };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
  }

  setHeight(y: number) {
    const i = this.selected;
    if (i < 0) return;
    this.edit(r => { const pts = r.camera!.path!.map(q => ({ ...q })); if (!pts[i]) return r; pts[i] = { ...pts[i], y }; return this.setPath(r, pts, false); });
  }
  clear() {
    this.selected = -1;
    this.edit(r => {
      if (!r.camera?.path) return r;
      const cam = structuredClone(r.camera);
      delete cam.path;
      cam.segments = cam.segments.map(s => s.modes.includes("path") ? { ...s, modes: ["orbit" as const] } : s);
      return validateRecipe({ ...r, camera: cam });
    });
  }
}
