/** Static page layout. Behaviour lives in app.ts; elements are looked up by id. */
import { DEFAULT_EXPORT_SIZE, EXPORT_SIZES, EXPRESSIONS, MOVE_KEYS, MOVE_LIBRARY, PREVIEW_FPS } from "@motion-studio/core/internal";
import { RIG_LAYOUT } from "./rig-panel";
import { TIMELINE_LAYOUT } from "./timeline/timeline";
import { GIZMO_LAYOUT } from "./move-gizmo";
import { VIEWS, VIEW_LABELS } from "./views";
import { SEQUENCE_LAYOUT } from "./sequence-panel";

const sizeKey = (s: { width: number; height: number }) => `${s.width}x${s.height}`;
const SIZE_OPTIONS = EXPORT_SIZES.map(s => `<option value="${sizeKey(s)}"${s === DEFAULT_EXPORT_SIZE ? " selected" : ""}>${s.label}</option>`).join("")
  + `<option value="custom">Custom…</option>`;

const options = (values: readonly (string | number)[], selected?: string | number) =>
  values.map(v => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("");

export const LAYOUT = `
<header class="bar">
  <strong>Motion Studio</strong>
  <button id="loadDemo" type="button" class="primary" title="A generated drum track and examples/scripts/glide-path.txt: a beat-locked glide with the camera following, then flying its own path">Load demo</button>
  <span class="muted">Drop a track and a character anywhere, or press <em>Load demo</em>. Everything stays in this browser.</span>
</header>
<main class="shell">
  <aside class="side">
    <section>
      <h2>Track</h2>
      <label class="file">Load music <input id="trackFile" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" /></label>
      <p id="trackStatus" class="muted">No track: the preview runs on a clock at 120 BPM.</p>
      <div class="grid3">
        <label>BPM <input id="bpm" type="number" min="40" max="240" step="0.1" /></label>
        <label>Offset s <input id="offset" type="number" min="0" max="60" step="0.01" /></label>
        <label>Per bar <input id="perBar" type="number" min="1" max="16" step="1" /></label>
      </div>
      <div class="grid3">
        <label>Beats <input id="lengthBeats" type="number" min="1" max="512" step="1" /></label>
        <button id="useDetected" type="button" disabled>Use detected</button>
        <button id="fitTrack" type="button" disabled>Fit to track</button>
      </div>
      <label>Track licence <input id="audioLicence" type="text" maxlength="120" value="unspecified" /></label>
    </section>
    <section>
      <h2>Character</h2>
      <select id="character">
        <option value="rigged">Rigged mannequin (clips)</option>
        <option value="mannequin">Procedural mannequin</option>
        <option value="block">Block figure</option>
        <option value="stick">Stick figure (lines and joint dots)</option>
        <option value="blob">Capsule figure (no visible joints)</option>
        <option value="glider">Glider (pyramid and sphere, no limbs)</option>
        <option value="file">Loaded file (GLB / FBX)</option>
      </select>
      <label class="file">Load GLB / FBX <input id="characterFile" type="file" accept=".glb,.gltf,.fbx" /></label>
      <label class="check"><input id="plainMaterial" type="checkbox" checked /> Plain light material on loaded files</label>
      <label>Character licence <input id="characterLicence" type="text" maxlength="120" value="unspecified" /></label>
      <label class="file">Add Mixamo clips (FBX / GLB, animation only) <input id="mixamoFiles" type="file" accept=".fbx,.glb" multiple /></label>
      <button id="mixamoLocal" type="button" hidden>Load local Mixamo clips</button>
      <p id="mixamoStatus" class="muted"></p>
      <p id="characterStatus" class="muted"></p>
      <div id="switchConfirm" class="confirm" role="alert" hidden>
        <p id="switchConfirmText"></p>
        <div class="row"><button id="switchClear" type="button" class="primary">Clear them</button><button id="switchKeep" type="button">Keep them</button></div>
      </div>
    </section>
    <section>
      <h2>Moves</h2>
      <label>Add at beat <input id="cursorBeat" type="number" min="0" step="1" value="0" /></label>
      <div id="palette" class="palette">${MOVE_KEYS.map(k => `<button type="button" data-move="${k}" title="${MOVE_LIBRARY[k].summary}">${MOVE_LIBRARY[k].name}</button>`).join("")}</div>
      <div id="clipPalette" class="palette"></div>
      <div id="selected" class="selected" hidden>
        <div class="row"><strong id="selName"></strong><span id="selBeat" class="muted"></span></div>
        <div class="grid2">
          <label title="Start beat (fractional: on a kick or snare)">Start <input id="selStart" type="number" min="0" step="0.25" /></label>
          <label title="Block length in beats; longer plays the move slower">Length <input id="selLength" type="number" min="0.25" step="0.25" /></label>
          <label title="Playback rate, 0.25–4 (1 = as authored)">Speed <input id="selSpeed" type="number" min="0.25" max="4" step="0.05" /></label>
          <label title="How big the move is: 0 rest, 1 as authored, up to 3">Amplitude <input id="selAmpNum" type="number" min="0" max="3" step="0.05" /></label>
        </div>
        <input id="selAmp" type="range" min="0" max="3" step="0.01" aria-label="Amplitude" />
        <div class="row" title="Beat lock: the move speeds up into each locked hit and slows after it, keeping its length">
          <span class="muted">Lock</span><select id="selLock"><option value="off">off</option><option value="beat">beat</option><option value="kick">kick</option><option value="snare">snare</option><option value="hat">hat</option></select>
          <span class="muted">strength</span><input id="selLockStrength" class="tiny" type="number" min="0" max="1" step="0.05" placeholder="1" />
        </div>
        <div class="row">
          <button id="selOnKick" type="button" title="Start this move on the nearest kick">On nearest kick</button>
          <button id="selOnSnare" type="button" title="Start this move on the nearest snare">On nearest snare</button>
        </div>
        <div class="row">
          <span class="muted">Place on every</span><input id="selEvery" class="tiny" type="number" min="1" max="64" step="1" value="2" />
          <select id="selEveryTarget"><option value="kick">kick</option><option value="snare">snare</option><option value="hat">hat</option></select>
          <button id="selPlaceEvery" type="button" title="Copy this move onto every Nth kick or snare (a gap after each settles to rest when a length is set)">Place</button>
        </div>
        <div class="grid3">
          <label>Preview fps <select id="selFps">${options(PREVIEW_FPS)}</select></label>
          <label title="Crossfade from the move before, in frames (6–24); drag the handle on the move lane too">Blend frames <input id="selBlend" type="number" min="6" max="24" step="1" /></label>
          <label>Expression <select id="selExpr"><option value="">none</option>${options(EXPRESSIONS)}</select></label>
        </div>
        <div class="row">
          <select id="selSwap"><option value="">Swap for…</option>${MOVE_KEYS.map(k => `<option value="${k}">${MOVE_LIBRARY[k].name}</option>`).join("")}</select>
          <button id="selRemove" type="button">Remove</button>
        </div>
      </div>
    </section>
    <section>
      <h2>View</h2>
      <div class="palette" id="views">${VIEWS.map(v => `<button type="button" data-view="${v}">${VIEW_LABELS[v]}</button>`).join("")}</div>
      <div class="grid3">
        <label>Background <select id="background"><option value="grey">Mid grey</option><option value="dark">Dark</option></select></label>
        <label class="check" title="A blocked-out ground grid: 1 m lines, bolder every 4 m"><input id="grid" type="checkbox" /> Floor grid</label>
        <label class="check" title="Render the grid into the exported guide"><input id="gridExport" type="checkbox" /> Grid in export</label>
        <label>Highlight bone <select id="boneSelect"><option value="">none</option></select></label>
      </div>
    </section>
${RIG_LAYOUT}
    <section>
      <h2>Export guide</h2>
      <label>Size <select id="resolution">${SIZE_OPTIONS}</select></label>
      <div id="customSize" class="grid3" hidden>
        <label>Width <input id="customW" type="number" min="16" max="8192" step="2" value="${DEFAULT_EXPORT_SIZE.width}" /></label>
        <label>Height <input id="customH" type="number" min="16" max="8192" step="2" value="${DEFAULT_EXPORT_SIZE.height}" /></label>
      </div>
      <div class="grid3">
        <label>Range in <select id="rangeUnit"><option value="beats">beats</option><option value="seconds">seconds</option></select></label>
        <label>Start <input id="rangeStart" type="number" min="0" step="1" placeholder="0" /></label>
        <label>Length <input id="rangeLength" type="number" min="0" step="1" placeholder="to end" /></label>
      </div>
      <p id="rangeInfo" class="mono"></p>
      <p id="exportWarning" class="warn" hidden></p>
      <button id="export" type="button" class="primary">Export bundle (.zip)</button>
      <progress id="exportProgress" max="1" value="0" hidden></progress>
      <p id="exportStatus" class="muted"></p>
    </section>
${SEQUENCE_LAYOUT}
    <section>
      <details>
        <summary>Command log</summary>
        <p class="muted">Every timeline and panel edit as a core command: paste into <code>motion-studio apply</code> or send over MCP to replay it.</p>
        <textarea id="commandLog" spellcheck="false" rows="8" readonly></textarea>
      </details>
      <details id="scriptPanel" open>
        <summary>Shot script</summary>
        <p class="muted">The Action and Camera tracks as text, one row per block: <code>beats 0-8 | action: run on path | camera: chase | shot: wide</code>. Edit and apply, or let an agent send it (<code>motion-studio script</code>, MCP <code>apply_script</code>).</p>
        <textarea id="shotScript" spellcheck="false" rows="8" class="mono"></textarea>
        <div class="row"><button id="applyScript" type="button">Apply script</button><span id="scriptStatus" class="muted"></span></div>
      </details>
      <details>
        <summary>Recipe JSON</summary>
        <textarea id="recipeJson" spellcheck="false" rows="14"></textarea>
        <div class="row"><button id="applyJson" type="button">Apply</button><span id="jsonStatus" class="muted"></span></div>
      </details>
    </section>
  </aside>
  <section class="stage">
    <div id="viewport" class="viewport"><div id="caption" class="caption"></div>
      <div class="aids" id="aids">
        <button type="button" data-aid="bones" title="Show the skeleton">Bones</button>
        <button type="button" data-aid="xray" title="Translucent mesh">X-ray</button>
        <button type="button" data-aid="onion" title="Ghosts of nearby frames">Onion</button>
        <button type="button" data-aid="arcs" title="Motion trails of hands, feet and head">Arcs</button>
        <button type="button" id="gizmoToggle" title="Preview and swap moves">Moves</button>
      </div>
      ${GIZMO_LAYOUT}
    </div>
    <div class="transport">
      <button id="tStart" type="button" title="Start">⏮</button>
      <button id="prev" type="button" title="Previous frame">◀</button>
      <button id="play" type="button" class="primary">Play</button>
      <button id="next" type="button" title="Next frame">▶</button>
      <button id="tEnd" type="button" title="End">⏭</button>
      <button id="undo" type="button" title="Undo (Cmd-Z)" disabled>Undo</button>
      <button id="redo" type="button" title="Redo (Shift-Cmd-Z)" disabled>Redo</button>
      <select id="rate" title="Playback rate (below 1×: silent slow motion)"><option value="1">1×</option><option value="0.5">½</option><option value="0.25">¼</option><option value="0.1">1/10</option></select>
      <select id="previewFps" title="Preview frame rate (exports are always 24 fps)"><option value="24">24 fps</option><option value="12">12</option><option value="15">15</option><option value="30">30</option><option value="60">60</option></select>
      <span id="readout" class="mono"></span>
    </div>
${TIMELINE_LAYOUT}
  </section>
</main>`;

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
