/**
 * The audio lane: the track's waveform (min and max per pixel) on the timeline's beat
 * axis, beat and downbeat ticks with bar numbers, and the drum-band onsets as markers
 * coloured per band (kick red at the bottom, snare yellow in the middle, hat cyan at the
 * top), each as tall as its strength. Amplitude peaks are small white dots on the top edge.
 */
import type { BandAnalysis, Recipe } from "@motion-studio/core/internal";

export const BAND_COLOURS = { low: "#ff5a5a", mid: "#ffd34d", high: "#4fd1e8" } as const;
export const BAND_LABELS = { low: "kick", mid: "snare", high: "hat" } as const;
export type Wave = { min: Float32Array; max: Float32Array; bucketSeconds: number };

export function drawAudioLane(g: CanvasRenderingContext2D, w: number, top: number, h: number, r: Recipe, wave: Wave | null, bands: BandAnalysis | undefined) {
  const total = r.durationBeats, gb = r.beatGrid;
  const secAtX = (x: number) => gb.offsetSeconds + x / w * total * 60 / gb.bpm;
  const xAtSec = (s: number) => (s - gb.offsetSeconds) * gb.bpm / 60 / total * w;
  g.fillStyle = "#16181b";
  g.fillRect(0, top, w, h);
  const mid = top + h / 2;
  if (wave) {
    g.fillStyle = "rgba(150,170,200,0.65)";
    for (let x = 0; x < w; x++) {
      const i = Math.max(0, Math.floor(secAtX(x) / wave.bucketSeconds)), j = Math.max(i + 1, Math.floor(secAtX(x + 1) / wave.bucketSeconds));
      let lo = 0, hi = 0;
      for (let k = i; k < j && k < wave.max.length; k++) { if (wave.min[k] < lo) lo = wave.min[k]; if (wave.max[k] > hi) hi = wave.max[k]; }
      const y0 = mid - hi * (h / 2 - 2), y1 = mid - lo * (h / 2 - 2);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  } else {
    g.fillStyle = "rgba(231,232,234,0.4)";
    g.fillText("no track: drop a music file to see its waveform, kicks, snares and hats", 6, mid);
  }
  // Beat ticks (short) and downbeats (tall, with the bar number).
  for (let b = 0; b <= total; b++) {
    const x = Math.round(b / total * w), down = b % gb.beatsPerBar === 0;
    g.fillStyle = down ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)";
    g.fillRect(x, top + h - (down ? 14 : 6), 1, down ? 14 : 6);
    if (down && w / total * gb.beatsPerBar > 26) { g.fillStyle = "rgba(255,255,255,0.6)"; g.fillText(String(b / gb.beatsPerBar + 1), x + 3, top + h - 8); }
  }
  if (!bands) return;
  const rows = { high: [top + 2, h / 3 - 2], mid: [top + h / 3, h / 3 - 2], low: [top + 2 * h / 3, h / 3 - 2] } as const;
  for (const band of ["low", "mid", "high"] as const) {
    const [y0, rh] = rows[band];
    g.fillStyle = BAND_COLOURS[band];
    for (const o of bands[band]) {
      const x = xAtSec(o.seconds);
      if (x < -2 || x > w + 2) continue;
      const mh = Math.max(3, o.strength * rh);
      g.fillRect(Math.round(x) - 1, y0 + rh - mh, 2, mh);
    }
  }
  g.fillStyle = "#ffffff";
  for (const p of bands.peaks) {
    const x = xAtSec(p.seconds);
    if (x >= 0 && x <= w) { g.beginPath(); g.arc(x, top + 3, 1.5 + p.strength, 0, Math.PI * 2); g.fill(); }
  }
  // Legend with counts.
  g.textAlign = "right";
  let lx = w - 4;
  for (const band of ["high", "mid", "low"] as const) {
    const label = `${BAND_LABELS[band]} ${bands[band].length}`;
    g.fillStyle = BAND_COLOURS[band];
    g.fillText(label, lx, top + 10);
    lx -= g.measureText(label).width + 10;
  }
  g.textAlign = "left";
}
