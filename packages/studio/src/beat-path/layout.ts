/**
 * The page, one screen: a header (name, the example switcher, the open-source link, the API
 * key slot); the map on the left; on the right the preview and, once there is a result, the
 * output beside it (a draggable divider, a swap control), then the shot fields with the
 * reference drops, the model and Generate, and Settings (closed); the music strip and the
 * two lanes along the bottom. The Gallery is below, reached by scrolling.
 */
import { CLIP_SECONDS } from "./script";
import { faderHTML } from "./ui/fader";
import { APP_NAME, REPO_URL, LICENCE } from "./name";
import { MODELS } from "./generate";
import { PLAY_GLYPH } from "./ui/glyph";
import { icon } from "./ui/icons";

const seg = (name: string, values: readonly (string | number)[], labels: Record<string, string>, tip = "") =>
  `<div class="seg${name === "example" ? " seg-fill" : ""}" role="radiogroup" data-control="${name}"${tip ? ` aria-label="${tip}"` : ""}>${values.map(v => `<button type="button" role="radio" data-value="${v}">${labels[v]}</button>`).join("")}</div>`;

/** The header mark: the favicon's drawing (a curved path, two beat ticks, a dot travelling it). */
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#1a1a1a" stroke="#454545"/><path d="M6 23C11 8 21 26 26 9" fill="none" stroke="#afff9f" stroke-width="2.6" stroke-linecap="round"/><path d="M12.2 13.2v6.6M19.6 13.6v6.6" stroke="#afff9f" stroke-width="2" stroke-linecap="round" opacity=".85"/><circle cx="26" cy="9" r="3.4" fill="#afff9f" stroke="#1a1a1a" stroke-width="1.4"/></svg>`;

export const LAYOUT = `
<div class="editor" id="editor">
<header class="top">
  <div class="brand">${MARK}<h1>${APP_NAME}</h1></div>
  ${seg("example", ["0", "1", "2", "own"], { 0: "Example 1", 1: "Example 2", 2: "Example 3", own: "Your own" }, "Example")}
  <div class="top-right">
    <a class="btn ghost" href="#gallery">${icon("gallery")}Gallery</a>
    <a class="btn ghost oss tip-below" href="${REPO_URL}" target="_blank" rel="noopener" data-tip="Open source (${LICENCE}). Runs in your browser with your own Runware key">${icon("code")}Get the code${icon("arrow-up-right", "trail")}</a>
    <div class="runs-slot"><button type="button" class="btn ghost tip-below" id="runsButton" aria-haspopup="true" data-tip="Every generation from this browser, with its task id: a reload never loses one">${icon("history")}Runs<b class="runs-count" id="runsCount"></b></button>
      <div class="runs-pop panel" id="runsPop" hidden><div class="runs-title">Runs <span class="muted">· kept in this browser</span></div><div id="runsList" class="runs-list"></div></div></div>
    <span class="balance tip-below" id="balance" hidden data-tip="Your Runware balance, read with your key"></span>
    <div class="key-slot" id="keySlot"><button type="button" class="btn outline key-placeholder tip-below tip-end" id="keyButton" data-tip="The key panel mounts here when it is installed (vendor/)">${icon("key")}<span class="key-dot" aria-hidden="true"></span><span>Add your Runware API key</span></button></div>
  </div>
</header>
<main class="stage">
  <section class="map-pane panel" aria-label="Map">
    <div class="map-bar map-tools" id="mapTools">
      ${seg("tool", ["subject", "camera", "blocks"], { subject: "Subject", camera: "Camera", blocks: "Blocks" }, "What the map edits: the subject's path, the camera's path, the scenery blocks")}
      ${seg("view", ["top", "side"], { top: "Top", side: "Side" })}
      ${seg("pen", ["edit", "draw"], { edit: "Edit", draw: "Draw new" })}
    </div>
    <div class="map-canvas">
      <canvas id="map" tabindex="0" aria-label="Map: Edit moves points, Draw new draws a path"></canvas>
      <p class="map-empty" id="mapEmpty" hidden></p>
    </div>
    <div class="map-bar map-foot">
      <div class="map-zoom"><button type="button" id="zoomIn" class="btn ghost tip-start" aria-label="Zoom in" data-tip="Zoom in (ctrl/cmd + wheel)">+</button><button type="button" id="zoomOut" class="btn ghost" aria-label="Zoom out">−</button><button type="button" id="zoomFit" class="btn ghost tip-start" data-tip="Frame everything (pan: scroll, middle button, or drag with Space held)">Fit</button></div>
      <p class="map-hint muted" id="mapHint"></p>
      <div class="map-tools end">
        <div class="follow-row" id="followRow" hidden>
          <div class="seg" id="followSide" role="radiogroup" aria-label="Which side of the subject"><button type="button" role="radio" id="followLeft">Left</button><button type="button" role="radio" id="followRight">Right</button></div>
          <label class="pick tip-end" data-tip="Distance from the subject (m)"><span class="word">Dist</span><span class="unit-field"><input id="followDistance" aria-label="Distance from the subject, metres" class="field num" type="number" min="1" max="30" step="0.5" /><i>m</i></span></label>
          <label class="pick tip-end" data-tip="Camera height (m)"><span class="word">Height</span><span class="unit-field"><input id="followHeight" aria-label="Camera height, metres" class="field num" type="number" min="0.2" max="8" step="0.1" /><i>m</i></span></label>
          <label class="pick tip-end" data-tip="Turned around the subject (°)"><span class="word">Angle</span><span class="unit-field"><input id="followAngle" aria-label="Turned around the subject, degrees" class="field num" type="number" min="-180" max="180" step="5" /><i>°</i></span></label>
        </div>
        <label class="pick" id="boxHeightRow" hidden>Height <span class="unit-field"><input id="boxHeight" class="field num" type="number" min="0.2" max="60" step="0.5" /><i>m</i></span></label>
        <label class="slider tip-end" id="cornersRow" data-tip="From sharp corners (hard turns) to a round curve"><span>Corners</span><input id="corners" type="range" min="0" max="1" step="0.05" /><output id="cornersOut"></output></label>
        <button type="button" id="wholeClip" class="btn ghost" hidden data-tip="Your drawn camera path flies the whole clip (one Camera block)">Whole clip</button>
        <button type="button" id="clearPath" class="btn ghost">${icon("trash")}Clear</button>
      </div>
    </div>
  </section>
  <section class="side">
    <div class="screens" id="screens">
      <div class="screen" id="screenPreview">
        <div class="preview" id="preview">
          <div class="hud mono"><span id="hudBeat">beat 0.0</span><span class="pulse" id="hudPulse"></span><span id="hudLock"></span></div>
        </div>
      </div>
      <div class="divider" id="divider" role="separator" aria-orientation="vertical" tabindex="0" hidden data-tip="Drag to resize · double-click resets"></div>
      <div class="screen" id="screenOutput" hidden>
        <div class="output-frame" id="generateSlot"><p id="outputNote" class="muted">Output</p><div class="progress" id="genProgress" hidden><span></span></div></div>
        <div class="screen-actions"><button type="button" id="addToGallery" class="btn overlay" hidden>${icon("plus")}Add to gallery</button><button type="button" id="swapScreens" class="btn overlay swap tip-below tip-end" aria-label="Swap the two sides" data-tip="Swap the two sides">${icon("swap")}</button></div>
      </div>
      <!-- One slim bar over the bottom of the screens: shown while paused and on hover. -->
      <div class="vbar" id="pageTransport">
        <button type="button" id="barPlay" class="play-btn" aria-label="Play">${PLAY_GLYPH}</button>
        <input id="scrub" class="scrub" type="range" min="0" max="1" step="0.0001" value="0" aria-label="Time" />
        <span class="mono" id="transportTime">0.00 / 8.00 s · beat 0.0</span>
      </div>
    </div>
    <div class="compose">
      <div class="row shot">
        <input id="shotSubject" class="field" type="text" maxlength="300" placeholder="Subject" aria-label="Subject" />
        <input id="shotEnvironment" class="field" type="text" maxlength="300" placeholder="Environment" aria-label="Environment" />
        <input id="shotAction" class="field" type="text" maxlength="300" placeholder="Action" aria-label="Action" />
      </div>
      <div class="row">
        <label class="drop" id="dropCharacter" data-tip="A character sheet the model follows"><input type="file" accept="image/*" id="refCharacter" /><span class="drop-thumb" id="thumbCharacter">${icon("image")}</span><span>Character</span><button type="button" class="drop-clear" id="clearCharacter" hidden aria-label="Clear the character image">${icon("x")}</button></label>
        <button type="button" class="btn outline gen-ref tip-start" id="genCharacter" aria-label="Generate a character image" data-tip="Generate a character image with an image model">${icon("sparkles")}</button>
        <label class="drop" id="dropEnvironment" data-tip="An environment image the model follows"><input type="file" accept="image/*" id="refEnvironment" /><span class="drop-thumb" id="thumbEnvironment">${icon("image")}</span><span>Environment</span><button type="button" class="drop-clear" id="clearEnvironment" hidden aria-label="Clear the environment image">${icon("x")}</button></label>
        <button type="button" class="btn outline gen-ref" id="genEnvironment" aria-label="Generate an environment image" data-tip="Generate an environment image with an image model">${icon("sparkles")}</button>
        <p id="shotLegend" class="legend-line muted"></p>
      </div>
      <div class="row">
        ${seg("model", MODELS.map(m => m.id), Object.fromEntries(MODELS.map(m => [m.id, m.label])), "Model")}
        <button type="button" id="runGenerate" class="btn primary run-btn">${icon("zap", "i-run")}${icon("square", "i-stop")}<span class="btn-label">Generate</span></button>
        <details class="options" id="settings"><summary class="btn ghost">${icon("sliders")}Settings${icon("chevron-down", "chev")}</summary>
          <div class="options-body panel">
            <div class="opt-row clip-row"><span class="lab">Clip</span>${faderHTML({ id: "clip", ...CLIP_SECONDS, label: "Clip length, seconds", unit: "s" })}<output id="clipOut" class="fader-out" for="clip"></output></div>
            <p id="clipNote" class="opt-note" hidden></p>
            <div class="opt-row"><span class="lab">Locks</span><button type="button" class="btn outline" id="setCharLock">Character…</button><button type="button" class="btn outline" id="setCamLock">Camera…</button>
              <label class="toggle" data-tip="On: edges snap to beats and hits. Off: they move by single frames"><input id="snap" type="checkbox" checked /><span class="knob"></span>Snap</label></div>
            <div class="opt-row"><span class="lab">Guide</span><label class="toggle"><input id="gridExport" type="checkbox" checked /><span class="knob"></span>Ground grid</label>
              <label class="toggle" data-tip="On: blocks may pass between the camera and the subject (briefly, within the caps). Off: the line of sight stays clear"><input id="sightPasses" type="checkbox" /><span class="knob"></span>Pass in front</label>
              <label class="pick">Scenery <select id="scenery"><option value="none">None</option><option value="scatter">Scatter</option><option value="street">Street</option><option value="city">City</option></select></label></div>
            <div class="opt-row"><span class="lab">Figure</span><select id="figureShape" aria-label="Figure shape"><option value="glider">Pyramid</option><option value="car">Car</option><option value="flyer">Flyer</option><option value="runner">Runner</option></select>
              <span class="swatches" data-tip="Body and head colours (a prompt can name them)"><input id="figureBody" type="color" aria-label="Figure body colour" /><input id="figureHead" type="color" aria-label="Figure head colour" /></span></div>
            <div class="opt-row"><span class="lab">Guide file</span><button type="button" id="exportGuide" class="btn outline">${icon("download")}<span class="btn-label">Download guide (.zip)</span></button></div>
          </div>
        </details>
      </div>
    </div>
  </section>
</main>
<footer class="dock">
  <div class="transport">
    <button type="button" id="play" class="play-btn quiet" aria-label="Play">${PLAY_GLYPH}</button>
    <button type="button" id="sound" class="btn ghost sound" aria-pressed="true" data-tip="Music on or off (the clock keeps running)">Sound on</button>
  </div>
  <div class="audio-src">
    <label class="btn outline file">${icon("music")}Your track<input id="trackFile" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" /></label>
    <button type="button" id="removeTrack" class="btn ghost" data-tip="Play without music: a plain timed clip">${icon("x")}No music</button>
  </div>
  <div class="timeline">
    <label class="lane-lab overview-lab" data-tip="Where the clip starts in the track (seconds); snaps to the beat with Snap on"><input id="sliceStart" class="field num mono" type="number" min="0" step="0.01" aria-label="Clip start in the track, seconds" /></label><div class="overview-wrap"><canvas id="overview" tabindex="0" aria-label="The whole track: drag the bracketed window to choose the clip; arrow keys nudge it"></canvas></div>
    <span class="lane-lab">Music</span><div class="wave-wrap" id="waveWrap"><canvas id="wave"></canvas></div>
    <button type="button" class="chip" id="chipCharacter" aria-haspopup="menu" data-tip="The character's lock: what its travel lands on"><span class="chip-name">Character</span><span class="chip-lock" id="chipCharacterLock"></span></button><div class="lane" id="laneCharacter" role="list" aria-label="Character lane"></div>
    <button type="button" class="chip" id="chipCamera" aria-haspopup="menu" data-tip="The camera's lock: its own source, what it does on each hit"><span class="chip-name">Camera</span><span class="chip-lock" id="chipCameraLock"></span></button><div class="lane" id="laneCamera" role="list" aria-label="Camera lane"></div>
  </div>
  <div class="audio-info"><p class="track-row"><span id="trackName">No track</span></p><button type="button" id="resetMarkers" class="link-act" hidden>Reset markers</button><p class="legend muted" role="radiogroup" aria-label="Kind of marker Alt-click adds"><button type="button" class="kind on" data-band="low" role="radio" data-tip="Kicks in the clip · Alt-click the strip to add one"><i class="k"></i>kick <b id="countLow">0</b></button><button type="button" class="kind" data-band="mid" role="radio" data-tip="Snares in the clip · Alt-click adds one when chosen"><i class="s"></i>snare <b id="countMid">0</b></button><button type="button" class="kind tip-end" data-band="high" role="radio" data-tip="Hats in the clip · Alt-click adds one when chosen"><i class="h"></i>hat <b id="countHigh">0</b></button></p><label class="sens" data-tip="How many hits the locks land on: lower keeps fewer, stronger, spaced hits (a busy arpeggio collapses to its accents). Your own markers always count"><span>Sensitivity</span><input id="sensitivity" type="range" min="0" max="100" step="5" aria-label="Hit sensitivity" /><output id="sensitivityOut" class="mono" for="sensitivity"></output></label><p id="status" class="status muted" aria-live="polite"></p></div>
</footer>
</div>
<section class="page-section" id="gallery" aria-labelledby="galleryTitle">
  <h2 id="galleryTitle">Gallery</h2>
  <p class="muted">Each example in one row: its path, its guide, the references, the shot description, and a clip per model, on one playhead with its music.</p>
  <div class="gallery-rows" id="gallerySlot"></div>
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
    <div class="row"><button type="button" id="costCancel" class="btn">Cancel</button><button type="button" id="costOk" class="btn primary">${icon("zap")}Generate</button></div>
  </div>
</div>
`;
