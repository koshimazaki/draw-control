/**
 * Timeline controller: lane tools, pointer editing on the lanes and the shared playhead.
 * Edits go through the core performance edits, so the timeline, the recipe JSON and an
 * agent all change the same fields: phase boundaries (drag an edge; snapping to beats,
 * subdivisions and, with "snap to hits", onsets; hold Alt to move freely), the move lane
 * (click a beat to paint the chosen clip), the amplitude per step (drag bars), the hit
 * markers (drag, click the marker strip to add, Delete to remove) and the energy curve
 * (draw over it with "Draw energy").
 */
import {
  ACCENT_KEYS, LOOP_CLIPS, MOVE_KEYS, MOVE_LIBRARY, addMarker, beatAtSeconds, clearEnergyCurve, clearSteps, currentMarkers,
  currentSteps, effectiveDrive, insertMove, markerPhases, moveMarker, paintEnergy, removeMarker, removeMove, retimePhase,
  secondsAtBeat, setMarkerAccent, setMoveAtBeat, setStepAmplitude, snapSeconds,
  type AccentKey, type AudioDrive, type MoveKey, type Recipe, type StepDivision,
} from "@motion-studio/core";
import { LANES, TIMELINE_HEIGHT, drawTimeline, laneTop, type TimelineModel } from "./draw";

export const TIMELINE_LAYOUT = `
    <div class="tl-tools">
      <label>Steps <select id="tlDivision"><option value="4">1/4</option><option value="8" selected>1/8</option><option value="16">1/16</option></select></label>
      <label>Paint move <select id="tlBrush"></select></label>
      <label>Accent <select id="tlAccent">${ACCENT_KEYS.map(k => `<option value="${k}">${k}</option>`).join("")}</select></label>
      <label class="check"><input id="tlSnapHits" type="checkbox" /> Snap to hits</label>
      <button id="tlDrawEnergy" type="button" title="Pencil: draw over the energy curve">Pencil</button>
      <button id="tlPoints" type="button" title="Drag one point per step on the energy curve">Points</button>
      <label class="check"><input id="tlSnapSteps" type="checkbox" /> Snap energy to steps</label>
      <button id="tlResetEnergy" type="button">Reset energy</button>
      <button id="tlResetSteps" type="button">Reset steps</button>
      <button id="tlDeleteMarker" type="button">Delete marker</button>
      <span class="muted">Alt: no snapping</span>
    </div>
    <canvas id="strip" class="strip timeline-canvas" style="height:${TIMELINE_HEIGHT}px"></canvas>`;

export type TimelineHost = {
  recipe(): Recipe;
  /** The analysed drive (before any edited energy curve). */
  drive(): AudioDrive | undefined;
  rms(): { rms: Float32Array; hop: number } | null;
  beat(): number;
  poseSpeed(): Float32Array | null;
  edit(fn: (r: Recipe) => Recipe): void;
  seek(beat: number): void;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Timeline {
  private canvas = $<HTMLCanvasElement>("strip");
  private selected = -1;
  private drawing = false;
  private points = false;
  private hover: TimelineModel["hover"] = null;
  private cache: { recipe: Recipe; drive?: AudioDrive; division: number; model: Omit<TimelineModel, "beat" | "selectedMarker" | "poseSpeed" | "handles" | "hover"> } | null = null;

  constructor(private host: TimelineHost) {
    $("tlDrawEnergy").onclick = () => { this.drawing = !this.drawing; if (this.drawing) this.points = false; this.syncModes(); };
    $("tlPoints").onclick = () => { this.points = !this.points; if (this.points) this.drawing = false; this.syncModes(); this.draw(); };
    this.canvas.addEventListener("pointermove", e => { if (!e.buttons) this.hoverAt(e); });
    this.canvas.addEventListener("pointerleave", () => { this.hover = null; this.draw(); });
    $("tlResetEnergy").onclick = () => host.edit(clearEnergyCurve);
    $("tlResetSteps").onclick = () => host.edit(clearSteps);
    $("tlDeleteMarker").onclick = () => this.deleteSelected();
    $("tlDivision").onchange = () => this.draw();
    $("tlAccent").onchange = () => {
      if (this.selected >= 0) host.edit(r => setMarkerAccent(r, host.drive(), this.selected, $<HTMLSelectElement>("tlAccent").value as AccentKey));
    };
    window.addEventListener("keydown", e => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && this.selected >= 0) { e.preventDefault(); this.deleteSelected(); }
    });
    this.canvas.addEventListener("pointerdown", e => this.down(e));
  }

  private syncModes() { $("tlDrawEnergy").classList.toggle("on", this.drawing); $("tlPoints").classList.toggle("on", this.points); }

  /** The value readout under the pointer, in the graph. */
  private hoverAt(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect(), y = e.clientY - rect.top;
    if (y < laneTop.graph) { if (this.hover) { this.hover = null; this.draw(); } return; }
    const r = this.host.recipe(), x = e.clientX - rect.left, beat = x / rect.width * r.durationBeats, seconds = secondsAtBeat(r.beatGrid, beat);
    const d = this.model().drive;
    const energy = d ? d.energy[Math.max(0, Math.min(d.energy.length - 1, Math.round(seconds * d.fps)))] : 0.5;
    this.hover = { x, seconds, beat, energy };
    this.draw();
  }

  private division = () => Number($<HTMLSelectElement>("tlDivision").value) as StepDivision;

  /** Fill the move brush with what the character can play. */
  setBrush(kind: Recipe["character"]["kind"], fileClips: string[]) {
    const options = kind === "rigged" ? Object.keys(LOOP_CLIPS) : kind === "file" ? fileClips : MOVE_KEYS.map(k => k);
    const label = (k: string) => (MOVE_LIBRARY as Record<string, { name: string }>)[k]?.name ?? k.replace(/_Loop$/, "").replace(/_/g, " ");
    $("tlBrush").innerHTML = options.map(k => `<option value="${k}">${label(k)}</option>`).join("") + `<option value="">(erase)</option>`;
  }
  /** The clip or move the brush paints (the move gizmo sets it too). */
  setBrushValue(v: string) { $<HTMLSelectElement>("tlBrush").value = v; }
  selectedMarker() { return this.selected; }

  private model(): TimelineModel {
    const recipe = this.host.recipe(), drive = this.host.drive(), division = this.division();
    if (!this.cache || this.cache.recipe !== recipe || this.cache.drive !== drive || this.cache.division !== division) {
      const markers = currentMarkers(recipe, drive);
      const rms = this.host.rms();
      this.cache = { recipe, drive, division, model: {
        recipe, drive: effectiveDrive(recipe, drive), analysed: drive, rms: rms?.rms ?? null, rmsHop: rms?.hop ?? 1,
        markers, phases: markers.map(m => markerPhases(recipe, m)), steps: currentSteps(recipe, drive, division), division,
        energyEdited: !!recipe.energyCurve,
      } };
      if (this.selected >= markers.length) this.selected = -1;
    }
    return { ...this.cache.model, beat: this.host.beat(), selectedMarker: this.selected, poseSpeed: this.host.poseSpeed(), handles: this.points, hover: this.hover };
  }

  draw() { drawTimeline(this.canvas, this.model()); }

  private deleteSelected() {
    if (this.selected < 0) return;
    const i = this.selected;
    this.selected = -1;
    this.host.edit(r => removeMarker(r, this.host.drive(), i));
  }

  private down(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const recipe = this.host.recipe(), total = recipe.durationBeats, g = recipe.beatGrid;
    const beatAtX = (clientX: number) => Math.max(0, Math.min(total, (clientX - rect.left) / rect.width * total));
    const xOfBeat = (b: number) => b / total * rect.width;
    const y = e.clientY - rect.top, x = e.clientX - rect.left;
    const m = this.model();
    const markerBeat = (i: number) => beatAtSeconds(g, m.markers[i].seconds);
    const snap = (beat: number, ev: PointerEvent) => snapSeconds(this.host.recipe(), this.host.drive(), secondsAtBeat(g, beat),
      { division: this.division(), onsets: $<HTMLInputElement>("tlSnapHits").checked, free: ev.altKey });
    let move: ((ev: PointerEvent) => void) | null = null;

    if (y < laneTop.move) {
      // Phase lane: grab the nearest boundary edge, or select the block's marker.
      let best: { i: number; k: number; d: number } | null = null;
      m.phases.forEach((b, i) => b?.forEach((v, k) => {
        const d = Math.abs(xOfBeat(markerBeat(i) + v) - x);
        if (d < 6 && (!best || d < best.d)) best = { i, k, d };
      }));
      if (best) {
        const { i, k } = best as { i: number; k: number };
        let seconds = m.markers[i].seconds;
        this.selected = i;
        move = ev => {
          const r = this.host.recipe();
          const idx = currentMarkers(r, this.host.drive()).findIndex(mk => Math.abs(mk.seconds - seconds) < 1e-6);
          if (idx < 0) return;
          const t = snap(beatAtX(ev.clientX), ev);
          const rel = beatAtSeconds(r.beatGrid, t) - beatAtSeconds(r.beatGrid, seconds);
          const b = markerPhases(r, currentMarkers(r, this.host.drive())[idx]);
          const isKey = b ? b[k] === 0 : true;
          this.host.edit(rr => retimePhase(rr, this.host.drive(), idx, k, rel));
          if (isKey) seconds = t;
          this.selected = currentMarkers(this.host.recipe(), this.host.drive()).findIndex(mk => Math.abs(mk.seconds - seconds) < 1e-6);
        };
      } else {
        this.selected = m.phases.findIndex((b, i) => !!b && beatAtX(e.clientX) >= markerBeat(i) + b[0] && beatAtX(e.clientX) <= markerBeat(i) + b[b.length - 1]);
        this.syncAccent();
      }
    } else if (y < laneTop.steps) {
      // Move lane: paint the brush on the beat.
      const beat = Math.floor(beatAtX(e.clientX)), v = $<HTMLSelectElement>("tlBrush").value;
      this.host.edit(r => {
        if (r.character.kind === "rigged" || r.character.kind === "file") return setMoveAtBeat(r, beat, v || null);
        const at = r.moves.find(mv => mv.atBeat === beat);
        if (!v) return at ? removeMove(r, { moveId: at.id }) : r;
        return insertMove(at ? removeMove(r, { moveId: at.id }) : r, { move: v as MoveKey, atBeat: beat });
      });
    } else if (y < laneTop.graph) {
      // Amplitude lane: drag the bars.
      const division = this.division();
      move = ev => {
        const yy = ev.clientY - rect.top - laneTop.steps;
        const value = Math.max(0, Math.min(1.5, (LANES.steps - 3 - yy) / (LANES.steps - 6) * 1.5));
        const index = Math.floor(beatAtX(ev.clientX) * division / 4);
        this.host.edit(r => setStepAmplitude(r, { division, index, value, drive: this.host.drive() }));
      };
    } else {
      const inStrip = y < laneTop.graph + LANES.markerStrip;
      const near = m.markers.findIndex((_, i) => Math.abs(xOfBeat(markerBeat(i)) - x) < (inStrip ? 7 : 4));
      const gh = LANES.graph - LANES.markerStrip - 2, top = laneTop.graph + LANES.markerStrip;
      const valueAt = (ev: PointerEvent) => Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top - top) / gh));
      const stepBeats = 4 / this.division();
      if (this.points && !inStrip) {
        // Point handles: drag the step's point; the curve runs straight to its neighbours.
        const i = Math.round(beatAtX(e.clientX) / stepBeats);
        const tAt = (k: number) => secondsAtBeat(g, Math.max(0, Math.min(total, k * stepBeats)));
        const eff = () => this.model().drive;
        const valAt = (k: number) => { const d = eff(); return d ? d.energy[Math.max(0, Math.min(d.energy.length - 1, Math.round(tAt(k) * d.fps)))] : 0.5; };
        move = ev => {
          const v = valueAt(ev), prev = valAt(i - 1), next = valAt(i + 1);
          this.host.edit(r => paintEnergy(paintEnergy(r, this.host.drive(), tAt(i - 1), tAt(i), prev, v), this.host.drive(), tAt(i), tAt(i + 1), v, next));
          this.hoverAt(ev);
        };
      } else if (this.drawing && !inStrip) {
        let last: { t: number; v: number } | null = null;
        const snapSteps = $<HTMLInputElement>("tlSnapSteps").checked;
        move = ev => {
          const b = beatAtX(ev.clientX), t = secondsAtBeat(g, snapSteps ? Math.round(b / stepBeats) * stepBeats : b), v = valueAt(ev);
          const from = last ?? { t, v };
          this.host.edit(r => paintEnergy(r, this.host.drive(), from.t, t, from.v, v));
          last = { t, v };
        };
      } else if (near >= 0) {
        this.selected = near;
        this.syncAccent();
        let seconds = m.markers[near].seconds;
        move = ev => {
          const r = this.host.recipe();
          const idx = currentMarkers(r, this.host.drive()).findIndex(mk => Math.abs(mk.seconds - seconds) < 1e-6);
          if (idx < 0) return;
          const t = snap(beatAtX(ev.clientX), ev);
          if (Math.abs(t - seconds) < 1e-6) return;
          this.host.edit(rr => moveMarker(rr, this.host.drive(), idx, t));
          seconds = t;
          this.selected = currentMarkers(this.host.recipe(), this.host.drive()).findIndex(mk => Math.abs(mk.seconds - seconds) < 1e-6);
        };
      } else if (inStrip && recipe.reactive) {
        const t = snap(beatAtX(e.clientX), e);
        this.host.edit(r => addMarker(r, this.host.drive(), t, $<HTMLSelectElement>("tlAccent").value as AccentKey));
        this.selected = currentMarkers(this.host.recipe(), this.host.drive()).findIndex(mk => Math.abs(mk.seconds - t) < 1e-6);
      } else {
        this.selected = -1;
        this.host.seek(beatAtX(e.clientX));
      }
    }
    this.draw();
    if (!move) return;
    move(e);
    this.canvas.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => { move!(ev); this.draw(); };
    const onUp = () => { this.canvas.removeEventListener("pointermove", onMove); this.canvas.removeEventListener("pointerup", onUp); };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerup", onUp);
  }

  private syncAccent() {
    const mk = this.model().markers[this.selected];
    if (mk) $<HTMLSelectElement>("tlAccent").value = mk.accent;
  }
}
