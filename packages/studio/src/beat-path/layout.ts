/**
 * The page, one screen: a header (name, the example switcher, the open-source link, the API
 * key slot); the map on the left; on the right the preview and, once there is a result, the
 * output beside it (a draggable divider, a swap control), then the shot fields with the
 * reference drops, the model and Generate, and Settings (closed); the music strip and the
 * two lanes along the bottom. The Gallery is below, reached by scrolling.
 */
import { CLIP_CHOICES } from "./script";
import { APP_NAME, REPO_URL, LICENCE } from "./name";
import { MODELS } from "./generate";

const seg = (name: string, values: readonly (string | number)[], labels: Record<string, string>, tip = "") =>
  `<div class="seg" role="radiogroup" data-control="${name}"${tip ? ` aria-label="${tip}"` : ""}>${values.map(v => `<button type="button" role="radio" data-value="${v}">${labels[v]}</button>`).join("")}</div>`;

export const LAYOUT = `
<div class="editor" id="editor">
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span><h1>${APP_NAME}</h1></div>
  ${seg("example", ["0", "1", "2", "own"], { 0: "Example 1", 1: "Example 2", 2: "Example 3", own: "Your own" }, "Example")}
  <div class="top-right">
    <a class="btn ghost" href="#gallery">Gallery</a>
    <a class="btn ghost oss tip-below" href="${REPO_URL}" target="_blank" rel="noopener" data-tip="Open source (${LICENCE}). Runs in your browser with your own Runware key">Get the code ↗</a>
    <div class="key-slot" id="keySlot"><button type="button" class="btn outline key-placeholder tip-below" id="keyButton" data-tip="The key panel mounts here when it is installed (vendor/)"><span class="key-dot" aria-hidden="true"></span>Add your Runware API key</button></div>
  </div>
</header>
<main class="stage">
  <section class="map-pane panel" aria-label="Map">
    <canvas id="map" tabindex="0" aria-label="Map: Edit points moves points, Draw new draws a path"></canvas>
    <div class="map-tools">
      ${seg("tool", ["subject", "camera"], { subject: "Subject path", camera: "Camera path" })}
      ${seg("view", ["top", "side"], { top: "Top", side: "Side" })}
      ${seg("pen", ["edit", "draw"], { edit: "Edit points", draw: "Draw new" })}
    </div>
    <div class="map-tools end">
      <label class="slider" data-tip="From sharp corners (hard turns) to a round curve"><span>Corners</span><input id="corners" type="range" min="0" max="1" step="0.05" /><output id="cornersOut"></output></label>
      <button type="button" id="clearPath" class="btn ghost">Clear</button>
    </div>
    <p class="map-empty" id="mapEmpty" hidden></p>
    <p class="map-hint muted" id="mapHint"></p>
  </section>
  <section class="side">
    <div class="screens" id="screens">
      <div class="screen" id="screenPreview">
        <div class="preview" id="preview">
          <div class="hud mono"><span id="hudBeat">beat 0.0</span><span class="pulse" id="hudPulse"></span><span id="hudLock"></span></div>
          <button type="button" id="bigPlay" class="big-play"><span class="glyph"></span>Play</button>
        </div>
      </div>
      <div class="divider" id="divider" role="separator" aria-orientation="vertical" tabindex="0" hidden data-tip="Drag to resize · double-click resets"></div>
      <div class="screen" id="screenOutput" hidden>
        <div class="output-frame" id="generateSlot"><p id="outputNote" class="muted">Output</p><div class="progress" id="genProgress" hidden><span></span></div></div>
        <button type="button" id="addToGallery" class="btn outline add-gallery" hidden>Add to gallery</button>
        <button type="button" id="swapScreens" class="btn ghost swap" data-tip="Swap the two sides">⇄</button>
      </div>
    </div>
    <div class="compose">
      <div class="row shot">
        <input id="shotSubject" class="field" type="text" maxlength="300" placeholder="Subject" aria-label="Subject" />
        <input id="shotEnvironment" class="field" type="text" maxlength="300" placeholder="Environment" aria-label="Environment" />
        <input id="shotAction" class="field" type="text" maxlength="300" placeholder="Action" aria-label="Action" />
      </div>
      <div class="row">
        <label class="drop" id="dropCharacter" data-tip="A character sheet the model follows"><input type="file" accept="image/*" id="refCharacter" /><span class="drop-thumb" id="thumbCharacter"></span><span>Character</span></label>
        <label class="drop" id="dropEnvironment" data-tip="An environment image the model follows"><input type="file" accept="image/*" id="refEnvironment" /><span class="drop-thumb" id="thumbEnvironment"></span><span>Environment</span></label>
        <p id="shotLegend" class="legend-line muted"></p>
      </div>
      <div class="row">
        ${seg("model", MODELS.map(m => m.id), Object.fromEntries(MODELS.map(m => [m.id, m.label])), "Model")}
        <button type="button" id="runGenerate" class="btn primary run-btn">Generate</button>
        <details class="options" id="settings"><summary class="btn ghost">Settings</summary>
          <div class="options-body panel">
            <div class="opt-row"><span class="lab">Clip</span>${seg("clip", CLIP_CHOICES, { 5: "5 s", 8: "8 s" }, "Clip length")}
              <label class="toggle" data-tip="On: edges snap to beats and hits. Off: they move by single frames"><input id="snap" type="checkbox" checked /><span class="knob"></span>Snap</label></div>
            <div class="opt-row"><span class="lab">Locks</span><button type="button" class="btn outline" id="setCharLock">Character…</button><button type="button" class="btn outline" id="setCamLock">Camera…</button></div>
            <div class="opt-row"><span class="lab">Guide</span><label class="toggle"><input id="gridExport" type="checkbox" checked /><span class="knob"></span>Ground grid</label>
              <label class="pick">Scenery <select id="scenery"><option value="none">None</option><option value="scatter">Scatter</option><option value="street">Street</option><option value="city">City</option></select></label></div>
            <div class="opt-row"><span class="lab">Figure</span><select id="figureShape" aria-label="Figure shape"><option value="glider">Pyramid</option><option value="car">Car</option><option value="flyer">Flyer</option><option value="runner">Runner</option></select>
              <span class="swatches" data-tip="Body and head colours (a prompt can name them)"><input id="figureBody" type="color" aria-label="Figure body colour" /><input id="figureHead" type="color" aria-label="Figure head colour" /></span></div>
            <div class="opt-row"><span class="lab">Guide file</span><button type="button" id="exportGuide" class="btn outline">Download guide (.zip)</button></div>
          </div>
        </details>
      </div>
    </div>
  </section>
</main>
<footer class="dock">
  <div class="transport">
    <button type="button" id="play" class="icon-btn" aria-label="Play"><span class="glyph"></span></button>
    <button type="button" id="sound" class="btn ghost sound" aria-pressed="true" data-tip="Music on or off (the clock keeps running)">Sound on</button>
  </div>
  <div class="audio-src">
    <label class="btn outline file">Your track<input id="trackFile" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" /></label>
    <button type="button" id="removeTrack" class="btn ghost" data-tip="Play without music: a plain timed clip">No music</button>
  </div>
  <div class="timeline">
    <span class="lane-lab">Music</span><div class="wave-wrap" id="waveWrap"><canvas id="wave"></canvas></div>
    <button type="button" class="chip" id="chipCharacter" aria-haspopup="menu" data-tip="The character's lock: what its travel lands on"><span class="chip-name">Character</span><span class="chip-lock" id="chipCharacterLock"></span></button><div class="lane" id="laneCharacter" role="list" aria-label="Character lane"></div>
    <button type="button" class="chip" id="chipCamera" aria-haspopup="menu" data-tip="The camera's lock: its own source, what it does on each hit"><span class="chip-name">Camera</span><span class="chip-lock" id="chipCameraLock"></span></button><div class="lane" id="laneCamera" role="list" aria-label="Camera lane"></div>
  </div>
  <div class="audio-info"><p class="track-row"><span id="trackName">No track</span></p><button type="button" id="resetMarkers" class="link-btn" hidden>Reset markers</button><p class="legend muted"><i class="k"></i>kick <i class="s"></i>snare</p><p id="status" class="status muted" aria-live="polite"></p></div>
</footer>
</div>
<section class="page-section" id="gallery" aria-labelledby="galleryTitle">
  <h2 id="galleryTitle">Gallery</h2>
  <p class="muted">The three examples with their inputs (guide, music, shot description, references) and outputs.</p>
  <div class="gallery-grid" id="gallerySlot"></div>
  <div id="arenaGallerySlot" class="arena-gallery-slot"></div>
</section>
<footer class="site-foot">
  <div class="oss-panel"><strong>Open source.</strong> <a href="${REPO_URL}" target="_blank" rel="noopener">Get the code</a> · ${LICENCE} licence · Runs in your browser with your own Runware key.</div>
  <span class="muted" id="credit">${APP_NAME} · built on Runware · unofficial demo</span>
</footer>
<div class="menu" id="menu" role="menu" hidden></div>
<div class="dialog" id="costDialog" hidden>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="costTitle">
    <strong id="costTitle">Generate with this model?</strong>
    <p id="costText" class="muted" style="margin:0"></p>
    <div class="row"><button type="button" id="costCancel" class="btn ghost">Cancel</button><button type="button" id="costOk" class="btn primary">Generate</button></div>
  </div>
</div>
`;
