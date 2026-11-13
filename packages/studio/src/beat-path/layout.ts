/** The Beat Path page: map on the left, the camera's view and the few global controls on the right, the track and its two lanes along the bottom. */
import { CLIP_CHOICES } from "./script";
import { APP_NAME } from "./name";

const seg = (name: string, values: readonly (string | number)[], labels: Record<string, string>, tip = "") =>
  `<div class="seg" role="radiogroup" data-control="${name}"${tip ? ` aria-label="${tip}"` : ""}>${values.map(v => `<button type="button" role="radio" data-value="${v}">${labels[v]}</button>`).join("")}</div>`;

export const LAYOUT = `
<div class="editor" id="editor">
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span><h1>${APP_NAME}</h1></div>
  <p class="tag muted">Draw a path, add music: movement and camera lock to the beat.</p>
  <nav class="sections" aria-label="Sections"><a href="#editor">Editor</a><span aria-hidden="true">·</span><a href="#generate">Generate</a><span aria-hidden="true">·</span><a href="#gallery">Gallery</a></nav>
  <div class="top-right">
    <button type="button" id="examples" class="btn ghost" aria-haspopup="menu">Examples</button>
    <button type="button" id="pasteScript" class="btn ghost tip-below" data-tip="The page state is a shot script: paste one (or drop a .txt)">Paste script</button>
    <button type="button" id="copyScript" class="btn ghost tip-below" data-tip="Copy the shot script an agent, the CLI or the MCP server can replay">Copy script</button>
    <a id="openStudio" class="btn ghost tip-below" href="./" data-tip="Saves this as a sequence and opens the full studio">Full studio ↗</a>
    <div class="key-slot" id="keySlot" data-tip="The key panel mounts here"><button type="button" class="btn outline" disabled>Connect Runware key</button></div>
  </div>
</header>
<main class="stage">
  <section class="map-pane panel" aria-label="Map">
    <canvas id="map" tabindex="0" aria-label="Map: drag to draw a path, click to place points, drag a point to move it"></canvas>
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
    <div class="preview" id="preview">
      <div class="hud mono"><span id="hudBeat">beat 0.0</span><span class="pulse" id="hudPulse"></span><span id="hudLock"></span></div>
      <button type="button" id="bigPlay" class="big-play"><span class="glyph"></span>Play</button>
    </div>
    <div class="controls">
      <span class="lab">Clip</span>
      <div class="row">${seg("clip", CLIP_CHOICES, { 5: "5 s", 8: "8 s" })}
        <label class="toggle" data-tip="On: edges snap to beats and hits. Off: they move by single frames (24 fps)"><input id="snap" type="checkbox" checked /><span class="knob"></span>Snap to beats</label>
      </div>
      <span class="lab">Guide</span>
      <div class="row">
        <label class="toggle" data-tip="Draw the ground grid in the exported clip"><input id="gridExport" type="checkbox" checked /><span class="knob"></span>Grid</label>
        <label class="toggle" data-tip="Grey blocks around the scene, clear of both paths: travel and parallax read in every still"><input id="landmarksExport" type="checkbox" checked /><span class="knob"></span>Landmarks in export</label>
        <span class="swatches" data-tip="The figure's colours: body and head (a prompt can name them)"><input id="figureBody" type="color" aria-label="Figure body colour" /><input id="figureHead" type="color" aria-label="Figure head colour" /></span>
        <span class="push-right"></span>
        <button type="button" id="exportGuide" class="btn primary">Export guide</button>
      </div>
      <span class="lab">Shot</span>
      <div class="row shot">
        <input id="shotSubject" class="field" type="text" maxlength="300" placeholder="Subject" aria-label="Subject" />
        <input id="shotEnvironment" class="field" type="text" maxlength="300" placeholder="Environment" aria-label="Environment" />
        <input id="shotAction" class="field" type="text" maxlength="300" placeholder="Action" aria-label="Action" />
      </div>
      <span class="lab"></span>
      <div class="row"><p id="shotLegend" class="legend-line muted"></p><button type="button" id="copyPrompt" class="btn ghost" data-tip="Copy subject, environment, action and the colour legend as one prompt">Copy prompt</button></div>
    </div>
  </section>
</main>
<footer class="dock">
  <div class="transport">
    <button type="button" id="play" class="icon-btn" aria-label="Play"><span class="glyph"></span></button>
    <button type="button" id="sound" class="btn ghost sound" aria-pressed="true" data-tip="Music on or off (the clock keeps running)">Sound on</button>
  </div>
  <div class="audio-src">
    <button type="button" id="demoTrack" class="btn outline">Demo track</button>
    <label class="btn outline file">Your track<input id="trackFile" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" /></label>
  </div>
  <div class="timeline">
    <span class="lane-lab">Music</span><div class="wave-wrap" id="waveWrap"><canvas id="wave"></canvas></div>
    <button type="button" class="chip" id="chipCharacter" aria-haspopup="menu" data-tip="The character's lock: what its travel lands on"><span class="chip-name">Character</span><span class="chip-lock" id="chipCharacterLock"></span></button><div class="lane" id="laneCharacter" role="list" aria-label="Character lane"></div>
    <button type="button" class="chip" id="chipCamera" aria-haspopup="menu" data-tip="The camera's lock: its own source, what it does on each hit"><span class="chip-name">Camera</span><span class="chip-lock" id="chipCameraLock"></span></button><div class="lane" id="laneCamera" role="list" aria-label="Camera lane"></div>
  </div>
  <div class="audio-info"><p class="track-row"><span id="trackName">No track</span><button type="button" id="removeTrack" class="link-btn" hidden data-tip="Play without music: a plain timed clip">Remove</button></p><button type="button" id="resetMarkers" class="link-btn" hidden>Reset markers</button><p class="legend muted"><i class="k"></i>kick <i class="s"></i>snare</p><p id="status" class="status muted" aria-live="polite"></p></div>
</footer>
</div>
<section class="page-section" id="generate" aria-labelledby="generateTitle">
  <h2 id="generateTitle">Generate</h2>
  <p class="muted">Turn the guide into a video with a model. The generate panel mounts here (it reads the guide and its shot description from this page).</p>
  <div class="placeholder" id="generateSlot"><span class="placeholder-mark" aria-hidden="true"></span><p><strong>Coming here:</strong> pick a model, check the prompt built from the shot description, generate. Until then, <em>Export guide</em> downloads the same bundle.</p></div>
</section>
<section class="page-section" id="gallery" aria-labelledby="galleryTitle">
  <h2 id="galleryTitle">Gallery</h2>
  <p class="muted">Generated clips next to their guides.</p>
  <div class="placeholder" id="gallerySlot"><span class="placeholder-mark" aria-hidden="true"></span><p><strong>Coming here:</strong> a player for each clip with its guide, script and prompt.</p></div>
</section>
<footer class="site-foot"><span>${APP_NAME}</span><span class="muted" id="credit"></span></footer>
<div class="menu" id="menu" role="menu" hidden></div>
<div class="dialog" id="pasteDialog" hidden>
  <div class="panel" role="dialog" aria-label="Paste a shot script">
    <strong>Paste a shot script</strong>
    <p class="muted" style="margin:0">One row per block: <span class="mono">beats 0-9 | action: walk on path (0,0) (4,0) corners 0.5 lock kick 1 | camera: follow behind</span>. A .txt file dropped on the page loads too.</p>
    <textarea id="pasteText" spellcheck="false"></textarea>
    <div class="row"><p class="err" id="pasteError"></p><button type="button" id="pasteCancel" class="btn ghost">Cancel</button><button type="button" id="pasteApply" class="btn primary">Apply</button></div>
  </div>
</div>
`;
