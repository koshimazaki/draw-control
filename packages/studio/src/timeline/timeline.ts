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
  CLIP_ACCENTS, setAnticipation, beatsToFrames, blendBeatsOf, playedBoundaries, secondsAtBeat, setMarkerAccent, setMoveAtBeat, setMoveBlend, setStepAmplitude, snapSeconds,
  type AccentKey, type AudioDrive, type MoveKey, type Recipe, type StepDivision,
} from "@motion-studio/core";
import { LANES, TIMELINE_HEIGHT, drawTimeline, laneTop, type TimelineModel } from "./draw";
import { MARKER_LAYOUT, bindMarkerInspector } from "./marker-inspector";
import { closeMenu, deleteFocus, menuFor, showMenu, targetAt, type Focus } from "./focus";

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
${MARKER_LAYOUT}
    <canvas id="strip" class="strip timeline-canvas" style="height:${TIMELINE_HEIGHT}px"></canvas>`;

export type TimelineHost = {
  recipe(): Recipe;
  /** The analysed drive (before any edited energy curve). */
  drive(): AudioDrive | undefined;
  rms(): { rms: Float32Array; hop: number } | null;
  /** The track's waveform for the audio lane. */
  wave?(): { min: Float32Array; max: Float32Array; bucketSeconds: number } | null;
  beat(): number;
  poseSpeed(): Float32Array | null;
  edit(fn: (r: Recipe) => Recipe): void;
  seek(beat: number): void;
  /** A move for an imported clip (Mixamo) at a beat, or null for library clips. */
  importedMove?(clip: string, atBeat: number, recipe: Recipe): Recipe["moves"][number] | null;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Timeline {
  private canvas = $<HTMLCanvasElement>("strip");
  private selected = -1;
  private blendDrag = -1;
  private focus: Focus | null = null;
  private drawing = false;
  private points = false;
  private hover: TimelineModel["hover"] = null;
  private cache: { recipe: Recipe; drive?: AudioDrive; division: number; model: Omit<TimelineModel, "beat" | "selectedMarker" | "selectedBlend" | "focus" | "poseSpeed" | "handles" | "hover"> } | null = null;

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
      if ((e.key === "Delete" || e.key === "Backspace") && this.focus) { e.preventDefault(); this.deleteFocused(e.shiftKey ? "hold" : "close"); }
    });
    this.canvas.addEventListener("pointerdown", e => { if (e.button === 0) this.down(e); });
    this.canvas.addEventListener("contextmenu", e => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect(), m = this.model();
      const f = targetAt(m, e.clientX - rect.left, e.clientY - rect.top, rect.width);
      if (!f) { closeMenu(); return; }
      this.setFocus(f);
      showMenu(e.pageX, e.pageY, menuFor(f, m, fn => { this.focus = null; this.selected = -1; host.edit(fn); this.draw(); }, host.drive(), this.division()));
    });
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
  setBrush(kind: Recipe["character"]["kind"], fileClips: string[], importedClips: string[] = []) {
    const options = kind === "rigged" ? [...Object.keys(LOOP_CLIPS), ...importedClips] : kind === "file" ? fileClips : MOVE_KEYS.map(k => k);
    const label = (k: string) => (MOVE_LIBRARY as Record<string, { name: string }>)[k]?.name ?? k.replace(/_Loop$/, "").replace(/_/g, " ");
    $("tlBrush").innerHTML = options.map(k => `<option value="${k}">${label(k)}</option>`).join("") + `<option value="">(erase)</option>`;
  }
  /** The clip or move the brush paints (the move gizmo sets it too). */
  setBrushValue(v: string) { $<HTMLSelectElement>("tlBrush").value = v; }
  selectedMarker() { return this.selected; }
  /** Focus a move, phase, marker or step (Delete and the context menu act on it). */
  setFocus(f: Focus | null) {
    this.focus = f;
    if (f?.kind === "marker" || f?.kind === "phase") { this.selected = f.marker; this.syncAccent(); }
    this.draw();
  }
  getFocus() { return this.focus; }
  private deleteFocused(mode: "close" | "hold") {
    const f = this.focus;
    if (!f) return;
    this.focus = null;
    this.selected = -1;
    this.host.edit(deleteFocus(f, mode, this.host.drive(), this.division()));
  }

  private model(): TimelineModel {
    const recipe = this.host.recipe(), drive = this.host.drive(), division = this.division();
    if (!this.cache || this.cache.recipe !== recipe || this.cache.drive !== drive || this.cache.division !== division) {
      const markers = currentMarkers(recipe, drive);
      const rms = this.host.rms();
      this.cache = { recipe, drive, division, model: {
        recipe, drive: effectiveDrive(recipe, drive), analysed: drive, rms: rms?.rms ?? null, rmsHop: rms?.hop ?? 1, wave: this.host.wave?.() ?? null,
        markers, phases: markers.map(m => { const b = markerPhases(recipe, m); return b && playedBoundaries(b, m.skip); }), steps: currentSteps(recipe, drive, division), division,
        energyEdited: !!recipe.energyCurve,
      } };
      if (this.selected >= markers.length) this.selected = -1;
      const f = this.focus;
      if (f && (((f.kind === "marker" || f.kind === "phase") && f.marker >= markers.length) || (f.kind === "move" && !recipe.moves.some(mv => mv.id === f.id)))) this.focus = null;
    }
    return { ...this.cache.model, beat: this.host.beat(), selectedMarker: this.selected, selectedBlend: this.blendDrag, focus: this.focus, poseSpeed: this.host.poseSpeed(), handles: this.points, hover: this.hover };
  }

  draw() { drawTimeline(this.canvas, this.model()); this.syncInspector(); }
  private syncInspector = bindMarkerInspector({
    recipe: () => this.host.recipe(), drive: () => this.host.drive(), edit: fn => this.host.edit(fn),
    selected: () => this.selected, division: () => this.division(),
  });

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

    if (y >= laneTop.audio) {
      // Audio lane: seek (scrub while held).
      this.focus = null;
      this.host.seek(beatAtX(e.clientX));
      move = ev => this.host.seek(beatAtX(ev.clientX));
    } else if (y < laneTop.move) {
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
          const strike = CLIP_ACCENTS[currentMarkers(r, this.host.drive())[idx].accent]?.contact ?? 0;
          // Shift on the start edge: scale the whole wind-up instead of moving one boundary.
          if (ev.shiftKey && k === 0 && b && strike > 0) this.host.edit(rr => setAnticipation(rr, this.host.drive(), idx, b[strike] - rel));
          else this.host.edit(rr => retimePhase(rr, this.host.drive(), idx, k, rel));
          if (isKey) seconds = t;
          this.selected = currentMarkers(this.host.recipe(), this.host.drive()).findIndex(mk => Math.abs(mk.seconds - seconds) < 1e-6);
        };
      } else {
        const f = targetAt(m, x, y, rect.width);
        this.selected = f?.kind === "phase" ? f.marker : -1;
        this.focus = f;
        this.syncAccent();
      }
    } else if (y < laneTop.steps && this.blendHandleAt(recipe, x, xOfBeat) > 0) {
      // Move lane: drag a blend handle (the crossfade into a move), in whole frames.
      const i = this.blendHandleAt(recipe, x, xOfBeat), id = recipe.moves[i].id, at = recipe.moves[i].atBeat;
      this.blendDrag = i;
      move = ev => {
        const frames = beatsToFrames(beatAtX(ev.clientX) - at, this.host.recipe().beatGrid.bpm);
        this.host.edit(r => setMoveBlend(r, { moveId: id, frames }));
      };
    } else if (y < laneTop.steps) {
      // Move lane: paint the brush on the beat.
      const beat = Math.floor(beatAtX(e.clientX)), v = $<HTMLSelectElement>("tlBrush").value;
      this.host.edit(r => {
        const own = v ? this.host.importedMove?.(v, beat, r) : null;
        if (own) return insertMove(r, { move: own, atBeat: beat });
        if (r.character.kind === "rigged" || r.character.kind === "file") return setMoveAtBeat(r, beat, v || null);
        const at = r.moves.find(mv => mv.atBeat === beat);
        if (!v) return at ? removeMove(r, { moveId: at.id }) : r;
        return insertMove(at ? removeMove(r, { moveId: at.id }) : r, { move: v as MoveKey, atBeat: beat });
      });
    } else if (y < laneTop.graph) {
      // Amplitude lane: drag the bars.
      const division = this.division();
      this.focus = { kind: "step", index: Math.floor(beatAtX(e.clientX) * division / 4) };
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
        this.focus = { kind: "marker", marker: near };
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
        this.focus = null;
        this.host.seek(beatAtX(e.clientX));
      }
    }
    this.draw();
    if (!move) return;
    move(e);
    this.canvas.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => { move!(ev); this.draw(); };
    const onUp = () => { this.blendDrag = -1; this.draw(); this.canvas.removeEventListener("pointermove", onMove); this.canvas.removeEventListener("pointerup", onUp); };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerup", onUp);
  }

  /** Index of the move whose blend handle is under x (within 5 px), or -1. */
  private blendHandleAt(recipe: Recipe, x: number, xOfBeat: (b: number) => number): number {
    let best = -1, bd = 5;
    recipe.moves.forEach((mv, i) => {
      if (i === 0) return;
      const d = Math.abs(xOfBeat(mv.atBeat + blendBeatsOf(mv, recipe)) - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  private syncAccent() {
    const mk = this.model().markers[this.selected];
    if (mk) $<HTMLSelectElement>("tlAccent").value = mk.accent;
  }
}
