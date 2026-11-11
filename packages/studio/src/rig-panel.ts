/**
 * Camera rig and reactive-moves controls. Each control writes the recipe through the
 * validator (the same fields an agent edits in the recipe JSON), and `sync` reads them back.
 */
import {
  CAMERA_MODE_LABELS, DEFAULT_CAMERA, DEFAULT_REACTIVE, cameraTimeline, validateRecipe,
  type AccentKey, type CameraMode, type Recipe,
} from "@motion-studio/core";

const PICKABLE: CameraMode[] = ["orbit", "pushIn", "pullOut", "rise", "lead", "chase"];
export const ACCENT_SETS: Record<string, { label: string; accents: AccentKey[] }> = {
  dance: { label: "Dance: hit, point, jump, spin", accents: ["hit", "point", "jump", "spin"] },
  ninja: { label: "Ninja: strike, kick, jump", accents: ["strike", "kick", "jump"] },
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
      <label class="check"><input id="showPaths" type="checkbox" checked /> Draw camera and floor paths (top and orbit views)</label>
    </section>
    <section>
      <h2>Reactive moves</h2>
      <label class="check"><input id="reactOn" type="checkbox" /> Moves follow the music (energy, accents on hits)</label>
      <div id="reactControls" class="rig" hidden>
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
      </div>
    </section>`;

type Edit = (fn: (r: Recipe) => Recipe) => void;
/** Local lookup (ui.ts imports this file for its layout, so this file does not import ui.ts). */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const modeBoxes = () => [...$("rigModes").querySelectorAll<HTMLInputElement>("input")];

export function bindRigPanel(edit: Edit, onRigToggle: (on: boolean) => void) {
  const writeCamera = () => edit(r => {
    const modes = modeBoxes().filter(b => b.checked).map(b => b.value as CameraMode);
    const base = r.camera ?? DEFAULT_CAMERA;
    const segments = cameraTimeline(modes, r.durationBeats, { sequence: input("rigSequence").checked, beatsEach: Number(input("rigBeatsEach").value) || 8 });
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
    idleBelow: Number(input("reactIdle").value) } }));
  input("reactOn").onchange = () => edit(r => {
    const next = structuredClone(r);
    if (input("reactOn").checked) next.reactive = { ...DEFAULT_REACTIVE }; else delete next.reactive;
    return validateRecipe(next);
  });
  for (const id of ["reactSet", "reactAmp", "reactSpeed", "reactHuman", "reactOnWhat", "reactSeed", "reactIdle"]) $(id).onchange = writeReactive;
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
    input("reactSpeed").value = String(r.speed);
    input("reactHuman").value = String(r.humanise);
    $<HTMLSelectElement>("reactOnWhat").value = r.accentOn;
    input("reactSeed").value = String(r.seed);
    input("reactIdle").value = String(r.idleBelow);
  }
}
