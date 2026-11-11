/**
 * Marker inspector under the timeline tools: the feel of the selected accent marker.
 * - Hit harder (0–1): overshoot past the key pose, a deeper squash, a short hold on impact;
 * - Wind-up: the anticipation before the strike, in beats (snapped to the step division,
 *   so it sits on the audio clock) or in whole frames.
 * Shift-dragging an accent's start edge in the phase lane sets the wind-up too.
 */
import {
  CLIP_ACCENTS, anticipationBeats, beatsToFrames, currentMarkers, framesToBeats, setAnticipation, setImpact,
  type AudioDrive, type Recipe,
} from "@motion-studio/core/internal";

export const MARKER_LAYOUT = `
    <div class="tl-tools" id="markerInspector">
      <strong id="miName" class="muted">No marker selected</strong>
      <label title="Overshoot past the key pose, a deeper squash and a short hold on the impact frame">Hit harder
        <input id="miImpact" type="range" min="0" max="1" step="0.05" value="0" disabled /></label><output id="miImpactOut" class="mono">0.00</output>
      <label title="Wind-up before the strike (Shift-drag the accent's start edge in the phase lane)">Wind-up
        <input id="miAntic" type="number" min="0" step="0.25" disabled /></label>
      <select id="miAnticUnit" aria-label="Wind-up unit"><option value="beats">beats</option><option value="frames">frames</option></select>
    </div>`;

export type InspectorHost = {
  recipe(): Recipe;
  drive(): AudioDrive | undefined;
  edit(fn: (r: Recipe) => Recipe): void;
  selected(): number;
  /** Step division of the timeline (4, 8 or 16): wind-up beats snap to 4 / division. */
  division(): number;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Snap a wind-up in beats to the audio clock (the step division), at least one step. */
export const snapWindUp = (beats: number, division: number) => { const step = 4 / division; return Math.max(step, Math.round(beats / step) * step); };

export function bindMarkerInspector(host: InspectorHost) {
  const impact = $<HTMLInputElement>("miImpact"), antic = $<HTMLInputElement>("miAntic"), unit = $<HTMLSelectElement>("miAnticUnit");
  let key = "";
  impact.oninput = () => {
    const i = host.selected();
    $("miImpactOut").textContent = Number(impact.value).toFixed(2);
    if (i >= 0) host.edit(r => setImpact(r, host.drive(), i, Number(impact.value)));
  };
  antic.onchange = () => {
    const i = host.selected(), r = host.recipe(), v = Number(antic.value);
    if (i < 0 || !Number.isFinite(v)) return;
    const beats = unit.value === "frames" ? framesToBeats(Math.round(v), r.beatGrid.bpm) : snapWindUp(v, host.division());
    host.edit(rr => setAnticipation(rr, host.drive(), i, beats));
    key = "";
  };
  unit.onchange = () => { key = ""; sync(); };

  /** Refresh the fields when the recipe, the selection or the unit changed. */
  function sync() {
    const r = host.recipe(), i = host.selected(), m = i >= 0 ? currentMarkers(r, host.drive())[i] : undefined;
    const k = `${i}|${JSON.stringify(m ?? null)}|${unit.value}|${host.division()}|${r.beatGrid.bpm}`;
    if (k === key) return;
    key = k;
    const accent = m && CLIP_ACCENTS[m.accent];
    impact.disabled = antic.disabled = !accent;
    if (!m || !accent) { $("miName").textContent = m ? `${m.accent}: no clip phases` : "No marker selected"; return; }
    $("miName").textContent = `${accent.name} at ${m.seconds.toFixed(2)} s`;
    impact.value = String(m.impact ?? 0);
    $("miImpactOut").textContent = (m.impact ?? 0).toFixed(2);
    const beats = anticipationBeats(r, m);
    antic.disabled = beats === null;
    if (beats !== null) {
      antic.step = unit.value === "frames" ? "1" : String(4 / host.division());
      antic.value = unit.value === "frames" ? String(Math.round(beatsToFrames(beats, r.beatGrid.bpm))) : String(beats);
    }
  }
  return sync;
}
