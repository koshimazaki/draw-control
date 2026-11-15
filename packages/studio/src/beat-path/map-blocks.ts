/**
 * The map's Blocks tool: the scenery as editable boxes. Click a block to select it, drag
 * it to move, drag a corner to resize its footprint; with Draw new, drag a rectangle to add
 * one; Cmd/Ctrl-D duplicates, Cmd/Ctrl-C and -V copy and paste at the pointer, Delete
 * removes (page-actions.ts binds the keys), the height is a field. The first edit turns the
 * preset's placement into explicit boxes (recipe `sceneryBoxes`), which undo covers. A box
 * that would swallow the subject's path is nudged off it, with a word in the status line.
 */
import { footprintDistance, type Landmark } from "@motion-studio/core";
import type { PathPt } from "./script";
import { captureDrag } from "./drag";

export type Box = { x: number; z: number; w: number; d: number; h: number; yaw?: number };
export type BlockHost = {
  /** The boxes as they stand (explicit, or the preset's placement). */
  boxes(): Box[];
  /** False when the page refused the edit (a guide is rendering). */
  setBoxes(boxes: Box[], final: boolean): boolean;
  pen(): "edit" | "draw";
  /** The subject's floor positions (the path a box may not swallow). */
  subject(): PathPt[];
  say(text: string): void;
  changed(): void;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const asLandmark = (b: Box): Landmark => ({ kind: "building", x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, yaw: b.yaw ?? 0 });

/** Move a box off the subject's path (out along the line from the nearest point), at most 10 m. */
export function nudge(b: Box, subject: PathPt[], clearance = 0.8): { box: Box; moved: boolean } {
  let box = { ...b }, moved = false;
  for (let step = 0; step < 40; step++) {
    let near: PathPt | null = null, best = Infinity;
    for (const p of subject) { const d = footprintDistance(asLandmark(box), p); if (d < best) { best = d; near = p; } }
    if (!near || best >= clearance) break;
    const dx = box.x - near.x, dz = box.z - near.z, l = Math.hypot(dx, dz) || 1;
    box = { ...box, x: r2(box.x + dx / l * 0.25), z: r2(box.z + dz / l * 0.25) };
    moved = true;
  }
  return { box, moved };
}

export class BlockTool {
  selected = -1;
  private clipboard: Box | null = null;
  /** Where the pointer last was on the map (paste goes there). */
  pointer: PathPt = { x: 0, z: 0 };
  constructor(private canvas: HTMLCanvasElement, readonly host: BlockHost) {}

  private local(e: PointerEvent): [number, number] { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  /** Pointer down in the top view; true when the tool handled it. */
  down(e: PointerEvent, world: PathPt, toScreen: (p: PathPt) => [number, number], fromScreen: (x: number, y: number) => PathPt): boolean {
    const boxes = this.host.boxes().map(b => ({ ...b })), [px, py] = this.local(e);
    this.pointer = world;
    const corners = (b: Box) => { const c = Math.cos(b.yaw ?? 0), s = Math.sin(b.yaw ?? 0); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ u, v, p: { x: b.x + c * u * b.w / 2 - s * v * b.d / 2, z: b.z + s * u * b.w / 2 + c * v * b.d / 2 } })); };
    let drag: ((w: PathPt) => Box[]) | null = null;
    // A corner of the selected box: resize, the opposite corner fixed.
    const sel = boxes[this.selected];
    const hit = sel && corners(sel).find(k => { const [x, y] = toScreen(k.p); return Math.hypot(x - px, y - py) < 9; });
    if (sel && hit) {
      const opp = corners(sel).find(k => k.u === -hit.u && k.v === -hit.v)!.p, c = Math.cos(sel.yaw ?? 0), s = Math.sin(sel.yaw ?? 0);
      drag = w => {
        const lx = (w.x - opp.x) * c + (w.z - opp.z) * s, lz = -(w.x - opp.x) * s + (w.z - opp.z) * c;
        const nw = Math.max(0.4, Math.abs(lx)), nd = Math.max(0.4, Math.abs(lz)), mx = Math.sign(lx || 1) * nw / 2, mz = Math.sign(lz || 1) * nd / 2;
        return boxes.map((b, i) => (i !== this.selected ? b : { ...b, w: r2(nw), d: r2(nd), x: r2(opp.x + mx * c - mz * s), z: r2(opp.z + mx * s + mz * c) }));
      };
    } else {
      const inside = boxes.findIndex(b => footprintDistance(asLandmark(b), world) === 0);
      if (inside >= 0) {
        this.selected = inside;
        const from = { ...boxes[inside] };
        drag = w => boxes.map((b, i) => (i !== inside ? b : { ...b, x: r2(from.x + w.x - world.x), z: r2(from.z + w.z - world.z) }));
      } else if (this.host.pen() === "draw") {
        this.selected = boxes.length;
        drag = w => [...boxes, { x: r2((world.x + w.x) / 2), z: r2((world.z + w.z) / 2), w: r2(Math.max(0.4, Math.abs(w.x - world.x))), d: r2(Math.max(0.4, Math.abs(w.z - world.z))), h: 8 }];
      } else { this.selected = -1; this.host.changed(); return true; }
    }
    this.host.changed();
    const c = this.canvas;
    let last: Box[] | null = null;
    const move = (ev: PointerEvent) => { const w = fromScreen(...this.local(ev)); this.pointer = w; last = drag!(w); this.host.setBoxes(last, false); };
    captureDrag(c, e, move, () => {
      if (last) this.commit(last);
      else if (this.selected === boxes.length) this.selected = -1;   // a click with Draw new and no drag adds nothing
    });
    return true;
  }

  /** The final boxes, the selected one nudged off the subject's path if it swallowed it. */
  commit(boxes: Box[]) {
    const i = this.selected;
    if (boxes[i]) {
      const n = nudge(boxes[i], this.host.subject());
      if (n.moved) boxes = boxes.map((b, k) => (k === i ? n.box : b));
      if (this.host.setBoxes(boxes, true) && n.moved) this.host.say("That block covered the subject's path: moved off it");
      return;
    }
    this.host.setBoxes(boxes, true);
  }
  remove() { if (this.selected < 0) return false; if (this.host.setBoxes(this.host.boxes().filter((_, i) => i !== this.selected), true)) this.selected = -1; return true; }
  duplicate() {
    const b = this.host.boxes()[this.selected];
    if (!b) return false;
    const boxes = [...this.host.boxes(), { ...b, x: r2(b.x + Math.max(2, b.w + 1)) }];
    this.selected = boxes.length - 1; this.commit(boxes);
    return true;
  }
  copy() { const b = this.host.boxes()[this.selected]; if (b) this.clipboard = { ...b }; return !!b; }
  paste() {
    if (!this.clipboard) return false;
    const boxes = [...this.host.boxes(), { ...this.clipboard, x: r2(this.pointer.x), z: r2(this.pointer.z) }];
    this.selected = boxes.length - 1; this.commit(boxes);
    return true;
  }
  setHeight(h: number) {
    if (this.selected < 0 || !Number.isFinite(h)) return;
    this.host.setBoxes(this.host.boxes().map((b, i) => (i === this.selected ? { ...b, h: r2(Math.max(0.2, Math.min(60, h))) } : b)), true);
  }
}
