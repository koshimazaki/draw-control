/**
 * The timeline as plain text an agent can read: the grid, the move blocks (start, end,
 * speed, amplitude, gaps), the hit markers, the camera ranges and paths, the walk path,
 * the envelope, and the analysed onsets in beats. Used by `motion-studio describe` and the
 * MCP `describe` tool.
 */
import type { BandAnalysis } from "./audio-bands";
import { beatAtSeconds } from "./beats";
import { exportFrameCount } from "./bundle";
import { moveEndBeat } from "./engine";
import { envelopeValues } from "./envelope";
import { recipeSeconds, type Recipe } from "./recipe";
import { cameraWords } from "./shot-script";

const f2 = (x: number) => (Math.round(x * 100) / 100).toString();
const list = (xs: number[], max = 16) => xs.slice(0, max).map(f2).join(", ") + (xs.length > max ? `, … (${xs.length} in all)` : "");

export function describeRecipe(r: Recipe, bands?: BandAnalysis): string {
  const g = r.beatGrid, out: string[] = [];
  out.push(`Recipe: ${r.durationBeats} beats at ${g.bpm} BPM (${g.beatsPerBar} per bar, first beat at ${g.offsetSeconds} s, ${g.source}); ${f2(recipeSeconds(r))} s, ${exportFrameCount(r)} frames at ${r.fps} fps.`);
  out.push(`Character: ${r.character.kind} (${r.character.name}; licence ${r.character.licence}).${r.audio ? ` Track: ${r.audio.name} (licence ${r.audio.licence}).` : " No track named."}`);
  out.push(`Global energy (amplitude multiplier): ${r.energy}.`);
  out.push(`Moves (${r.moves.length}), as blocks on the move track, in beats:`);
  let cursor = 0;
  r.moves.forEach((m, i) => {
    const end = moveEndBeat(r, i);
    if (m.atBeat > cursor + 1e-6) out.push(`  - rest ${f2(cursor)}–${f2(m.atBeat)}`);
    const amp = m.phases[0]?.amplitude ?? 1;
    out.push(`  ${i + 1}. id ${m.id}: ${m.clip ?? m.name} ${f2(m.atBeat)}–${f2(end)} (${f2(end - m.atBeat)} beats${m.lengthBeats !== undefined ? ", own length" : ", until the next"}), speed ×${f2(m.speed ?? 1)}, amplitude ${f2(amp)}, blend ${f2(m.blendBeats)} beats${m.lock ? `, lock ${m.lock} ${m.strength ?? 1}` : ""}${m.phases.length > 1 ? `, phases ${m.phases.map(p => `${p.name}:${p.pose}`).join(" ")}` : ""}`);
    cursor = end;
  });
  if (cursor < r.durationBeats - 1e-6 && r.moves.length) out.push(`  - rest ${f2(cursor)}–${r.durationBeats}`);
  const rx = r.reactive;
  if (rx) {
    out.push(`Reactive layer: on (energy drive ${rx.drive ?? 1}, amplitude ${rx.amplitude}, tempo ${rx.speed}, humanise ${rx.humanise}, accents ${rx.accents.join(", ") || "none"} on ${rx.accentOn}, seed ${rx.seed}${rx.sync ? `, per-bone sync head ${rx.sync.head} shoulders ${rx.sync.shoulders} arms ${rx.sync.arms} hips ${rx.sync.hips}` : ""}).`);
    if (rx.markers) out.push(`Hit markers (${rx.markers.length}, edited): ${rx.markers.slice(0, 24).map(m => `${m.accent}@${f2(beatAtSeconds(g, m.seconds))}${m.impact ? ` impact ${m.impact}` : ""}`).join(", ")}${rx.markers.length > 24 ? ", …" : ""} (beats).`);
    else out.push("Hit markers: detected from the music (none edited).");
  } else out.push("Reactive layer: off.");
  if (r.steps) out.push(`Amplitude per step: 1/${r.steps.division} lane, ${r.steps.amplitude.length} steps, min ${f2(Math.min(...r.steps.amplitude))} max ${f2(Math.max(...r.steps.amplitude))}.`);
  if (r.energyCurve) out.push(`Energy curve: hand-edited, ${r.energyCurve.values.length} values at ${r.energyCurve.rate}/s.`);
  if (r.envelope) {
    const v = envelopeValues(r.envelope, exportFrameCount(r));
    out.push(`Amplitude envelope: ${r.envelope.points.length} breakpoints; min ${f2(Math.min(...v))}, max ${f2(Math.max(...v))}, mean ${f2(v.reduce((a, b) => a + b, 0) / v.length)}; points [frame, value]: ${r.envelope.points.slice(0, 12).map(p => `[${p[0]}, ${p[1]}]`).join(" ")}${r.envelope.points.length > 12 ? " …" : ""}.`);
  } else out.push("Amplitude envelope: none (every frame 1).");
  const c = r.camera;
  if (c) {
    out.push(`Camera rig: distance ${c.distance} m, height ${c.height} m, fov ${c.fov}°, intensity ${c.intensity}, orbit ${c.orbitDegreesPerBeat}°/beat, start yaw ${c.startYaw}°.`);
    const extra = (s: (typeof c.segments)[number]) => {
      const bits = [s.amount !== undefined || s.to !== undefined || s.from !== undefined || s.lock ? cameraWords(s) : "", s.shot ? `shot ${s.shot}${s.cut ? " cut" : ""}` : ""].filter(Boolean);
      return bits.length ? ` (${bits.join(", ")})` : "";
    };
    out.push(`  ranges: ${c.segments.map(s => `${s.modes.join("+")} ${f2(s.fromBeat)}–${f2(s.toBeat)}${extra(s)}`).join("; ")}${c.path ? `; drawn path ${c.path.length} points` : ""}.`);
  } else out.push("Camera rig: off (fixed views only).");
  const p = r.rootPath;
  if (p.length > 1) {
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    const moving = p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.z !== p[i - 1].z);
    const lock = r.travelLock ? `, travel locked to ${r.travelLock.lock} at strength ${r.travelLock.strength ?? 1}` : "";
    const high = Math.max(...p.map(q => q.y ?? 0));
    out.push(`Walk path${high > 0 ? ` (rises to ${f2(high)} m)` : ""}${lock}: ${p.length} points, travels beats ${f2(moving[1]?.beat ?? p[0].beat)}–${f2(p[p.length - 1].beat)}, ${f2(len)} m from (${f2(p[0].x)}, ${f2(p[0].z)}) to (${f2(p[p.length - 1].x)}, ${f2(p[p.length - 1].z)}).`);
  } else out.push(`Walk path: stands at (${f2(p[0].x)}, ${f2(p[0].z)}), facing ${p[0].yaw}°.`);
  if (r.jumps.length) out.push(`Scheduled jumps: ${r.jumps.map(j => `${f2(j.atBeat)} (${j.height} m)`).join(", ")}.`);
  if (bands) {
    const beats = (l: { seconds: number }[]) => l.map(o => beatAtSeconds(g, o.seconds)).filter(b => b >= 0 && b < r.durationBeats);
    out.push(`Onsets in beats (from the analysis): kicks ${beats(bands.low).length}: ${list(beats(bands.low))}`);
    out.push(`  snares ${beats(bands.mid).length}: ${list(beats(bands.mid))}`);
    out.push(`  hats ${beats(bands.high).length}: ${list(beats(bands.high), 8)}; amplitude peaks ${bands.peaks.length}.`);
  }
  return out.join("\n");
}
