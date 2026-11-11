/**
 * Timeline lanes on one canvas, top to bottom, sharing one beat axis and the playhead:
 * phase blocks (hold, fast, move, recover), the move lane, the amplitude-per-step lane,
 * and a graph with the waveform, the energy curve (dashed: the analysed original when it
 * was edited), pose speed, beat ticks and the hit markers.
 */
import { CLIP_ACCENTS, accentSpan, proceduralAccent, type AudioDrive, type HitMarker, type Recipe } from "@motion-studio/core";

export const LANES = { phase: 26, move: 22, steps: 54, graph: 230, gap: 4, markerStrip: 16 } as const;
export const laneTop = {
  phase: 0,
  move: LANES.phase + LANES.gap,
  steps: LANES.phase + LANES.move + LANES.gap * 2,
  graph: LANES.phase + LANES.move + LANES.steps + LANES.gap * 3,
};
export const TIMELINE_HEIGHT = laneTop.graph + LANES.graph;
export const PHASE_COLOURS: Record<string, string> = { hold: "#4a7fd6", fast: "#d9534f", move: "#c8a26b", recover: "#6f9a83" };
const CLIP_COLOURS = ["#5b8def", "#e0895a", "#5fb47a", "#c46fd0", "#d2b84a", "#4fb3c4", "#d0606e", "#8f8f8f"];
export const clipColour = (name: string) => CLIP_COLOURS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CLIP_COLOURS.length];

export type TimelineModel = {
  recipe: Recipe;
  /** Effective drive (edited energy curve applied) and the analysed one. */
  drive?: AudioDrive; analysed?: AudioDrive;
  rms: Float32Array | null; rmsHop: number;
  beat: number;
  markers: HitMarker[];
  phases: (number[] | null)[];
  steps: number[]; division: number;
  selectedMarker: number;
  poseSpeed: Float32Array | null;
  energyEdited: boolean;
  /** Point handles on the energy curve (one per step) when editing points. */
  handles: boolean;
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
  for (const [top, h] of [[laneTop.phase, LANES.phase], [laneTop.move, LANES.move], [laneTop.steps, LANES.steps], [laneTop.graph, LANES.graph]]) lane(top, h);

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
        g.fillStyle = PHASE_COLOURS[p.kind];
        g.globalAlpha = i === m.selectedMarker ? 1 : 0.8;
        g.fillRect(x0, laneTop.phase + 3, Math.max(1, x1 - x0 - 1), LANES.phase - 6);
        g.globalAlpha = 1;
        if (x1 - x0 > 30) { g.fillStyle = "#101114"; g.fillText(p.name, x0 + 3, laneTop.phase + LANES.phase / 2); }
      });
      // The key frame edge.
      g.fillStyle = "#ffffff";
      g.fillRect(X(hb) - 1, laneTop.phase, 2, LANES.phase);
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

  // Move lane: one block per move, named.
  r.moves.forEach((mv, i) => {
    const end = Math.min(r.moves[i + 1]?.atBeat ?? total, total);
    const name = mv.clip ?? mv.name;
    g.fillStyle = clipColour(name);
    g.fillRect(X(mv.atBeat), laneTop.move + 2, X(end) - X(mv.atBeat) - 1, LANES.move - 4);
    g.fillStyle = "#101114";
    g.fillText(name.replace(/_Loop$/, "").replace(/_/g, " "), X(mv.atBeat) + 3, laneTop.move + LANES.move / 2);
  });

  // Amplitude-per-step lane: one bar per step.
  const stepW = w / m.steps.length;
  m.steps.forEach((v, i) => {
    const h = v / 1.5 * (LANES.steps - 6);
    const beat = i * 4 / m.division;
    g.fillStyle = Math.floor(beat) % gb.beatsPerBar === 0 && beat % 1 === 0 ? "#ffd34d" : "#c9a83a";
    g.fillRect(i * stepW + 1, laneTop.steps + LANES.steps - 3 - h, Math.max(1, stepW - 2), h);
  });
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

  // Lane labels and the playhead.
  g.fillStyle = "rgba(231,232,234,0.55)";
  g.textAlign = "right";
  for (const [label, t, h] of [["phases", laneTop.phase, LANES.phase], ["moves", laneTop.move, LANES.move], ["amplitude", laneTop.steps, 12], ["energy · pose speed", laneTop.graph + LANES.markerStrip + 6, 0]] as const) g.fillText(label, w - 4, t + (h ? h / 2 : 0));
  g.textAlign = "left";
  g.fillStyle = "#ffd34d";
  g.fillRect(Math.round(X(m.beat)) - 1, 0, 2, TIMELINE_HEIGHT);
}
