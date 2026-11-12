/** The Beat Path page: map on the left, the camera's view and the few global controls on the right, the track and its two lanes along the bottom. */
import { CLIP_CHOICES, HIT_CHOICES, LABELS, LOCK_CHOICES } from "./script";

const seg = (name: string, values: readonly (string | number)[], labels: Record<string, string>, tip = "") =>
  `<div class="seg" role="radiogroup" data-control="${name}"${tip ? ` aria-label="${tip}"` : ""}>${values.map(v => `<button type="button" role="radio" data-value="${v}">${labels[v]}</button>`).join("")}</div>`;

export const LAYOUT = `
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span><h1>Beat Path</h1></div>
  <p class="tag muted">Draw a path, add music: the movement and the camera lock to the beat.</p>
  <div class="top-right">
    <button type="button" id="examples" class="btn ghost" aria-haspopup="menu">Examples</button>
    <a id="openStudio" class="btn ghost tip-below" href="./" data-tip="Saves this as the sequence “Beat Path” and opens the full studio">Full studio ↗</a>
    <span class="credit muted" id="credit"></span>
  </div>
</header>
<main class="stage">
  <section class="map-pane panel" aria-label="Map">
    <canvas id="map" tabindex="0" aria-label="Map: drag to draw a path, click to place points, drag a point to move it"></canvas>
    <div class="map-tools">
      ${seg("tool", ["subject", "camera"], { subject: "Subject path", camera: "Camera path" })}
      ${seg("view", ["top", "side"], { top: "Top", side: "Side" })}
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
      <span class="lab">Lock to</span>
      <div class="row">${seg("lock", LOCK_CHOICES, LABELS.lock)}
        <label class="slider" data-tip="0 travels steadily, 1 arrives exactly on each hit"><span>Strength</span><input id="strength" type="range" min="0" max="1" step="0.05" /><output id="strengthOut"></output></label>
      </div>
      <span class="lab">On each hit</span>
      <div class="row">${seg("hit", HIT_CHOICES, LABELS.hit)}
        <span class="push-right"></span>${seg("clip", CLIP_CHOICES, { 5: "5 s", 8: "8 s" })}
      </div>
      <span class="lab">Guide</span>
      <div class="row">
        <label class="toggle" data-tip="Draw the ground grid in the exported clip"><input id="gridExport" type="checkbox" checked /><span class="knob"></span>Grid in export</label>
        <span class="push-right"></span>
        <button type="button" id="pasteScript" class="btn outline">Paste script</button>
        <button type="button" id="copyScript" class="btn outline">Copy script</button>
        <button type="button" id="exportGuide" class="btn primary">Export guide</button>
      </div>
      <span class="lab">Prompt</span>
      <div class="row prompt"><p id="prompt" class="prompt-text"></p><button type="button" id="copyPrompt" class="btn ghost">Copy</button></div>
    </div>
  </section>
</main>
<footer class="dock">
  <button type="button" id="play" class="icon-btn" aria-label="Play"><span class="glyph"></span></button>
  <div class="audio-src">
    <button type="button" id="demoTrack" class="btn outline">Demo track</button>
    <label class="btn outline file">Your track<input id="trackFile" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" /></label>
  </div>
  <div class="timeline">
    <span class="lane-lab">Music</span><div class="wave-wrap" id="waveWrap"><canvas id="wave"></canvas></div>
    <span class="lane-lab">Character</span><div class="lane" id="laneCharacter" role="list" aria-label="Character lane"></div>
    <span class="lane-lab">Camera</span><div class="lane" id="laneCamera" role="list" aria-label="Camera lane"></div>
  </div>
  <div class="audio-info"><p id="trackName">No track</p><p class="legend muted"><i class="k"></i>kick <i class="s"></i>snare</p><p id="status" class="status muted" aria-live="polite"></p></div>
</footer>
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
