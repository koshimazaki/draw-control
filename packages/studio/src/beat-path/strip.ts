/**
 * The audio strip: the clip's waveform (the slice of the track), its beat grid, three tick
 * rows for the analysed hits (kick low, snare mid, hat high), the locked hits brighter, your
 * own markers hollow, and the playhead. Click or drag to seek; a click on a detected hit mutes
 * it; Alt-click adds a marker of the chosen kind; drag your marker to move it (select it and
 * Delete removes it).
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
  hats: number[];
  /** Hits added by hand (track seconds), drawn hollow; `selected` is the one Delete removes. */
  added: { band: "low" | "mid" | "high"; seconds: number }[];
  selected: number;
  /** Locked hits (seconds), drawn taller. */
  locked: number[];
  /** Muted hits (seconds): drawn hollow, skipped by every lock. */
  muted: number[];
};

export class AudioStrip {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement("canvas");
  private scene: StripScene = { track: null, start: 0, end: 8, beats: [], kicks: [], snares: [], hats: [], added: [], selected: -1, locked: [], muted: [] };
  private colours: Record<string, string> = {};
  /** Shown over the waveform instead of it (loading, errors). */
  message = "";
  private w = 1; private h = 1; private dpr = 1;
  private head = 0;

  constructor(readonly canvas: HTMLCanvasElement, seek: (seconds: number) => void, toggle: (seconds: number) => void = () => {},
    private markers: { add(seconds: number): void; move(index: number, seconds: number, final: boolean): void; select(index: number): void } = { add() {}, move() {}, select() {} }) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    const at = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(), s = this.scene; return s.start + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (s.end - s.start); };
    canvas.addEventListener("pointermove", e => { if (!e.buttons) canvas.style.cursor = this.addedAt(e) >= 0 ? "grab" : e.altKey ? "copy" : this.markerAt(e) === null ? "pointer" : "cell"; });
    canvas.addEventListener("pointerdown", e => {
      // Alt-click adds your own marker; your marker drags; a click on a detected hit switches it off (or back on); anywhere else seeks.
      if (e.altKey) { this.markers.add(at(e)); return; }
      const own = this.addedAt(e);
      if (own >= 0) {
        this.markers.select(own);
        let moved = false;
        captureDrag(canvas, e, ev => { moved = true; this.markers.move(own, at(ev), false); }, ev => { if (moved) this.markers.move(own, at(ev), true); });
        return;
      }
      this.markers.select(-1);
      const hit = this.markerAt(e);
      if (hit !== null) { toggle(hit); return; }
      seek(at(e));
      captureDrag(canvas, e, ev => seek(at(ev)));
    });
    this.retheme();
  }

  retheme() {
    const css = getComputedStyle(document.documentElement);
    for (const k of ["wave", "wave-bg", "beat-line", "bar-line", "kick", "snare", "hat", "playhead", "played", "text-muted", "accent-ink"]) this.colours[k] = css.getPropertyValue(`--${k}`).trim() || "#888";
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

  /** The detected hit under the pointer (seconds), or null. */
  private markerAt(e: PointerEvent): number | null {
    const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left;
    let best: number | null = null, bd = 5;
    for (const t of [...this.scene.kicks, ...this.scene.snares, ...this.scene.hats]) { const d = Math.abs(this.x(t) - px); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  /** Your own marker under the pointer (index), or -1. */
  private addedAt(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect(), px = e.clientX - r.left;
    let best = -1, bd = 6;
    this.scene.added.forEach((m, i) => { const d = Math.abs(this.x(m.seconds) - px); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** Where a band's tick row sits (fraction of the height): kick on top, snare in the middle, hat at the bottom. */
  static readonly ROWS = { low: [0, 0.34], mid: [0.33, 0.67], high: [0.66, 1] } as const;

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
    const R = AudioStrip.ROWS, colour = { low: C.kick, mid: C.snare, high: C.hat };
    mark(s.kicks, C.kick, R.low[0] * this.h, R.low[1] * this.h);
    mark(s.snares, C.snare, R.mid[0] * this.h, R.mid[1] * this.h);
    mark(s.hats, C.hat, R.high[0] * this.h, R.high[1] * this.h);
    // Your own markers: hollow, in their band's row; the selected one ringed in the accent.
    s.added.forEach((m, i) => {
      if (m.seconds < s.start || m.seconds > s.end) return;
      const x = Math.round(this.x(m.seconds)), [a, b] = R[m.band], y0 = a * this.h + 2, y1 = b * this.h - 2;
      g.globalAlpha = 1; g.lineWidth = 1.6; g.strokeStyle = colour[m.band];
      g.strokeRect(x - 3, y0, 6, y1 - y0);
      if (i === s.selected) { g.strokeStyle = C["accent-ink"]; g.lineWidth = 1.2; g.strokeRect(x - 5, y0 - 2, 10, y1 - y0 + 4); }
    });
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
