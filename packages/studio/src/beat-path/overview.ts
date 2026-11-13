/**
 * The track overview: the whole track's waveform (analysed once) with the clip's window
 * between two accent brackets, exactly the clip's length; outside the window is dimmed. Drag
 * the window to move it; arrow keys nudge it (a beat with snap on, a frame with it off). The
 * page snaps and clamps (core `sliceStart`); this only draws and reports where it was asked to go.
 */
import type { Track } from "../audio";
import { captureDrag } from "./drag";

export type OverviewHost = {
  /** Move the window's start to `seconds` (the page snaps and clamps); `final` ends a drag (one undo step). */
  move(seconds: number, final: boolean): void;
  /** One nudge: -1 or +1 (a beat, or a frame with snap off). */
  nudge(direction: -1 | 1): void;
};

export class TrackOverview {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private w = 1; private h = 1; private dpr = 1;
  private track: Track | null = null;
  private start = 0; private clip = 8; private head = -1;
  private colours: Record<string, string> = {};

  constructor(readonly canvas: HTMLCanvasElement, private host: OverviewHost) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / Math.max(1, r.width) * this.length(); };
    canvas.addEventListener("pointerdown", e => {
      if (!this.track || e.button !== 0) return;
      e.preventDefault();
      canvas.focus();
      // Grab inside the window keeps the grab point; a click outside centres the window there.
      const t0 = at(e), inside = t0 >= this.start && t0 <= this.start + this.clip, grab = inside ? t0 - this.start : this.clip / 2;
      if (!inside) this.host.move(t0 - grab, false);
      canvas.classList.add("dragging");
      let last = t0 - grab;
      captureDrag(canvas, e, ev => { last = at(ev) - grab; this.host.move(last, false); }, () => { canvas.classList.remove("dragging"); this.host.move(last, true); });
    });
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

  private length() { return this.track?.buffer.duration ?? 1; }
  setTrack(track: Track | null) { this.track = track; this.paintBase(); this.draw(); }
  setWindow(start: number, clip: number) { this.start = start; this.clip = clip; this.draw(); }
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
    const per = this.length() / this.w / wave.bucketSeconds;
    for (let px = 0; px < this.w; px++) {
      let lo = 0, hi = 0;
      for (let b = Math.floor(px * per); b < Math.min(wave.min.length, Math.floor((px + 1) * per) + 1); b++) { lo = Math.min(lo, wave.min[b]); hi = Math.max(hi, wave.max[b]); }
      const top = mid - hi * mid * 0.9, bottom = mid - lo * mid * 0.9;
      g.fillRect(px, top, 1, Math.max(1, bottom - top));
    }
  }

  draw() {
    const g = this.ctx, C = this.colours, k = this.w / this.length();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.track) return;
    const x0 = this.start * k, x1 = (this.start + this.clip) * k;
    // Outside the window is dimmed; the window has accent brackets at both ends.
    g.fillStyle = C.bg; g.globalAlpha = 0.62;
    g.fillRect(0, 0, x0, this.h); g.fillRect(x1, 0, this.w - x1, this.h);
    g.globalAlpha = 1; g.strokeStyle = C.accent; g.lineWidth = 2;
    const arm = 6;
    g.beginPath();
    g.moveTo(x0 + arm, 1); g.lineTo(x0 + 1, 1); g.lineTo(x0 + 1, this.h - 1); g.lineTo(x0 + arm, this.h - 1);
    g.moveTo(x1 - arm, 1); g.lineTo(x1 - 1, 1); g.lineTo(x1 - 1, this.h - 1); g.lineTo(x1 - arm, this.h - 1);
    g.stroke();
    if (this.head >= 0) { g.fillStyle = C.playhead; g.fillRect(Math.round(this.head * k), 0, 1, this.h); }
  }
}
