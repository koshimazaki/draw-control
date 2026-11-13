/**
 * Editing a follow camera on the map (top view, Camera tool, Edit pen). A Follow behind or
 * Follow side block stays a follow: its line is the subject's path offset, so its points are
 * not dragged one by one. Grabbing the line anywhere and dragging sets the block's offset
 * from where the camera would be on that frame: in or out is the distance, sideways turns it
 * around the subject (the angle); dragging a side camera across the path puts it on the
 * other side (left / right). Height is typed (the footer field). Draw new still replaces the
 * follow with a drawn path.
 */
import { FOLLOW_LIMITS, type FollowOffset } from "@motion-studio/core";
import { foldDegrees } from "@motion-studio/core/internal";
import { captureDrag } from "./drag";

export type FollowWord = "behind" | "side";
/** Where the subject is on a frame of the camera's line, and which way it faces (radians, 0 = +Z). */
export type Anchor = { x: number; z: number; heading: number };
/** One editable follow block's line on the map: its points and, frame for frame, the subject under it. */
export type FollowSeg = { block: number; word: FollowWord; points: { x: number; z: number }[]; anchors: Anchor[] };

/** The rig's own angle for each page word (core FOLLOW_ANGLES: chase π, side π/2 = the subject's left). */
const RIG_ANGLE: Record<FollowWord, number> = { behind: Math.PI, side: Math.PI / 2 };
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The offset that puts the camera at `p` when the subject is at `a`: distance (clamped to
 * FOLLOW_LIMITS) and the angle from the rig's own (degrees, -180..180). Height is kept.
 */
export function followFromPoint(word: FollowWord, a: Anchor, p: { x: number; z: number }, prev?: FollowOffset): FollowOffset {
  const rx = p.x - a.x, rz = p.z - a.z;
  const [lo, hi] = FOLLOW_LIMITS.distance;
  const distance = r1(Math.max(lo, Math.min(hi, Math.hypot(rx, rz))));
  // The rig places the camera at subject + (sin yaw, cos yaw) · distance, yaw = heading + rig angle + offset.
  const yaw = Math.atan2(rx, rz), angle = r1(foldDegrees((yaw - a.heading - RIG_ANGLE[word]) * 180 / Math.PI));
  const out: FollowOffset = { ...prev, distance };
  if (Math.abs(angle) >= 0.5) out.angle = angle; else delete out.angle;
  return out;
}

/** Which side of the subject's heading a point is on: +1 its right, -1 its left. */
export const sideOf = (a: Anchor, p: { x: number; z: number }) => Math.sign(-Math.cos(a.heading) * (p.x - a.x) + Math.sin(a.heading) * (p.z - a.z)) || -1;

export type FollowHost = {
  segments(): FollowSeg[];
  current(block: number): FollowOffset | undefined;
  set(block: number, f: FollowOffset, final: boolean): void;
  say(text: string): void;
};

export class FollowTool {
  constructor(private canvas: HTMLCanvasElement, readonly host: FollowHost) {}

  private local(e: PointerEvent): [number, number] { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  /** The follow line under the pointer (within `px`), with the nearest frame on it. */
  hit(e: PointerEvent, toScreen: (p: { x: number; z: number }) => [number, number], px = 9): { seg: FollowSeg; k: number } | null {
    const [x, y] = this.local(e);
    let best: { seg: FollowSeg; k: number; d: number } | null = null;
    for (const seg of this.host.segments()) seg.points.forEach((p, k) => {
      const [sx, sy] = toScreen(p), d = Math.hypot(sx - x, sy - y);
      if (d < px && (!best || d < best.d)) best = { seg, k, d };
    });
    return best ? { seg: (best as { seg: FollowSeg }).seg, k: (best as { k: number }).k } : null;
  }

  /** Pointer down on the map: true when it grabbed a follow line (the drag then sets the offset; one undo step). */
  down(e: PointerEvent, toScreen: (p: { x: number; z: number }) => [number, number], fromScreen: (x: number, y: number) => { x: number; z: number }): boolean {
    const hit = this.hit(e, toScreen);
    if (!hit) return false;
    const { seg, k } = hit, a = seg.anchors[Math.min(k, seg.anchors.length - 1)], name = seg.word === "side" ? "Follow side" : "Follow behind";
    this.host.say(`Adjusting ${name}: in or out sets the distance, sideways turns it around the subject${seg.word === "side" ? ", across the path switches side" : ""} · Draw new replaces it with your path`);
    this.canvas.classList.add("dragging");
    let last: FollowOffset | null = null;
    captureDrag(this.canvas, e, ev => {
      last = followFromPoint(seg.word, a, fromScreen(...this.local(ev)), this.host.current(seg.block));
      this.host.set(seg.block, last, false);
    }, () => {
      this.canvas.classList.remove("dragging");
      if (last) {
        this.host.set(seg.block, last, true);
        const right = seg.word === "side" && Math.abs(last.angle ?? 0) > 90;
        this.host.say(`${name}${seg.word === "side" ? (right ? ", right side" : ", left side") : ""}: ${last.distance} m${last.angle ? `, turned ${last.angle}°` : ""} (still a follow; undo with Cmd/Ctrl-Z)`);
      }
    });
    return true;
  }
}
