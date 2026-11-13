/**
 * The map, a canvas in two views of one path at a time:
 * - top (x, z, the studio's top view: x right, z towards the viewer): a pen; drag to draw a
 *   freehand stroke (simplified to a few points), click to place a point; drag a point to
 *   move it, double-click a point to remove it, Escape cancels a stroke;
 * - side (distance along the active path, height): drag a point up or down to shape height.
 * It shows the subject's travel and its lock stations, the camera's trail, both paths with
 * their corner rounding, and live markers for the subject (facing) and the camera (view cone).
 */
import { cornerPath, type Landmark } from "@motion-studio/core";
import type { PathPt } from "./script";

export type Tool = "subject" | "camera";
export type View = "top" | "side";
export type MapScene = {
  floor: { x: number; z: number }[];
  stations: { x: number; z: number; dx: number; dz: number }[];
  trail: { x: number; z: number }[] | null;
  landmarks: Landmark[];
  /** The camera's track block by block (smoothed), labelled; the selected block bright, the others dim when one is selected. */
  cameraSegments: { label: string; points: { x: number; z: number }[]; emphasis: "selected" | "dim" | "normal" }[];
  /** Where the subject and the camera are on each beat, and the camera on each of its hits. */
  subjectBeats: { x: number; z: number }[]; cameraBeats: { x: number; z: number }[]; cameraHits: { x: number; z: number }[];
};
export type MapHost = {
  tool(): Tool;
  view(): View;
  points(tool: Tool): PathPt[];
  corners(tool: Tool): number;
  change(tool: Tool, points: PathPt[], final: boolean): void;
  /** "draw": a stroke or clicks make a new path; "edit": only existing points move (a stray click never draws). */
  pen(): "edit" | "draw";
  /** A freehand stroke finished: the page returns the pen to "edit". */
  drew(): void;
  /** The selected point (Delete removes it), or null. */
  selected(): { tool: Tool; index: number } | null;
  select(sel: { tool: Tool; index: number } | null): void;
};
type Live = { subject?: { x: number; z: number; yaw: number }; camera?: { x: number; z: number; tx: number; tz: number; fov: number } };

const HALF = 9, LIMIT = 14, MAX_POINTS = 8, HIT_PX = 12;
const HEIGHT = { subject: [0, 3], camera: [0.2, 6] } as const;
const DEFAULT_Y = { subject: 0, camera: 2 } as const;

/** Ramer–Douglas–Peucker on the floor, the tolerance raised until at most `max` points are left. */
export function simplifyPen(points: PathPt[], max = MAX_POINTS): PathPt[] {
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

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
const r2 = (x: number) => Math.round(x * 100) / 100;

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private scene: MapScene = { floor: [], stations: [], trail: null, landmarks: [], cameraSegments: [], subjectBeats: [], cameraBeats: [], cameraHits: [] };
  private live: Live = {};
  private stroke: PathPt[] | null = null;
  private cancel: (() => void) | null = null;
  private w = 1; private h = 1; private dpr = 1; private scale = 1;
  /** The top view's centre and half extent (metres): set by `fit`, steady while drawing. */
  private cx = 0; private cz = 0; private half = HALF;
  private colours: Record<string, string> = {};

  constructor(readonly canvas: HTMLCanvasElement, private host: MapHost) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("pointerdown", e => this.down(e));
    canvas.addEventListener("pointermove", e => { if (!e.buttons) canvas.classList.toggle("over-point", this.pick(e) >= 0); });
    canvas.addEventListener("dblclick", e => this.remove(e));
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    this.retheme();
  }

  /** Re-read the theme's colours. */
  retheme() {
    for (const k of ["map-bg", "map-minor", "map-major", "map-axis", "map-text", "text", "bg"]) this.colours[k] = token(`--${k}`);
    // The map has its own surface (a light paper in the Runware theme): its path colours are its own tokens.
    for (const k of ["subject", "camera", "station"]) this.colours[k] = token(`--map-${k}`) || token(`--${k}`);
    this.resize();
  }
  /** Escape: cancel the stroke or drag in progress. */
  cancelStroke() { this.cancel?.(); }
  get busy() { return !!this.cancel; }

  // Top view: metres to pixels.
  private top(p: { x: number; z: number }): [number, number] { return [this.w / 2 + (p.x - this.cx) * this.scale, this.h / 2 + (p.z - this.cz) * this.scale]; }
  private fromTop(px: number, py: number): PathPt { return { x: (px - this.w / 2) / this.scale + this.cx, z: (py - this.h / 2) / this.scale + this.cz }; }
  /** Frame both paths and the camera's trail (on a new example or script, never while drawing). */
  fit() {
    const all = [...this.host.points("subject"), ...this.host.points("camera"), ...this.scene.floor, ...(this.scene.trail ?? [])];
    if (!all.length) { this.cx = this.cz = 0; this.half = HALF; this.resize(); return; }
    const xs = all.map(p => p.x), zs = all.map(p => p.z), aspect = this.w / this.h;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.cx = Math.round((x0 + x1) / 2); this.cz = Math.round((z0 + z1) / 2);
    const need = Math.max((x1 - x0) / 2 + 1.5, (z1 - z0) / 2 + 1.5) * Math.max(1, aspect < 1 ? 1 / aspect : 1);
    this.half = Math.max(HALF, Math.min(LIMIT + 2, Math.ceil(need)));
    this.resize();
  }
  /** Side view: the active path's distance along it (s) and height to pixels. */
  private sideFrame() {
    const tool = this.host.tool(), pts = this.host.points(tool), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const L = Math.max(1, cum[cum.length - 1]), [, ymax] = HEIGHT[tool], pad = 44;
    const sx = (this.w - 2 * pad) / L, sy = (this.h - 2 * pad) / (ymax + 0.5);
    return { pts, cum, L, pad, sx, sy, ymax, at: (s: number, y: number): [number, number] => [pad + s * sx, this.h - pad - y * sy], yAt: (py: number) => (this.h - pad - py) / sy };
  }
  /** Client coordinates of a point in the current view (for the smoke test). */
  clientAt(p: PathPt): { x: number; y: number } { const r = this.canvas.getBoundingClientRect(), [x, y] = this.top(p); return { x: r.left + x, y: r.top + y }; }

  setScene(scene: MapScene) { this.scene = scene; this.paintBase(); this.draw(); }
  setLive(live: Live) { this.live = live; this.draw(); }
  refresh() { this.paintBase(); this.draw(); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.scale = Math.min(this.w, this.h) / (2 * this.half);
    for (const c of [this.canvas, this.base]) { c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr); }
    this.refresh();
  }

  private local(e: MouseEvent): [number, number] { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  private screenOf(i: number): [number, number] {
    const pts = this.host.points(this.host.tool());
    if (this.host.view() === "top") return this.top(pts[i]);
    const f = this.sideFrame();
    return f.at(f.cum[i], pts[i].y ?? 0);
  }
  private pick(e: MouseEvent): number {
    const [px, py] = this.local(e), n = this.host.points(this.host.tool()).length;
    let best = -1, bestD = HIT_PX;
    for (let i = 0; i < n; i++) { const [x, y] = this.screenOf(i), d = Math.hypot(x - px, y - py); if (d < bestD) { best = i; bestD = d; } }
    return best;
  }
  private clamp(p: PathPt): PathPt { return { ...p, x: Math.max(-LIMIT, Math.min(LIMIT, p.x)), z: Math.max(-LIMIT, Math.min(LIMIT, p.z)) }; }

  private remove(e: MouseEvent) {
    const i = this.pick(e), tool = this.host.tool();
    if (i < 0 || this.host.view() !== "top") return;
    this.host.change(tool, this.host.points(tool).filter((_, k) => k !== i), true);
  }

  private down(e: PointerEvent) {
    if (e.button !== 0 || e.detail > 1) return;
    e.preventDefault();
    const tool = this.host.tool(), view = this.host.view(), i = this.pick(e), c = this.canvas;
    const start = this.local(e), original = this.host.points(tool).map(p => ({ ...p }));
    let move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void, revert: () => void;
    if (i >= 0) {
      const pts = original.map(p => ({ ...p }));
      this.host.select({ tool, index: i });
      c.classList.add("dragging");
      move = ev => {
        const [px, py] = this.local(ev);
        if (view === "top") { const q = this.clamp(this.fromTop(px, py)); pts[i] = { ...pts[i], x: r2(q.x), z: r2(q.z) }; }
        else { const [lo, hi] = HEIGHT[tool], y = r2(Math.max(lo, Math.min(hi, this.sideFrame().yAt(py)))); pts[i] = { ...pts[i], ...(y > 0 ? { y } : { y: undefined }) }; if (pts[i].y === undefined) delete pts[i].y; }
        this.host.change(tool, pts.map(p => ({ ...p })), false);
      };
      up = () => this.host.change(tool, pts, true);
      revert = () => this.host.change(tool, original, true);
    } else {
      // Only an armed pen draws; otherwise a click on empty ground just clears the selection.
      if (view !== "top" || this.host.pen() !== "draw") { this.host.select(null); this.refresh(); return; }
      const y = original.at(-1)?.y ?? (DEFAULT_Y[tool] || undefined);
      const first = this.clamp(this.fromTop(...start)), stroke = [first];
      let drawing = false;
      move = ev => {
        const [px, py] = this.local(ev);
        if (!drawing && Math.hypot(px - start[0], py - start[1]) < 5) return;
        drawing = true;
        const p = this.clamp(this.fromTop(px, py)), last = stroke[stroke.length - 1];
        if (Math.hypot(p.x - last.x, p.z - last.z) > 0.08) { stroke.push(p); this.stroke = stroke; this.draw(); }
      };
      up = () => {
        this.stroke = null;
        const withY = (p: PathPt): PathPt => ({ x: r2(p.x), z: r2(p.z), ...(y ? { y } : {}) });
        let length = 0;
        for (let k = 1; k < stroke.length; k++) length += Math.hypot(stroke[k].x - stroke[k - 1].x, stroke[k].z - stroke[k - 1].z);
        if (drawing && length > 0.6) { this.host.change(tool, simplifyPen(stroke).map(withY), true); this.host.drew(); }
        else if (!drawing) this.host.change(tool, [...original, withY(first)].slice(-MAX_POINTS * 2), true);   // in draw mode a click adds a point
        this.draw();
      };
      revert = () => { this.stroke = null; this.draw(); };
    }
    c.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => move(ev);
    const done = (ev: PointerEvent | null) => {
      c.removeEventListener("pointermove", onMove); c.removeEventListener("pointerup", onUp); c.removeEventListener("pointercancel", onCancel);
      c.classList.remove("dragging");
      this.cancel = null;
      if (ev) up(ev); else revert();
    };
    const onUp = (ev: PointerEvent) => done(ev), onCancel = () => done(null);
    this.cancel = () => done(null);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onCancel);
  }

  private line(g: CanvasRenderingContext2D, pts: [number, number][], colour: string, width: number, alpha = 1, dash: number[] = []) {
    if (pts.length < 2) return;
    g.save();
    g.globalAlpha = alpha; g.strokeStyle = colour; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round"; g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.restore();
  }
  private handles(g: CanvasRenderingContext2D, pts: [number, number][], colour: string, active: boolean, tool: Tool = this.host.tool()) {
    const sel = this.host.selected();
    for (const [k, [x, y]] of pts.entries()) {
      if (active && sel?.tool === tool && sel.index === k) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.strokeStyle = colour; g.lineWidth = 2; g.stroke(); }
      g.beginPath(); g.arc(x, y, active ? 5.5 : 3, 0, Math.PI * 2);
      g.fillStyle = active ? colour : this.colours["map-bg"]; g.fill();
      g.lineWidth = active ? 2 : 1.4; g.strokeStyle = active ? this.colours["map-bg"] : colour; g.stroke();
    }
  }

  private paintBase() {
    const g = this.base.getContext("2d")!, C = this.colours;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C["map-bg"]; g.fillRect(0, 0, this.w, this.h);
    if (this.host.view() === "side") { this.paintSide(g); return; }
    const ext = Math.ceil(Math.max(this.w, this.h) / 2 / this.scale) + Math.ceil(Math.max(Math.abs(this.cx), Math.abs(this.cz)));
    for (let m = -ext; m <= ext; m++) {
      g.strokeStyle = m === 0 ? C["map-axis"] : m % 4 === 0 ? C["map-major"] : C["map-minor"];
      g.lineWidth = 1;
      const [x] = this.top({ x: m, z: 0 }), [, y] = this.top({ x: 0, z: m });
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, this.h); g.stroke();
      g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(this.w, Math.round(y) + 0.5); g.stroke();
    }
    g.fillStyle = C["map-text"]; g.font = "10px ui-monospace, Menlo, monospace";
    for (let m = -16; m <= 16; m += 4) if (m) { const [x, y] = this.top({ x: m, z: 0 }); g.fillText(`${m} m`, x + 3, y - 4); }
    const s = this.scene, tool = this.host.tool();
    // Landmark blocks: plain outlines of their footprints.
    g.strokeStyle = C["map-text"]; g.lineWidth = 1.2; g.setLineDash([]);
    for (const b of s.landmarks) {
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      const corner = (u: number, v: number) => this.top({ x: b.x + c * u - sn * v, z: b.z + sn * u + c * v });
      const pts = [corner(-b.w / 2, -b.d / 2), corner(b.w / 2, -b.d / 2), corner(b.w / 2, b.d / 2), corner(-b.w / 2, b.d / 2)];
      g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      if (b.kind === "pillar") { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[2][0], pts[2][1]); g.stroke(); }   // a tall block: crossed
    }
    // The camera's track, block by block: alternate solid and dashed, each labelled at its middle.
    g.font = "10px system-ui, sans-serif";
    s.cameraSegments.forEach((seg, k) => {
      if (seg.points.length < 2) return;
      const alpha = seg.emphasis === "selected" ? 1 : seg.emphasis === "dim" ? 0.25 : 0.7;
      this.line(g, seg.points.map(p => this.top(p)), C.camera, seg.emphasis === "selected" ? 3 : 1.8, alpha, k % 2 ? [6, 4] : []);
      const [x, y] = this.top(seg.points[Math.floor(seg.points.length / 2)]);
      g.globalAlpha = Math.max(0.45, alpha); g.fillStyle = C.camera; g.fillText(seg.label, x + 6, y - 6); g.globalAlpha = 1;
    });
    this.line(g, s.floor.map(p => this.top(p)), C.subject, 3.2);
    // Beat ticks: a small dot on each beat along both tracks; the camera on each of its hits, a ring.
    for (const [list, colour, r] of [[s.subjectBeats, C.subject, 2], [s.cameraBeats, C.camera, 1.8]] as const)
      for (const p of list) { const [x, y] = this.top(p); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = colour; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1; }
    g.strokeStyle = C.station; g.lineWidth = 1.6;
    for (const p of s.cameraHits) { const [x, y] = this.top(p); g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = C.station; g.lineWidth = 2.4; g.lineCap = "round";
    for (const st of s.stations) {
      const [x, y] = this.top(st), len = Math.hypot(st.dx, st.dz) || 1, nx = -st.dz / len * 7, ny = st.dx / len * 7;
      g.beginPath(); g.moveTo(x - nx, y - ny); g.lineTo(x + nx, y + ny); g.stroke();
    }
    for (const t of ["camera", "subject"] as const) {
      const pts = this.host.points(t), active = t === tool, colour = t === "camera" ? C.camera : C.subject;
      if (t === "camera" && pts.length >= 2) this.line(g, cornerPath(pts, this.host.corners(t)).map(p => this.top(p)), colour, 2, active ? 0.9 : 0.45);
      if (active && pts.length >= 2) this.line(g, pts.map(p => this.top(p)), colour, 1, 0.35, [3, 4]);
      this.handles(g, pts.map(p => this.top(p)), colour, active, t);
    }
  }

  /** Side view: the active path unrolled, its heights against distance along it. */
  private paintSide(g: CanvasRenderingContext2D) {
    const C = this.colours, tool = this.host.tool(), f = this.sideFrame(), colour = tool === "camera" ? C.camera : C.subject;
    g.lineWidth = 1; g.font = "10px ui-monospace, Menlo, monospace"; g.fillStyle = C["map-text"];
    for (let y = 0; y <= f.ymax; y++) {
      const [, py] = f.at(0, y);
      g.strokeStyle = y === 0 ? C["map-axis"] : C["map-minor"];
      g.beginPath(); g.moveTo(f.pad - 8, Math.round(py) + 0.5); g.lineTo(this.w - f.pad + 8, Math.round(py) + 0.5); g.stroke();
      g.fillText(`${y} m`, 8, py + 3);
    }
    for (let s = 0; s <= f.L; s++) { const [px] = f.at(s, 0); g.strokeStyle = C["map-minor"]; g.beginPath(); g.moveTo(Math.round(px) + 0.5, f.pad); g.lineTo(Math.round(px) + 0.5, this.h - f.pad); g.stroke(); }
    g.fillText(`along the ${tool} path · ${f.L.toFixed(1)} m`, f.pad, this.h - 16);
    if (f.pts.length < 2) return;
    // Landmark blocks within 6 m of the path: outlines at the distance along it they sit beside.
    g.strokeStyle = C["map-text"]; g.lineWidth = 1.2;
    for (const b of this.scene.landmarks) {
      let best = { d: Infinity, s: 0 };
      for (let i = 1; i < f.pts.length; i++) {
        const a = f.pts[i - 1], q = f.pts[i], dx = q.x - a.x, dz = q.z - a.z, L = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.z - a.z) * dz) / L)), d = Math.hypot(b.x - a.x - t * dx, b.z - a.z - t * dz);
        if (d < best.d) best = { d, s: f.cum[i - 1] + t * Math.sqrt(L) };
      }
      if (best.d > 6) continue;
      const half = Math.max(b.w, b.d) / 2, [x0, y0] = f.at(best.s - half, 0), [x1, y1] = f.at(best.s + half, Math.min(f.ymax + 0.4, b.h));
      g.globalAlpha = Math.max(0.25, 1 - best.d / 6);
      g.strokeRect(x0, y1, x1 - x0, y0 - y1);
      g.globalAlpha = 1;
    }
    // The rounded path's heights against its distance, scaled to the control polygon's length.
    const dense = cornerPath(f.pts, this.host.corners(tool)), dc = [0];
    for (let i = 1; i < dense.length; i++) dc.push(dc[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
    const k = f.L / Math.max(1e-6, dc[dc.length - 1]);
    const curve = dense.map((p, i) => f.at(dc[i] * k, p.y ?? 0));
    g.save(); g.globalAlpha = 0.12; g.fillStyle = colour; g.beginPath(); g.moveTo(curve[0][0], f.at(0, 0)[1]);
    for (const [x, y] of curve) g.lineTo(x, y);
    g.lineTo(curve[curve.length - 1][0], f.at(0, 0)[1]); g.closePath(); g.fill(); g.restore();
    this.line(g, curve, colour, 3);
    for (let i = 0; i < f.pts.length; i++) { const [x, y] = f.at(f.cum[i], f.pts[i].y ?? 0); this.line(g, [[x, f.at(0, 0)[1]], [x, y]], colour, 1, 0.35, [2, 3]); }
    this.handles(g, f.pts.map((p, i) => f.at(f.cum[i], p.y ?? 0)), colour, true);
  }

  draw() {
    const g = this.ctx, C = this.colours;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.host.view() !== "top") return;
    const cam = this.live.camera;
    if (cam) {
      const [x, y] = this.top(cam), a = Math.atan2(cam.tz - cam.z, cam.tx - cam.x), half = cam.fov * 16 / 9 * Math.PI / 360, r = 46;
      g.save(); g.globalAlpha = 0.16; g.fillStyle = C.camera;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a - half, a + half); g.closePath(); g.fill();
      g.globalAlpha = 0.8; g.strokeStyle = C.camera; g.lineWidth = 1.2; g.stroke(); g.restore();
      g.fillStyle = C.camera; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
    }
    const sub = this.live.subject;
    if (sub) {
      const [x, y] = this.top(sub), fx = Math.sin(sub.yaw), fz = Math.cos(sub.yaw);
      g.save(); g.globalAlpha = 0.2; g.fillStyle = C.subject; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill(); g.restore();
      g.fillStyle = C.subject; g.strokeStyle = C["map-bg"]; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + fx * 11, y + fz * 11);
      g.lineTo(x - fx * 6 + fz * 7, y - fz * 6 - fx * 7);
      g.lineTo(x - fx * 3, y - fz * 3);
      g.lineTo(x - fx * 6 - fz * 7, y - fz * 6 + fx * 7);
      g.closePath(); g.fill(); g.stroke();
    }
    if (this.stroke) this.line(g, this.stroke.map(p => this.top(p)), this.host.tool() === "camera" ? C.camera : C.subject, 2.5, 0.9, [6, 5]);
  }
}
