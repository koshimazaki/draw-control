/**
 * Timeline lanes on one canvas, top to bottom, sharing one beat axis and the playhead:
 * phase blocks (hold, fast, move, recover), the move lane, the amplitude-per-step lane,
 * and a graph with the waveform, the energy curve (dashed: the analysed original when it
 * was edited), pose speed, beat ticks and the hit markers.
 */
import type { Focus } from "./focus";
import { drawAudioLane, type Wave } from "./audio-lane";
import { drawEnvelopeLane } from "./envelope-lane";
import { CLIP_ACCENTS, accentSpan, beatsToFrames, blendBeatsOf, moveEndBeat, proceduralAccent, type AudioDrive, type HitMarker, type Recipe } from "@motion-studio/core";

export const LANES = { phase: 26, move: 34, envelope: 130, steps: 54, graph: 230, audio: 84, gap: 4, markerStrip: 16 } as const;
const ORDER = ["phase", "move", "envelope", "steps", "graph", "audio"] as const;
/** Top of each lane, in CSS pixels from the canvas top, in ORDER with a gap between lanes. */
export const laneTop = Object.fromEntries(ORDER.map((k, i) => [k, ORDER.slice(0, i).reduce((y, l) => y + LANES[l] + LANES.gap, 0)])) as Record<(typeof ORDER)[number], number>;
export const TIMELINE_HEIGHT = laneTop.audio + LANES.audio;
export const PHASE_COLOURS: Record<string, string> = { hold: "#4a7fd6", fast: "#d9534f", move: "#c8a26b", recover: "#6f9a83" };
const CLIP_COLOURS = ["#5b8def", "#e0895a", "#5fb47a", "#c46fd0", "#d2b84a", "#4fb3c4", "#d0606e", "#8f8f8f"];
export const clipColour = (name: string) => CLIP_COLOURS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CLIP_COLOURS.length];

export type TimelineModel = {
  recipe: Recipe;
  /** Effective drive (edited energy curve applied) and the analysed one. */
  drive?: AudioDrive; analysed?: AudioDrive;
  rms: Float32Array | null; rmsHop: number;
  /** Waveform of the track (min and max per bucket), for the audio lane. */
  wave: Wave | null;
  beat: number;
  markers: HitMarker[];
  phases: (number[] | null)[];
  steps: number[]; division: number;
  selectedMarker: number;
  /** Move index whose blend handle is being dragged (-1: none). */
  selectedBlend: number;
  /** What Delete and the context menu act on. */
  focus: Focus | null;
  poseSpeed: Float32Array | null;
  energyEdited: boolean;
  /** Point handles on the energy curve (one per step) when editing points. */
  handles: boolean;
  /** Envelope lane: the point handles are shown (points mode) and the readout under the pointer. */
  envelopePoints: boolean;
  envelopeHover: { x: number; frame: number; value: number } | null;
  /** Value readout under the pointer. */
  hover: { x: number; seconds: number; beat: number; energy: number } | null;
};

export function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

export function drawTimeline(canvas: HTMLCanvasElement, m: TimelineModel) {
  const { g, w } = setupCanvas(canvas);
  const r = m.recipe, total = r.durationBeats, gb = r.beatGrid;
  const X = (beat: number) => beat / total * w;
  const beatOfSec = (s: number) => (s - gb.offsetSeconds) * gb.bpm / 60;
  g.clearRect(0, 0, w, TIMELINE_HEIGHT);
  g.font = "10px system-ui, sans-serif";
  g.textBaseline = "middle";
  const lane = (top: number, h: number) => { g.fillStyle = "#1c1e22"; g.fillRect(0, top, w, h); };
  for (const [top, h] of [[laneTop.phase, LANES.phase], [laneTop.move, LANES.move], [laneTop.envelope, LANES.envelope], [laneTop.steps, LANES.steps], [laneTop.graph, LANES.graph]]) lane(top, h);

  // Beat and bar grid through every lane.
  for (let b = 0; b <= total; b++) {
    const down = b % gb.beatsPerBar === 0;
    g.fillStyle = down ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)";
    g.fillRect(Math.round(X(b)), 0, 1, TIMELINE_HEIGHT);
  }

  // Phase lane.
  m.markers.forEach((mk, i) => {
    const hb = beatOfSec(mk.seconds), b = m.phases[i];
    const accent = CLIP_ACCENTS[mk.accent];
    if (b && accent) {
      accent.phases.forEach((p, k) => {
        const x0 = X(hb + b[k]), x1 = X(hb + b[k + 1]);
        if (x1 - x0 < 0.5) return;   // deleted (closed up)
        const held = !!mk.hold?.includes(k);
        g.fillStyle = PHASE_COLOURS[p.kind];
        g.globalAlpha = held ? 0.35 : i === m.selectedMarker ? 1 : 0.8;
        g.fillRect(x0, laneTop.phase + 3, Math.max(1, x1 - x0 - 1), LANES.phase - 6);
        g.globalAlpha = 1;
        if (x1 - x0 > 30) { g.fillStyle = held ? "#e7e8ea" : "#101114"; g.fillText(held ? `${p.name} (hold)` : p.name, x0 + 3, laneTop.phase + LANES.phase / 2); }
        if (m.focus?.kind === "phase" && m.focus.marker === i && m.focus.phase === k) {
          g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.strokeRect(x0 + 1, laneTop.phase + 2, Math.max(2, x1 - x0 - 3), LANES.phase - 4); g.lineWidth = 1;
        }
      });
      // The key frame edge, and a red wedge above it for "hit harder".
      g.fillStyle = "#ffffff";
      g.fillRect(X(hb) - 1, laneTop.phase, 2, LANES.phase);
      if (mk.impact) {
        const h = 3 + mk.impact * (LANES.phase - 6);
        g.fillStyle = "#ff4d4d";
        g.beginPath(); g.moveTo(X(hb) - 5, laneTop.phase); g.lineTo(X(hb) + 5, laneTop.phase); g.lineTo(X(hb), laneTop.phase + h); g.closePath(); g.fill();
      }
    } else {
      const pa = proceduralAccent(mk.accent);
      if (!pa) return;
      const [lo, hi] = accentSpan(pa);
      g.fillStyle = PHASE_COLOURS.fast;
      g.fillRect(X(hb + lo), laneTop.phase + 3, X(hb + hi) - X(hb + lo), LANES.phase - 6);
      g.fillStyle = "#fff";
      g.fillRect(X(hb) - 1, laneTop.phase, 2, LANES.phase);
    }
  });

  // Move lane: one block per move, from its start to its end (a gap rests), with edge grips and its speed.
  r.moves.forEach((mv, i) => {
    const end = moveEndBeat(r, i), x0 = X(mv.atBeat), x1 = X(end);
    const name = mv.clip ?? mv.name;
    g.fillStyle = clipColour(name);
    g.fillRect(x0, laneTop.move + 2, x1 - x0 - 1, LANES.move - 4);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(x0, laneTop.move + 2, 2, LANES.move - 4);
    g.fillRect(x1 - 3, laneTop.move + 2, 2, LANES.move - 4);
    g.fillStyle = "#101114";
    const sp = mv.speed && mv.speed !== 1 ? ` ×${mv.speed.toFixed(2).replace(/\.?0+$/, "")}` : "";
    if (x1 - x0 > 24) g.fillText(name.replace(/_Loop$/, "").replace(/_/g, " ") + sp, x0 + 4, laneTop.move + LANES.move / 2 - 5);
    const amp = mv.phases[0]?.amplitude ?? 1;
    if (x1 - x0 > 40 && amp !== 1) g.fillText(`amp ${amp.toFixed(2)}`, x0 + 4, laneTop.move + LANES.move / 2 + 7);
  });
  const fm = m.focus;
  if (fm?.kind === "move") {
    const i = r.moves.findIndex(v => v.id === fm.id);
    if (i >= 0) {
      const end = moveEndBeat(r, i);
      g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.strokeRect(X(r.moves[i].atBeat) + 1, laneTop.move + 1, X(end) - X(r.moves[i].atBeat) - 3, LANES.move - 2); g.lineWidth = 1;
    }
  }
  // Blend wedges: the crossfade into each move; drag the right edge to change its length.
  r.moves.forEach((mv, i) => {
    if (i === 0) return;
    const bb = blendBeatsOf(mv, r), x0 = X(mv.atBeat), x1 = X(mv.atBeat + bb);
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.beginPath(); g.moveTo(x0, laneTop.move + LANES.move - 2); g.lineTo(x1, laneTop.move + 2); g.lineTo(x0, laneTop.move + 2); g.closePath(); g.fill();
    g.fillStyle = i === m.selectedBlend ? "#ffd34d" : "rgba(255,255,255,0.8)";
    g.fillRect(Math.round(x1) - 1, laneTop.move + 1, 2, LANES.move - 2);
    if (x1 - x0 > 18 || i === m.selectedBlend) { g.fillStyle = "#101114"; g.fillText(`${Math.round(beatsToFrames(bb, r.beatGrid.bpm))}f`, x1 + 3, laneTop.move + LANES.move - 6); }
  });

  // Amplitude-per-step lane: one bar per step.
  const stepW = w / m.steps.length;
  m.steps.forEach((v, i) => {
    const h = v / 1.5 * (LANES.steps - 6);
    const beat = i * 4 / m.division;
    g.fillStyle = Math.floor(beat) % gb.beatsPerBar === 0 && beat % 1 === 0 ? "#ffd34d" : "#c9a83a";
    g.fillRect(i * stepW + 1, laneTop.steps + LANES.steps - 3 - h, Math.max(1, stepW - 2), h);
  });
  if (m.focus?.kind === "step") { g.strokeStyle = "#ffffff"; g.strokeRect(m.focus.index * stepW + 0.5, laneTop.steps + 0.5, Math.max(2, stepW - 1), LANES.steps - 1); }
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(0, laneTop.steps + LANES.steps - 3 - (LANES.steps - 6) / 1.5, w, 1); // amplitude 1

  // Graph: waveform, energy, analysed original (dashed), pose speed.
  const top = laneTop.graph + LANES.markerStrip, gh = LANES.graph - LANES.markerStrip - 2;
  const secAtX = (x: number) => gb.offsetSeconds + x / w * total * 60 / gb.bpm;
  if (m.rms) {
    g.fillStyle = "rgba(160,166,176,0.35)";
    for (let x = 0; x < w; x++) {
      const i = Math.floor(secAtX(x) / m.rmsHop), j = Math.max(i + 1, Math.floor(secAtX(x + 1) / m.rmsHop));
      let p = 0;
      for (let k = i; k < j && k < m.rms.length; k++) p = Math.max(p, m.rms[k]);
      g.fillRect(x, top + gh / 2 - p * gh / 2, 1, Math.max(1, p * gh));
    }
  }
  const curve = (energy: Float32Array, fps: number, colour: string, dash: number[] = [], width = 1.5) => {
    g.strokeStyle = colour; g.lineWidth = width; g.setLineDash(dash); g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const n = Math.min(energy.length - 1, Math.max(0, Math.round(secAtX(x) * fps)));
      const y = top + gh - energy[n] * gh;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke(); g.setLineDash([]);
  };
  if (m.poseSpeed) curve(m.poseSpeed, r.fps / 2, "rgba(79,195,247,0.85)", [], 1.2);
  if (m.energyEdited && m.analysed) curve(m.analysed.energy, m.analysed.fps, "rgba(255,211,77,0.55)", [4, 3], 1);
  if (m.drive) curve(m.drive.energy, m.drive.fps, "#ffd34d", [], 2);

  // Energy grid lines (0.25 steps) and point handles, one per step.
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (const v of [0.25, 0.5, 0.75]) g.fillRect(0, top + gh - v * gh, w, 1);
  if (m.handles && m.drive) {
    const n = Math.round(total * m.division / 4);
    for (let i = 0; i <= n; i++) {
      const beat = i * 4 / m.division, s = gb.offsetSeconds + beat * 60 / gb.bpm;
      const e = m.drive.energy[Math.min(m.drive.energy.length - 1, Math.round(s * m.drive.fps))];
      g.fillStyle = "#ffd34d"; g.strokeStyle = "#141518";
      g.beginPath(); g.arc(X(beat), top + gh - e * gh, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
  if (m.hover) {
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(Math.round(m.hover.x), top, 1, gh);
    const label = `${m.hover.seconds.toFixed(2)} s · beat ${m.hover.beat.toFixed(2)} · energy ${m.hover.energy.toFixed(2)}`;
    g.font = "11px ui-monospace, Menlo, monospace";
    const tw = g.measureText(label).width;
    const lx = Math.min(w - tw - 8, Math.max(4, m.hover.x + 8));
    g.fillStyle = "rgba(20,21,24,0.85)"; g.fillRect(lx - 4, top + 4, tw + 8, 16);
    g.fillStyle = "#e7e8ea"; g.fillText(label, lx, top + 12);
    g.font = "10px system-ui, sans-serif";
  }

  // Hit markers.
  m.markers.forEach((mk, i) => {
    const x = X(beatOfSec(mk.seconds));
    const colour = mk.source === "manual" ? "#7bd88f" : mk.source === "downbeat" ? "#ffffff" : "#ff9a4d";
    g.fillStyle = colour;
    g.globalAlpha = i === m.selectedMarker ? 1 : 0.75;
    g.fillRect(Math.round(x), laneTop.graph + LANES.markerStrip, 1, LANES.graph - LANES.markerStrip);
    g.beginPath(); g.moveTo(x - 5, laneTop.graph + 1); g.lineTo(x + 5, laneTop.graph + 1); g.lineTo(x, laneTop.graph + LANES.markerStrip - 1); g.closePath(); g.fill();
    g.globalAlpha = 1;
    if (i === m.selectedMarker) { g.strokeStyle = "#fff"; g.strokeRect(x - 6, laneTop.graph, 12, LANES.markerStrip); }
  });

  drawAudioLane(g, w, laneTop.audio, LANES.audio, r, m.wave, m.analysed?.bands);
  drawEnvelopeLane(g, w, laneTop.envelope, LANES.envelope, r, m.envelopeHover, m.envelopePoints);

  // Lane labels and the playhead.
  g.fillStyle = "rgba(231,232,234,0.55)";
  g.textAlign = "right";
  for (const [label, t, h] of [["phases", laneTop.phase, LANES.phase], ["moves", laneTop.move, LANES.move], ["amplitude envelope 0–3", laneTop.envelope, 12], ["amplitude per step", laneTop.steps, 12], ["energy · pose speed", laneTop.graph + LANES.markerStrip + 6, 0]] as const) g.fillText(label, w - 4, t + (h ? h / 2 : 0));
  g.textAlign = "left";
  g.fillStyle = "#ffd34d";
  g.fillRect(Math.round(X(m.beat)) - 1, 0, 2, TIMELINE_HEIGHT);
}
