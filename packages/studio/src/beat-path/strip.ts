/**
 * The audio strip: the clip's waveform, its beat grid, kick and snare markers, the
 * locked hits brighter, and the playhead. Click or drag to seek.
 */
import type { Track } from "../audio";
import { captureDrag } from "./drag";

export type StripScene = {
  track: Track | null;
  /** Seconds shown: the clip, from its first beat. */
  start: number; end: number;
  beats: number[];
  kicks: number[];
  snares: number[];
  /** Locked hits (seconds), drawn taller. */
  locked: number[];
  /** Muted hits (seconds): drawn hollow, skipped by every lock. */
  muted: number[];
};

export class AudioStrip {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private scene: StripScene = { track: null, start: 0, end: 8, beats: [], kicks: [], snares: [], locked: [], muted: [] };
  private colours: Record<string, string> = {};
  /** Shown over the waveform instead of it (loading, errors). */
  message = "";
  private w = 1; private h = 1; private dpr = 1;
  private head = 0;

  constructor(readonly canvas: HTMLCanvasElement, seek: (seconds: number) => void, toggle: (seconds: number) => void = () => {}) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(), s = this.scene; return s.start + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (s.end - s.start); };
    canvas.addEventListener("pointermove", e => { if (!e.buttons) canvas.style.cursor = this.markerAt(e) === null ? "pointer" : "cell"; });
    canvas.addEventListener("pointerdown", e => {
      // A click on a kick or snare marker switches it off (or back on); anywhere else seeks.
      const hit = this.markerAt(e);
      if (hit !== null) { toggle(hit); return; }
      seek(at(e));
      captureDrag(canvas, e, ev => seek(at(ev)));
    });
    this.retheme();
  }

  retheme() {
    const css = getComputedStyle(document.documentElement);
    for (const k of ["wave", "wave-bg", "beat-line", "bar-line", "kick", "snare", "playhead", "played", "text-muted"]) this.colours[k] = css.getPropertyValue(`--${k}`).trim() || "#888";
    this.resize();
  }

  setScene(scene: StripScene) { this.scene = scene; this.paintBase(); this.draw(); }
  setHead(seconds: number) { this.head = seconds; this.draw(); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    for (const c of [this.canvas, this.base]) { c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr); }
    this.paintBase();
    this.draw();
  }

  /** The kick or snare marker under the pointer (seconds), or null. */
  private markerAt(e: PointerEvent): number | null {
    const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left;
    let best: number | null = null, bd = 5;
    for (const t of [...this.scene.kicks, ...this.scene.snares]) { const d = Math.abs(this.x(t) - px); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  private x(seconds: number) { return (seconds - this.scene.start) / (this.scene.end - this.scene.start) * this.w; }

  private paintBase() {
    const g = this.base.getContext("2d")!, s = this.scene, mid = this.h / 2, C = this.colours;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C["wave-bg"]; g.fillRect(0, 0, this.w, this.h);
    s.beats.forEach((b, i) => { g.fillStyle = i % 4 === 0 ? C["bar-line"] : C["beat-line"]; g.fillRect(Math.round(this.x(b)), 0, 1, this.h); });
    const wave = s.track?.wave;
    if (wave && !this.message) {
      g.fillStyle = C.wave;
      const per = (s.end - s.start) / this.w / wave.bucketSeconds, first = s.start / wave.bucketSeconds;
      for (let px = 0; px < this.w; px++) {
        let lo = 0, hi = 0;
        for (let b = Math.max(0, Math.floor(first + px * per)); b < Math.min(wave.min.length, Math.floor(first + (px + 1) * per) + 1); b++) { lo = Math.min(lo, wave.min[b]); hi = Math.max(hi, wave.max[b]); }
        const top = mid - hi * mid * 0.86, bottom = mid - lo * mid * 0.86;
        g.fillRect(px, top, 1, Math.max(1, bottom - top));
      }
    } else {
      // No track: a time ruler (a tick every half second, seconds labelled).
      g.fillStyle = C["text-muted"]; g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "left";
      if (!this.message) for (let t = Math.ceil(s.start * 2) / 2; t <= s.end; t += 0.5) {
        const x = Math.round(this.x(t)), whole = Math.abs(t - Math.round(t)) < 1e-6;
        g.fillRect(x, this.h - (whole ? 12 : 6), 1, whole ? 12 : 6);
        if (whole) g.fillText(`${Math.round(t - s.start)} s`, x + 3, this.h - 4);
      }
      g.font = "12px system-ui, sans-serif"; g.textAlign = "center";
      g.fillText(this.message || "No track: a plain timed clip · press Demo track, or drop a track here", this.w / 2, mid - 2);
    }
    const mark = (list: number[], colour: string, y0: number, y1: number) => {
      for (const t of list) {
        const x = Math.round(this.x(t));
        if (s.muted.some(m => Math.abs(m - t) < 0.012)) {
          g.globalAlpha = 0.8; g.strokeStyle = colour; g.lineWidth = 1.5;
          g.strokeRect(x - 2.5, y0 + 2, 5, Math.max(4, y1 - y0 - 4));
          g.beginPath(); g.moveTo(x - 3, y0 + 2); g.lineTo(x + 3, y1 - 2); g.stroke();
          continue;
        }
        const on = s.locked.some(l => Math.abs(l - t) < 0.006);
        g.globalAlpha = on ? 1 : 0.45; g.fillStyle = colour;
        g.fillRect(x - 1, on ? 0 : y0, 2, on ? this.h : y1 - y0);
      }
      g.globalAlpha = 1;
    };
    if (this.message) return;
    mark(s.snares, C.snare, this.h * 0.62, this.h);
    mark(s.kicks, C.kick, 0, this.h * 0.38);
  }

  draw() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const x = this.x(this.head);
    g.fillStyle = this.colours.played; g.fillRect(0, 0, x, this.h);
    g.fillStyle = this.colours.playhead; g.fillRect(Math.round(x) - 1, 0, 2, this.h);
  }
}
