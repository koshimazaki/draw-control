/**
 * Beat strip: which move sits on which beats, with beat and downbeat ticks, phase
 * separators, the track waveform and the playhead. Click to set the playhead and cursor.
 * A minimal stand-in for the MS-3 timeline.
 */
import { timeline, type Recipe } from "@motion-studio/core";

const COLOURS = ["#5b8def", "#e0895a", "#5fb47a", "#c46fd0", "#d2b84a", "#4fb3c4", "#d0606e", "#8f8f8f"];

export type StripModel = { recipe: Recipe; beat: number; cursorBeat: number; selectedId: string | null; waveform: number[] | null; trackBeats: number | null };

export function drawBeatStrip(canvas: HTMLCanvasElement, m: StripModel) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const total = m.recipe.durationBeats;
  const x = (beat: number) => (beat / total) * w;

  if (m.waveform && m.trackBeats) {
    g.fillStyle = "rgba(255,255,255,0.09)";
    const visible = Math.min(1, total / m.trackBeats);
    const n = Math.max(1, Math.round(m.waveform.length * visible));
    for (let i = 0; i < n; i++) {
      const v = m.waveform[i] * (h - 18);
      g.fillRect((i / n) * w, h - 4 - v, w / n - 1, v);
    }
  }
  const top = 16, blockH = h - top - 6;
  timeline(m.recipe).forEach((b, i) => {
    const colour = COLOURS[i % COLOURS.length];
    g.fillStyle = colour + (b.moveId === m.selectedId ? "ee" : "99");
    g.fillRect(x(b.startBeat) + 1, top, x(b.endBeat) - x(b.startBeat) - 2, blockH);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    for (const p of b.phases.slice(1)) { g.beginPath(); g.moveTo(x(p.startBeat) + 0.5, top + blockH * 0.55); g.lineTo(x(p.startBeat) + 0.5, top + blockH); g.stroke(); }
    g.fillStyle = "#101114";
    g.font = "600 11px system-ui, sans-serif";
    g.save();
    g.beginPath(); g.rect(x(b.startBeat), top, x(b.endBeat) - x(b.startBeat) - 3, blockH); g.clip();
    g.fillText(b.name, x(b.startBeat) + 5, top + 14);
    g.restore();
  });
  for (let b = 0; b <= total; b++) {
    const down = b % m.recipe.beatGrid.beatsPerBar === 0;
    g.fillStyle = down ? "#e9e9ea" : "#7d7f84";
    g.fillRect(Math.min(w - 1, x(b)), 0, 1, down ? 12 : 6);
    if (down && b < total) { g.font = "10px system-ui, sans-serif"; g.fillText(String(b), x(b) + 3, 10); }
  }
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(x(m.cursorBeat), top, Math.max(2, x(1) - x(0)), 3);
  g.fillStyle = "#ffd34d";
  g.fillRect(Math.max(0, Math.min(w - 2, x(m.beat))), 0, 2, h);
}

export const beatFromStripX = (canvas: HTMLCanvasElement, clientX: number, total: number) => {
  const r = canvas.getBoundingClientRect();
  return Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total));
};
