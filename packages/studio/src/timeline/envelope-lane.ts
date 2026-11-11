/**
 * Automation lanes, one editor for all of them: the amplitude envelope under the clips
 * (0–3, 1 = the move as authored) and the camera lanes under the camera blocks (distance,
 * height, yaw offset, fov). Each lane is a filled curve with its breakpoints; pencil mode
 * draws freehand (the stroke becomes breakpoints), points mode drags a breakpoint, clicks to
 * add one and Shift-clicks to remove one; snapping follows the timeline's snap target. A
 * camera lane also shows the camera's planned value (dashed), which its points override.
 * Every edit is a core command (drawEnvelope, setEnvelopePoint, removeEnvelopePoint,
 * envelopeFromAudio, clearEnvelope, each with its `lane`), the same an agent sends.
 */
import {
  LANE_SPECS, applyMotionCommand, laneAt, laneEnvelope, secondsAtBeat, snapBeat, beatAtSeconds,
  type CommandContext, type EnvelopeLane, type MotionCommand, type Recipe, type SnapTarget,
} from "@motion-studio/core/internal";

export const ENVELOPE_TOOLS = `
      <span class="muted">Lanes</span>
      <button id="envPencil" type="button" title="Draw on an automation lane freehand">Pencil</button>
      <button id="envPoints" type="button" title="Drag breakpoints; click to add, Shift-click to remove">Points</button>
      <span class="muted">Amplitude</span>
      <select id="envSource" title="Start the envelope from the music"><option value="amplitude">from loudness</option><option value="kick">from kicks</option><option value="snare">from snares</option><option value="hat">from hats</option><option value="peaks">from peaks</option></select>
      <button id="envInit" type="button">Start</button>
      <button id="envClear" type="button" title="Every frame back to 1">Clear</button>
      <span class="muted">Show</span>
      <button class="lane-toggle" data-lane="envelope" type="button" title="Show or hide the amplitude envelope lane">Envelope</button>
      <button class="lane-toggle" data-lane="camDistance" type="button" title="Camera distance lane (overrides the rig where it has points)">Distance</button>
      <button class="lane-toggle" data-lane="camHeight" type="button" title="Camera height lane">Height</button>
      <button class="lane-toggle" data-lane="camYaw" type="button" title="Camera yaw offset lane (adds to the angle)">Yaw</button>
      <button class="lane-toggle" data-lane="camFov" type="button" title="Camera fov lane">FOV</button>
      <select id="laneClearWhich" title="Which camera lane to clear"><option value="distance">distance</option><option value="height">height</option><option value="yaw">yaw</option><option value="fov">fov</option></select>
      <button id="laneClear" type="button" title="Remove the camera lane's points (the rig runs as programmed)">Clear lane</button>
      <span id="envReadout" class="mono readout">&nbsp;</span>`;

/** The value range each lane shows (its stored range can be wider). */
export const LANE_VIEWS: Record<EnvelopeLane, { lo: number; hi: number; colour: string; grid: number }> = {
  amplitude: { lo: 0, hi: 3, colour: "#7bd88f", grid: 0.5 },
  distance: { lo: 0, hi: 12, colour: "#ffa040", grid: 2 },
  height: { lo: 0, hi: 8, colour: "#46c2ff", grid: 1 },
  yaw: { lo: -360, hi: 360, colour: "#c46fd0", grid: 90 },
  fov: { lo: 10, hi: 90, colour: "#d2b84a", grid: 10 },
};
export type LaneHover = { lane: EnvelopeLane; x: number; frame: number; value: number };

const PAD = 4;
const valueY = (lane: EnvelopeLane, top: number, h: number, v: number) => {
  const { lo, hi } = LANE_VIEWS[lane];
  return top + h - PAD - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (h - 2 * PAD);
};
const yValue = (lane: EnvelopeLane, top: number, h: number, y: number) => {
  const { lo, hi } = LANE_VIEWS[lane];
  return Math.max(lo, Math.min(hi, lo + (top + h - PAD - y) / (h - 2 * PAD) * (hi - lo)));
};
const fmt = (lane: EnvelopeLane, v: number) => `${v.toFixed(lane === "yaw" || lane === "fov" ? 1 : 2)}${LANE_SPECS[lane].unit}`;

/** Draw a lane; `reference` is the value without the lane (the camera plan), drawn dashed. */
export function drawEnvelopeLane(g: CanvasRenderingContext2D, w: number, top: number, h: number, r: Recipe, lane: EnvelopeLane, hover: LaneHover | null, showPoints: boolean, reference?: (frame: number) => number) {
  if (h <= 0) return;
  const gb = r.beatGrid, total = r.durationBeats, view = LANE_VIEWS[lane], env = laneEnvelope(r, lane);
  const frameAtX = (x: number) => secondsAtBeat(gb, x / w * total) * r.fps;
  const xAtFrame = (f: number) => ((f / r.fps - gb.offsetSeconds) * gb.bpm / 60) / total * w;
  const rest = LANE_SPECS[lane].rest;
  for (let v = Math.ceil(view.lo / view.grid) * view.grid; v <= view.hi; v += view.grid) {
    g.fillStyle = v === rest ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.06)";
    g.fillRect(0, Math.round(valueY(lane, top, h, v)), w, 1);
  }
  g.fillStyle = "rgba(231,232,234,0.45)";
  g.fillText(String(view.hi), 3, top + 8);
  g.fillText(String(view.lo), 3, top + h - 8);
  if (reference) {
    g.strokeStyle = "rgba(231,232,234,0.4)"; g.setLineDash([4, 3]); g.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = valueY(lane, top, h, reference(frameAtX(x))); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); g.setLineDash([]);
  }
  if (!env) {
    if (rest !== undefined) { g.fillStyle = `${view.colour}59`; g.fillRect(0, Math.round(valueY(lane, top, h, rest)) - 1, w, 2); }
  } else {
    // A camera lane overrides only over its points' span; the amplitude envelope runs everywhere.
    const spanOnly = lane !== "amplitude" && lane !== "yaw";
    const x0 = spanOnly ? Math.max(0, xAtFrame(env.points[0][0])) : 0, x1 = spanOnly ? Math.min(w, xAtFrame(env.points[env.points.length - 1][0])) : w;
    const base = valueY(lane, top, h, Math.max(view.lo, Math.min(view.hi, rest ?? view.lo)));
    g.beginPath(); g.moveTo(x0, base);
    for (let x = x0; x <= x1; x += 1) g.lineTo(x, valueY(lane, top, h, laneAt(env, frameAtX(x), rest)));
    g.lineTo(x1, base); g.closePath();
    g.fillStyle = `${view.colour}38`; g.fill();
    g.strokeStyle = view.colour; g.lineWidth = 2; g.beginPath();
    for (let x = x0; x <= x1; x += 1) { const y = valueY(lane, top, h, laneAt(env, frameAtX(x), rest)); if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); g.lineWidth = 1;
    if (showPoints || env.points.length <= 64) {
      g.fillStyle = view.colour; g.strokeStyle = "#141518";
      for (const [f, v] of env.points) { const x = xAtFrame(f); if (x < -4 || x > w + 4) continue; g.beginPath(); g.arc(x, valueY(lane, top, h, v), showPoints ? 4 : 2.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
  }
  if (hover && hover.lane === lane) {
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(Math.round(hover.x), top, 1, h);
    const label = `frame ${Math.round(hover.frame)} · ${lane} ${fmt(lane, hover.value)}`;
    const tw = g.measureText(label).width, lx = Math.min(w - tw - 8, Math.max(4, hover.x + 8));
    g.fillStyle = "rgba(20,21,24,0.85)"; g.fillRect(lx - 4, top + 3, tw + 8, 15);
    g.fillStyle = "#e7e8ea"; g.fillText(label, lx, top + 10);
  }
  g.fillStyle = "rgba(231,232,234,0.55)"; g.textAlign = "right";
  g.fillText(LANE_SPECS[lane].label, w - 4, top + 8); g.textAlign = "left";
}

export type EnvelopeHost = { recipe(): Recipe; ctx(): CommandContext; edit(fn: (r: Recipe) => Recipe): void; log(c: MotionCommand): void; command(c: MotionCommand): void; redraw(): void; snapTarget(): SnapTarget; toggleLane(lane: string): void };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** The shared tool state (pencil or points) and the toolbar buttons. */
export class EnvelopeTools {
  mode: "pencil" | "points" = "pencil";
  constructor(private host: EnvelopeHost) {
    $("envPencil").onclick = () => { this.mode = "pencil"; this.sync(); };
    $("envPoints").onclick = () => { this.mode = "points"; this.sync(); };
    $("envInit").onclick = () => host.command({ type: "envelopeFromAudio", source: $<HTMLSelectElement>("envSource").value, min: 0.5, max: 2.5 });
    $("envClear").onclick = () => host.command({ type: "clearEnvelope" });
    $("laneClear").onclick = () => host.command({ type: "clearEnvelope", lane: $<HTMLSelectElement>("laneClearWhich").value });
    for (const b of document.querySelectorAll<HTMLButtonElement>(".lane-toggle")) b.onclick = () => host.toggleLane(b.dataset.lane!);
    this.sync(false);
  }
  private sync(redraw = true) {
    $("envPencil").classList.toggle("on", this.mode === "pencil");
    $("envPoints").classList.toggle("on", this.mode === "points");
    if (redraw) this.host.redraw();
  }
  /** Mark the lane toggles that are open. */
  syncToggles(open: ReadonlySet<string>) { for (const b of document.querySelectorAll<HTMLButtonElement>(".lane-toggle")) b.classList.toggle("on", open.has(b.dataset.lane!)); }
}

/** Pointer editing on one lane. */
export class LaneEditor {
  hover: LaneHover | null = null;
  constructor(private host: EnvelopeHost, private tools: EnvelopeTools, readonly lane: EnvelopeLane, private top: () => number, private height: () => number) {}

  /** Frame under the pointer, snapped to the timeline's snap target unless Alt is held. */
  private frameAt(rect: DOMRect, clientX: number, ev?: { altKey: boolean }) {
    const r = this.host.recipe();
    let beat = Math.max(0, Math.min(r.durationBeats, (clientX - rect.left) / rect.width * r.durationBeats));
    if (ev && !ev.altKey && this.tools.mode === "points") beat = snapBeat(r, beat, this.host.snapTarget(), this.host.ctx().bands);
    return secondsAtBeat(r.beatGrid, beat) * r.fps;
  }
  hoverAt(rect: DOMRect, e: PointerEvent | null) {
    if (!e) { this.hover = null; return; }
    const frame = this.frameAt(rect, e.clientX), r = this.host.recipe();
    this.hover = { lane: this.lane, x: e.clientX - rect.left, frame, value: laneAt(laneEnvelope(r, this.lane), frame, LANE_SPECS[this.lane].rest ?? NaN) };
    $("envReadout").textContent = Number.isFinite(this.hover.value) ? `${this.lane} ${fmt(this.lane, this.hover.value)} at frame ${Math.round(frame)} (beat ${beatAtSeconds(r.beatGrid, frame / r.fps).toFixed(2)})` : `${this.lane}: no points (the rig runs as programmed)`;
  }

  /** A press on the lane: returns the drag handler (with `finish` for the command log). */
  down(e: PointerEvent, rect: DOMRect): ((ev: PointerEvent) => void) & { finish(): void } {
    const r0 = this.host.recipe(), ctx = this.host.ctx(), lane = this.lane;
    const step = lane === "yaw" || lane === "fov" ? 10 : 100;
    const val = (ev: PointerEvent) => Math.round(yValue(lane, this.top(), this.height(), ev.clientY - rect.top) * step) / step;
    let last: MotionCommand | null = null;
    const apply = (c: MotionCommand) => { last = c; this.host.edit(() => applyMotionCommand(r0, c, ctx)); };
    const finish = () => { if (last) this.host.log(last); };
    if (this.tools.mode === "points") {
      const pts = laneEnvelope(r0, lane)?.points ?? [];
      const xAt = (f: number) => ((f / r0.fps - r0.beatGrid.offsetSeconds) * r0.beatGrid.bpm / 60) / r0.durationBeats * rect.width + rect.left;
      const near = pts.findIndex(([f, v]) => Math.abs(xAt(f) - e.clientX) < 6 && Math.abs(valueY(lane, this.top(), this.height(), v) + rect.top - e.clientY) < 8);
      if (near >= 0 && e.shiftKey) { apply({ type: "removeEnvelopePoint", index: near, lane }); return Object.assign(() => {}, { finish }); }
      let index = near;
      if (index < 0) {
        const frame = Math.round(this.frameAt(rect, e.clientX, e));
        apply({ type: "setEnvelopePoint", frame, value: val(e), lane });
        index = laneEnvelope(this.host.recipe(), lane)!.points.findIndex(p => p[0] === frame);
      }
      const r1 = this.host.recipe();
      const onMove = (ev: PointerEvent) => {
        const c: MotionCommand = { type: "setEnvelopePoint", index, frame: Math.round(this.frameAt(rect, ev.clientX, ev)), value: val(ev), lane };
        last = c;
        this.host.edit(() => applyMotionCommand(r1, c, ctx));
        this.hoverAt(rect, ev);
      };
      return Object.assign(onMove, { finish });
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
      const env = laneEnvelope(r0, lane), rest = LANE_SPECS[lane].rest ?? v;
      const values = Array.from({ length: end - start + 1 }, (_, k) => Math.round((stroke.get(start + k) ?? laneAt(env, start + k, rest)) * 1000) / 1000);
      apply({ type: "drawEnvelope", startFrame: start, values, lane });
      this.hoverAt(rect, ev);
    };
    return Object.assign(onMove, { finish });
  }
}
