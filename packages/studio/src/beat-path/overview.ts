/**
 * The track overview: the whole track's waveform (analysed once) with the clip's window
 * between two accent brackets, exactly the clip's length; outside the window is dimmed. Drag
 * the window to move it, or either bracket to change the clip's length like a loop region (whole
 * seconds, the other end held); arrow keys nudge it (a beat with snap on, a frame with it off).
 * Grab the playhead line to move the playback position inside the window. The timeline zoom
 * zooms this strip too (`setZoom`), keeping the window in view; Shift-scroll or a sideways scroll
 * pans it. The page snaps and clamps (core `sliceStart`); this only draws and reports where it was asked to go.
 */
import type { Track } from "../audio";
import { captureDrag } from "./drag";

export type OverviewHost = {
  /** Move the window's start to `seconds` (the page snaps and clamps); `final` ends a drag (one undo step). */
  move(seconds: number, final: boolean): void;
  /** One nudge: -1 or +1 (a beat, or a frame with snap off). */
  nudge(direction: -1 | 1): void;
  /** A bracket dragged to `seconds`: the clip's start (end held) or its end (start held); the page rounds the length to whole seconds. */
  resize(edge: "start" | "end", seconds: number, final: boolean): void;
  /** The playhead dragged to `seconds` (the page keeps it inside the clip). */
  seek(seconds: number): void;
};

export class TrackOverview {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private w = 1; private h = 1; private dpr = 1;
  private track: Track | null = null;
  private start = 0; private clip = 8; private head = -1;
  /** The zoom (1: the whole track) and the first second shown. */
  private zoom = 1; private view0 = 0;
  private colours: Record<string, string> = {};

  constructor(readonly canvas: HTMLCanvasElement, private host: OverviewHost) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return this.view0 + (e.clientX - r.left) / Math.max(1, r.width) * this.span(); };
    canvas.addEventListener("pointerdown", e => {
      if (!this.track || e.button !== 0) return;
      e.preventDefault();
      canvas.focus();
      // A bracket (within 6 px) resizes the window like a loop region; inside it moves; a click outside centres it there.
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, k = r.width / this.span(), grip = this.grip(k), x = (t: number) => (t - this.view0) * k;
      const edge = Math.abs(px - x(this.start)) <= grip ? "start" : Math.abs(px - x(this.start + this.clip)) <= grip ? "end" : null;
      if (edge) {
        canvas.classList.add("dragging");
        let lastT = at(e);
        captureDrag(canvas, e, ev => { lastT = at(ev); this.host.resize(edge, lastT, false); }, () => { canvas.classList.remove("dragging"); this.host.resize(edge, lastT, true); });
        return;
      }
      // The playhead line (within 4 px, inside the window) scrubs the playback position.
      if (this.headInWindow() && Math.abs(px - x(this.head)) <= 4) {
        this.host.seek(at(e));
        captureDrag(canvas, e, ev => this.host.seek(at(ev)));
        return;
      }
      const t0 = at(e), inside = t0 >= this.start && t0 <= this.start + this.clip, grab = inside ? t0 - this.start : this.clip / 2;
      if (!inside) this.host.move(t0 - grab, false);
      canvas.classList.add("dragging");
      let last = t0 - grab;
      captureDrag(canvas, e, ev => { last = at(ev) - grab; this.host.move(last, false); }, () => { canvas.classList.remove("dragging"); this.host.move(last, true); });
    });
    canvas.addEventListener("pointermove", e => {
      if (e.buttons || !this.track) return;
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, k = r.width / this.span(), x = (t: number) => (t - this.view0) * k;
      const grip = this.grip(k);
      canvas.style.cursor = Math.abs(px - x(this.start)) <= grip || Math.abs(px - x(this.start + this.clip)) <= grip || (this.headInWindow() && Math.abs(px - x(this.head)) <= 4) ? "ew-resize" : "";
    });
    // Zoomed in: a sideways (or Shift-) scroll pans along the track. Cmd/Ctrl-scroll is the timeline zoom (page-actions.ts).
    canvas.addEventListener("wheel", e => {
      if (e.ctrlKey || e.metaKey || this.zoom === 1) return;
      const d = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
      if (!d) return;
      e.preventDefault();
      this.view0 += d / Math.max(1, this.w) * this.span(); this.clampView(); this.paintBase(); this.draw();
    }, { passive: false });
    canvas.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); e.stopPropagation();
      this.host.nudge(e.key === "ArrowRight" ? 1 : -1);
    });
    this.retheme();
  }

  retheme() {
    const css = getComputedStyle(document.documentElement);
    for (const k of ["wave", "wave-bg", "accent", "text-muted", "playhead", "bg"]) this.colours[k] = css.getPropertyValue(`--${k}`).trim() || "#888";
    this.resize();
  }

  /** The brackets' grab zone (px): 6, smaller on a narrow window so its middle still moves it. */
  private grip(k: number) { return Math.max(2, Math.min(6, this.clip * k / 5)); }
  /** The playhead can be grabbed only inside the clip window (the page's clock never leaves it). */
  private headInWindow() { return this.head >= this.start && this.head <= this.start + this.clip; }
  /** The seconds the strip spans: the track, or further when the window runs past its end. */
  private length() { return Math.max(this.track?.buffer.duration ?? 1, this.start + this.clip); }
  /** The seconds shown at this zoom (never less than the window and a margin). */
  private span() { const L = this.length(); return Math.min(L, Math.max(L / this.zoom, this.clip * 1.25)); }
  private clampView() { this.view0 = Math.max(0, Math.min(this.length() - this.span(), this.view0)); }
  /** Scroll just enough to keep the whole window in view (true when the view moved). */
  private frame() {
    const v = this.view0, s = this.span();
    if (this.start < this.view0) this.view0 = this.start;
    else if (this.start + this.clip > this.view0 + s) this.view0 = this.start + this.clip - s;
    this.clampView();
    return this.view0 !== v;
  }
  setTrack(track: Track | null) { if (track !== this.track) this.view0 = 0; this.track = track; this.frame(); this.paintBase(); this.draw(); }
  setWindow(start: number, clip: number) {
    const span = this.span();
    this.start = start; this.clip = clip;
    if (this.frame() || span !== this.span()) this.paintBase();
    this.draw();
  }
  /** The timeline's zoom (1, 2, 4, 8): the strip shows that much less of the track, the window kept in view. */
  setZoom(zoom: number) {
    if (zoom === this.zoom) return;
    const mid = this.start + this.clip / 2;
    this.zoom = zoom; this.view0 = mid - this.span() / 2; this.clampView(); this.frame();
    this.paintBase(); this.draw();
  }
  setHead(seconds: number) { this.head = seconds; this.draw(); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    for (const c of [this.canvas, this.base]) { c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr); }
    this.paintBase(); this.draw();
  }

  /** The whole waveform, one min/max column per pixel. */
  private paintBase() {
    const g = this.base.getContext("2d")!, C = this.colours, wave = this.track?.wave, mid = this.h / 2;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C["wave-bg"]; g.fillRect(0, 0, this.w, this.h);
    if (!wave) return;
    g.fillStyle = C.wave;
    const per = this.span() / this.w / wave.bucketSeconds, first = this.view0 / wave.bucketSeconds;
    for (let px = 0; px < this.w; px++) {
      let lo = 0, hi = 0;
      for (let b = Math.max(0, Math.floor(first + px * per)); b < Math.min(wave.min.length, Math.floor(first + (px + 1) * per) + 1); b++) { lo = Math.min(lo, wave.min[b]); hi = Math.max(hi, wave.max[b]); }
      const top = mid - hi * mid * 0.9, bottom = mid - lo * mid * 0.9;
      g.fillRect(px, top, 1, Math.max(1, bottom - top));
    }
  }

  draw() {
    const g = this.ctx, C = this.colours, k = this.w / this.span();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.track) return;
    const x0 = (this.start - this.view0) * k, x1 = (this.start + this.clip - this.view0) * k;
    // Outside the window is dimmed; the window has accent brackets at both ends.
    g.fillStyle = C.bg; g.globalAlpha = 0.62;
    g.fillRect(0, 0, x0, this.h); g.fillRect(x1, 0, this.w - x1, this.h);
    g.globalAlpha = 1; g.strokeStyle = C.accent; g.lineWidth = 2;
    const arm = 6;
    g.beginPath();
    g.moveTo(x0 + arm, 1); g.lineTo(x0 + 1, 1); g.lineTo(x0 + 1, this.h - 1); g.lineTo(x0 + arm, this.h - 1);
    g.moveTo(x1 - arm, 1); g.lineTo(x1 - 1, 1); g.lineTo(x1 - 1, this.h - 1); g.lineTo(x1 - arm, this.h - 1);
    g.stroke();
    if (this.head >= 0) { g.fillStyle = C.playhead; g.fillRect(Math.round((this.head - this.view0) * k), 0, 1, this.h); }
  }
}
