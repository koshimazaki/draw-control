/**
 * Camera rig and reactive-moves controls. Each control writes the recipe through the
 * validator (the same fields an agent edits in the recipe JSON), and `sync` reads them back.
 */
import {
  CAMERA_MODE_LABELS, DEFAULT_CAMERA, DEFAULT_REACTIVE, cameraTimeline, validateRecipe,
  type AccentKey, type CameraMode, type Recipe,
} from "@motion-studio/core";

const PICKABLE: CameraMode[] = ["orbit", "pushIn", "pullOut", "rise", "lead", "threeQuarter", "side", "chase", "top", "fixed", "path"];
export const ACCENT_SETS: Record<string, { label: string; accents: AccentKey[] }> = {
  dance: { label: "Dance: jump, spin, cross", accents: ["jump", "spin", "cross"] },
  dancePose: { label: "Procedural dance: hit, point, jump, spin", accents: ["hit", "point", "jump", "spin"] },
  ninja: { label: "Ninja: jab, cross, sword, roll, jump", accents: ["jab", "cross", "sword", "roll", "jump"] },
  none: { label: "No accents", accents: [] },
};

export const RIG_LAYOUT = `
    <section>
      <h2>Camera rig</h2>
      <label class="check"><input id="rigOn" type="checkbox" /> Audio-reactive camera (Camera rig view)</label>
      <div id="rigControls" class="rig" hidden>
        <div class="palette" id="rigModes">${PICKABLE.map(m => `<label class="check chip"><input type="checkbox" value="${m}" /> ${CAMERA_MODE_LABELS[m]}</label>`).join("")}</div>
        <label class="check"><input id="rigSequence" type="checkbox" /> One mode at a time, every <input id="rigBeatsEach" type="number" min="1" max="64" step="1" value="8" class="tiny" /> beats</label>
        <label>Audio intensity <input id="rigIntensity" type="range" min="0" max="1" step="0.05" /></label>
        <div class="grid3">
          <label>Orbit °/beat <input id="rigOrbit" type="number" min="-45" max="45" step="1" /></label>
          <label>Distance m <input id="rigDistance" type="number" min="1.5" max="12" step="0.1" /></label>
          <label>Height m <input id="rigHeight" type="number" min="0.2" max="6" step="0.05" /></label>
        </div>
      </div>
      <div class="row"><button id="drawPath" type="button" title="Switches to the top view; click-drag a path around the character">Draw camera path</button><button id="clearPath" type="button">Clear path</button></div>
      <label id="pointHeightRow" hidden>Selected point height m <input id="pointHeight" type="number" min="0.1" max="30" step="0.05" /></label>
      <div class="row camstart"><span class="muted">Start</span><select id="camMoveMode">${PICKABLE.filter(m => m !== "path").map(m => `<option value="${m}">${CAMERA_MODE_LABELS[m]}</option>`).join("")}</select>
        <span class="muted">on</span><select id="camMoveTarget"><option value="snare">snare</option><option value="kick">kick</option><option value="hat">hat</option><option value="beat">beat</option></select>
        <input id="camMoveIndex" class="tiny" type="number" min="0" step="1" value="0" title="Which one (0 = the first)" />
        <span class="muted">for</span><input id="camMoveLen" class="tiny" type="number" min="0.25" step="0.25" value="8" title="Beats" />
        <button id="camMoveGo" type="button">Start</button></div>
      <h2>Floor path</h2>
      <div class="row"><button id="drawWalk" type="button" title="Switches to the top view (the field); click-drag the path the character travels">Draw walk path</button><button id="clearWalk" type="button">Clear walk path</button></div>
      <div class="grid3">
        <label>From beat <input id="walkFrom" type="number" min="0" step="1" value="0" /></label>
        <label>To beat <input id="walkTo" type="number" min="1" step="1" placeholder="end" /></label>
        <label>Gait <select id="walkGait"><option value="">keep moves</option><option value="Walk_Loop">walk (rigged)</option><option value="Jog_Fwd_Loop">jog (rigged)</option><option value="Sprint_Loop">sprint (rigged)</option><option value="walk">walk (procedural)</option><option value="run">run (procedural)</option></select></label>
      </div>
      <label class="check"><input id="showPaths" type="checkbox" checked /> Draw camera and floor paths (top and orbit views)</label>
    </section>
    <section>
      <h2>Reactive moves</h2>
      <label class="check"><input id="reactOn" type="checkbox" /> Moves follow the music (energy, accents on hits)</label>
      <div id="reactControls" class="rig" hidden>
        <label>Energy drive (how strongly loudness sets speed and size) <input id="reactDrive" type="range" min="0" max="1.5" step="0.05" /></label>
        <label>Accents <select id="reactSet">${Object.entries(ACCENT_SETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        <div class="grid3">
          <label>Amplitude <input id="reactAmp" type="range" min="0" max="1" step="0.05" /></label>
          <label>Tempo <input id="reactSpeed" type="range" min="0" max="1" step="0.05" /></label>
          <label>Humanise <input id="reactHuman" type="range" min="0" max="1" step="0.05" /></label>
        </div>
        <div class="grid3">
          <label>Hits on <select id="reactOnWhat"><option value="both">both</option><option value="downbeats">downbeats</option><option value="onsets">onsets</option></select></label>
          <label>Seed <input id="reactSeed" type="number" min="0" step="1" /></label>
          <label>Idle below <input id="reactIdle" type="number" min="0" max="1" step="0.05" /></label>
        </div>
        <label class="check" title="Additive layers on top of the clips (rigged mannequin)"><input id="syncOn" type="checkbox" /> Per-bone sync: body parts move to the music</label>
        <div id="syncControls" class="grid2" hidden>
          <label title="Nods onto every beat, bigger when loud">Head on beats <input id="syncHead" type="range" min="0" max="1" step="0.05" /></label>
          <label title="Shrug on onsets (snares, claps), or the backbeat without a track">Shoulders on hits <input id="syncShoulders" type="range" min="0" max="1" step="0.05" /></label>
          <label title="Pump forward with the shoulders, a frame later">Arms on hits <input id="syncArms" type="range" min="0" max="1" step="0.05" /></label>
          <label title="Drop and sway on each beat, as strong as the kick and bass">Hips on the kick <input id="syncHips" type="range" min="0" max="1" step="0.05" /></label>
        </div>
      </div>
    </section>`;

type Edit = (fn: (r: Recipe) => Recipe) => void;
let getRecipeForPath: (() => Recipe) | null = null;
/** The panel needs the recipe to know whether a drawn path exists (the path mode needs one). */
export const setRecipeSource = (fn: () => Recipe) => { getRecipeForPath = fn; };
/** Local lookup (ui.ts imports this file for its layout, so this file does not import ui.ts). */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const modeBoxes = () => [...$("rigModes").querySelectorAll<HTMLInputElement>("input")];

export function bindRigPanel(edit: Edit, onRigToggle: (on: boolean) => void) {
  const writeCamera = () => edit(r => {
    const r0 = getRecipeForPath?.();
    const modes = modeBoxes().filter(b => b.checked).map(b => b.value as CameraMode).filter(m => m !== "path" || !!r0?.camera?.path);
    const base = r.camera ?? DEFAULT_CAMERA;
    const segments = cameraTimeline(modes, r.durationBeats, { sequence: input("rigSequence").checked, beatsEach: Number(input("rigBeatsEach").value) || 8 });
    if (segments.some(sg => sg.modes.includes("path")) && segments.some(sg => sg.modes.length > 1)) {
      for (const sg of segments) if (sg.modes.includes("path")) sg.modes = ["path"];
    }
    return validateRecipe({ ...r, camera: { ...base, segments,
      intensity: Number(input("rigIntensity").value), orbitDegreesPerBeat: Number(input("rigOrbit").value),
      distance: Number(input("rigDistance").value), height: Number(input("rigHeight").value) } });
  });
  input("rigOn").onchange = () => {
    const on = input("rigOn").checked;
    edit(r => {
      const next = structuredClone(r);
      if (on) next.camera = { ...DEFAULT_CAMERA, segments: [{ fromBeat: 0, toBeat: r.durationBeats, modes: ["orbit"] }] };
      else delete next.camera;
      return validateRecipe(next);
    });
    onRigToggle(on);
  };
  $("rigModes").onchange = writeCamera;
  for (const id of ["rigSequence", "rigBeatsEach", "rigIntensity", "rigOrbit", "rigDistance", "rigHeight"]) input(id).onchange = writeCamera;

  const writeReactive = () => edit(r => validateRecipe({ ...r, reactive: { ...(r.reactive ?? DEFAULT_REACTIVE),
    accents: ACCENT_SETS[$<HTMLSelectElement>("reactSet").value]?.accents ?? [],
    amplitude: Number(input("reactAmp").value), speed: Number(input("reactSpeed").value), humanise: Number(input("reactHuman").value),
    accentOn: $<HTMLSelectElement>("reactOnWhat").value, seed: Math.max(0, Math.round(Number(input("reactSeed").value) || 0)),
    idleBelow: Number(input("reactIdle").value), drive: Number(input("reactDrive").value) } }));
  input("reactOn").onchange = () => edit(r => {
    const next = structuredClone(r);
    if (input("reactOn").checked) next.reactive = { ...DEFAULT_REACTIVE }; else delete next.reactive;
    return validateRecipe(next);
  });
  for (const id of ["reactDrive", "reactSet", "reactAmp", "reactSpeed", "reactHuman", "reactOnWhat", "reactSeed", "reactIdle"]) $(id).onchange = writeReactive;
  const SYNC_IDS = { head: "syncHead", shoulders: "syncShoulders", arms: "syncArms", hips: "syncHips" } as const;
  const writeSync = () => edit(r => {
    if (!r.reactive) return r;
    const next = structuredClone(r);
    if (input("syncOn").checked) next.reactive!.sync = { head: Number(input(SYNC_IDS.head).value), shoulders: Number(input(SYNC_IDS.shoulders).value), arms: Number(input(SYNC_IDS.arms).value), hips: Number(input(SYNC_IDS.hips).value) };
    else delete next.reactive!.sync;
    return validateRecipe(next);
  });
  input("syncOn").onchange = writeSync;   // starts every part at the sliders' middle (0.5)
  for (const id of Object.values(SYNC_IDS)) input(id).oninput = writeSync;
}

/** Read the recipe's rig and reactive fields back into the controls. */
export function syncRigPanel(recipe: Recipe) {
  const c = recipe.camera;
  input("rigOn").checked = !!c;
  $("rigControls").hidden = !c;
  if (c) {
    const used = new Set(c.segments.flatMap(s => s.modes));
    for (const b of modeBoxes()) b.checked = used.has(b.value as CameraMode);
    input("rigSequence").checked = c.segments.length > 1;
    input("rigIntensity").value = String(c.intensity);
    input("rigOrbit").value = String(c.orbitDegreesPerBeat);
    input("rigDistance").value = String(c.distance);
    input("rigHeight").value = String(c.height);
  }
  const r = recipe.reactive;
  input("reactOn").checked = !!r;
  $("reactControls").hidden = !r;
  if (r) {
    const set = Object.entries(ACCENT_SETS).find(([, v]) => v.accents.join() === r.accents.join());
    $<HTMLSelectElement>("reactSet").value = set?.[0] ?? "dance";
    input("reactAmp").value = String(r.amplitude);
    input("reactDrive").value = String(r.drive ?? 1);
    input("reactSpeed").value = String(r.speed);
    input("reactHuman").value = String(r.humanise);
    $<HTMLSelectElement>("reactOnWhat").value = r.accentOn;
    input("reactSeed").value = String(r.seed);
    input("reactIdle").value = String(r.idleBelow);
    input("syncOn").checked = !!r.sync;
    $("syncControls").hidden = !r.sync;
    if (r.sync) { input("syncHead").value = String(r.sync.head); input("syncShoulders").value = String(r.sync.shoulders); input("syncArms").value = String(r.sync.arms); input("syncHips").value = String(r.sync.hips); }
  }
}
