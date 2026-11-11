/**
 * The amplitude envelope lane, under the clips: one value per frame, 0–3 (1 = the move as
 * authored), drawn as a filled curve with its breakpoints. Pencil mode draws freehand (the
 * stroke becomes breakpoints within 0.01 of it); points mode drags a breakpoint, clicks to
 * add one and Shift-clicks to remove one. It can start from the loudness or a band's onsets.
 * Every edit is a core command (drawEnvelope, setEnvelopePoint, removeEnvelopePoint,
 * envelopeFromAudio, clearEnvelope), the same an agent sends.
 */
import { ENVELOPE_MAX, applyMotionCommand, envelopeAt, secondsAtBeat, type CommandContext, type MotionCommand, type Recipe } from "@motion-studio/core";

export const ENVELOPE_TOOLS = `
      <span class="muted">Envelope</span>
      <button id="envPencil" type="button" title="Draw the amplitude envelope freehand (0–3)">Pencil</button>
      <button id="envPoints" type="button" title="Drag breakpoints; click to add, Shift-click to remove">Points</button>
      <select id="envSource" title="Start the envelope from the music"><option value="amplitude">from loudness</option><option value="kick">from kicks</option><option value="snare">from snares</option><option value="hat">from hats</option><option value="peaks">from peaks</option></select>
      <button id="envInit" type="button">Start</button>
      <button id="envClear" type="button" title="Every frame back to 1">Clear</button>
      <span id="envReadout" class="mono"></span>`;

const PAD = 4;
const valueY = (top: number, h: number, v: number) => top + h - PAD - v / ENVELOPE_MAX * (h - 2 * PAD);
const yValue = (top: number, h: number, y: number) => Math.max(0, Math.min(ENVELOPE_MAX, (top + h - PAD - y) / (h - 2 * PAD) * ENVELOPE_MAX));

export function drawEnvelopeLane(g: CanvasRenderingContext2D, w: number, top: number, h: number, r: Recipe, hover: { x: number; frame: number; value: number } | null, showPoints: boolean) {
  const gb = r.beatGrid, total = r.durationBeats;
  const frameAtX = (x: number) => secondsAtBeat(gb, x / w * total) * r.fps;
  const xAtFrame = (f: number) => ((f / r.fps - gb.offsetSeconds) * gb.bpm / 60) / total * w;
  // Grid: every 0.5, with 1 (as authored) brighter.
  for (let v = 0.5; v < ENVELOPE_MAX; v += 0.5) {
    g.fillStyle = v === 1 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.06)";
    g.fillRect(0, Math.round(valueY(top, h, v)), w, 1);
  }
  g.fillStyle = "rgba(231,232,234,0.45)";
  g.fillText("1", 3, valueY(top, h, 1) - 6);
  g.fillText("3", 3, valueY(top, h, 3) + 6);
  if (!r.envelope) {
    g.fillStyle = "rgba(123,216,143,0.35)";
    g.fillRect(0, Math.round(valueY(top, h, 1)) - 1, w, 2);
  } else {
    g.beginPath();
    g.moveTo(0, valueY(top, h, 0));
    for (let x = 0; x <= w; x += 1) g.lineTo(x, valueY(top, h, envelopeAt(r.envelope, frameAtX(x))));
    g.lineTo(w, valueY(top, h, 0));
    g.closePath();
    g.fillStyle = "rgba(123,216,143,0.22)";
    g.fill();
    g.strokeStyle = "#7bd88f"; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= w; x += 1) { const y = valueY(top, h, envelopeAt(r.envelope, frameAtX(x))); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); g.lineWidth = 1;
    if (showPoints || r.envelope.points.length <= 64) {
      g.fillStyle = "#7bd88f"; g.strokeStyle = "#141518";
      for (const [f, v] of r.envelope.points) { const x = xAtFrame(f); if (x < -4 || x > w + 4) continue; g.beginPath(); g.arc(x, valueY(top, h, v), showPoints ? 4 : 2.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
  }
  if (hover) {
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(Math.round(hover.x), top, 1, h);
    const label = `frame ${Math.round(hover.frame)} · envelope ${hover.value.toFixed(2)}`;
    const tw = g.measureText(label).width, lx = Math.min(w - tw - 8, Math.max(4, hover.x + 8));
    g.fillStyle = "rgba(20,21,24,0.85)"; g.fillRect(lx - 4, top + 3, tw + 8, 15);
    g.fillStyle = "#e7e8ea"; g.fillText(label, lx, top + 10);
  }
}

export type EnvelopeHost = { recipe(): Recipe; ctx(): CommandContext; edit(fn: (r: Recipe) => Recipe): void; log(c: MotionCommand): void; command(c: MotionCommand): void; redraw(): void };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class EnvelopeEditor {
  mode: "pencil" | "points" = "pencil";
  hover: { x: number; frame: number; value: number } | null = null;
  constructor(private host: EnvelopeHost, private top: () => number, private height: number) {
    $("envPencil").onclick = () => { this.mode = "pencil"; this.sync(); };
    $("envPoints").onclick = () => { this.mode = "points"; this.sync(); };
    $("envInit").onclick = () => host.command({ type: "envelopeFromAudio", source: $<HTMLSelectElement>("envSource").value, min: 0.5, max: 2.5 });
    $("envClear").onclick = () => host.command({ type: "clearEnvelope" });
    this.sync(false);
  }
  private sync(redraw = true) {
    $("envPencil").classList.toggle("on", this.mode === "pencil");
    $("envPoints").classList.toggle("on", this.mode === "points");
    if (redraw) this.host.redraw();
  }

  private frameAt(rect: DOMRect, clientX: number) {
    const r = this.host.recipe();
    return secondsAtBeat(r.beatGrid, Math.max(0, Math.min(r.durationBeats, (clientX - rect.left) / rect.width * r.durationBeats))) * r.fps;
  }
  hoverAt(rect: DOMRect, e: PointerEvent | null) {
    if (!e) { this.hover = null; return; }
    const frame = this.frameAt(rect, e.clientX);
    this.hover = { x: e.clientX - rect.left, frame, value: envelopeAt(this.host.recipe().envelope, frame) };
    $("envReadout").textContent = `${this.hover.value.toFixed(2)} at frame ${Math.round(frame)}`;
  }

  /** A press on the lane: returns the drag handler (with `finish` for the command log). */
  down(e: PointerEvent, rect: DOMRect): ((ev: PointerEvent) => void) & { finish(): void } {
    const r0 = this.host.recipe(), ctx = this.host.ctx();
    const val = (ev: PointerEvent) => Math.round(yValue(this.top(), this.height, ev.clientY - rect.top) * 100) / 100;
    let last: MotionCommand | null = null;
    const apply = (c: MotionCommand) => { last = c; this.host.edit(() => applyMotionCommand(r0, c, ctx)); };
    if (this.mode === "points") {
      const pts = r0.envelope?.points ?? [];
      const xAt = (f: number) => ((f / r0.fps - r0.beatGrid.offsetSeconds) * r0.beatGrid.bpm / 60) / r0.durationBeats * rect.width + rect.left;
      const near = pts.findIndex(([f, v]) => Math.abs(xAt(f) - e.clientX) < 6 && Math.abs(valueY(this.top(), this.height, v) + rect.top - e.clientY) < 8);
      if (near >= 0 && e.shiftKey) { apply({ type: "removeEnvelopePoint", index: near }); return Object.assign(() => {}, { finish: () => last && this.host.log(last) }); }
      let index = near;
      if (index < 0) {
        const frame = Math.round(this.frameAt(rect, e.clientX));
        apply({ type: "setEnvelopePoint", frame, value: val(e) });
        index = this.host.recipe().envelope!.points.findIndex(p => p[0] === frame);
      }
      const r1 = this.host.recipe();
      const onMove = (ev: PointerEvent) => {
        const c: MotionCommand = { type: "setEnvelopePoint", index, frame: Math.round(this.frameAt(rect, ev.clientX)), value: val(ev) };
        last = c;
        this.host.edit(() => applyMotionCommand(r1, c, ctx));
        this.hoverAt(rect, ev);
      };
      return Object.assign(onMove, { finish: () => last && this.host.log(last) });
    }
    // Pencil: collect one value per frame across the stroke (filling between pointer samples).
    const stroke = new Map<number, number>();
    let prev: { f: number; v: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const f = Math.round(this.frameAt(rect, ev.clientX)), v = val(ev);
      const from = prev ?? { f, v };
      const [a, b] = from.f <= f ? [from, { f, v }] : [{ f, v }, from];
      for (let k = a.f; k <= b.f; k++) stroke.set(k, b.f === a.f ? v : a.v + (b.v - a.v) * (k - a.f) / (b.f - a.f));
      prev = { f, v };
      const keys = [...stroke.keys()], start = Math.min(...keys), end = Math.max(...keys);
      const values = Array.from({ length: end - start + 1 }, (_, k) => Math.round((stroke.get(start + k) ?? envelopeAt(r0.envelope, start + k)) * 1000) / 1000);
      apply({ type: "drawEnvelope", startFrame: start, values });
      this.hoverAt(rect, ev);
    };
    return Object.assign(onMove, { finish: () => last && this.host.log(last) });
  }
}
