/**
 * Studio controller: holds the recipe, routes every edit through the core commands
 * (or the validator), and keeps the preview, beat strip and JSON panel in sync.
 */
import {
  LOOP_CLIPS, RIGGED_CHARACTER, defaultRiggedRecipe, riggedMove, clearIncompatibleMoves, clipCycleBeatsFor, exportFrameCount, frameAt, incompatibleMoves, insertMove,
  makeClipMove, printScript, beatsToFrames, blendBeatsOf, removeMove, swapMove, setMoveBlend, validateRecipe, MOVE_KEYS, MOVE_LIBRARY, buildDrive, flatDrive, planCamera, applyMotionCommand, blockSpan,
  encodeWav, placeLandmarks, type AudioDrive, type CharacterKind, type CommandContext, type Expression, type MotionCommand, type MoveKey, type PreviewFps, type Recipe,
} from "@motion-studio/core/internal";
import { createProceduralCharacter } from "./characters/rig";
import { loadRiggedCharacter, type RiggedCharacter } from "./characters/rigged";
import { loadFileCharacter } from "./characters/file-character";
import type { Character } from "./characters/types";
import { Player, loadTrack, type Track } from "./audio";
import { Timeline } from "./timeline/timeline";
import { DEMO_LICENCE, DEMO_TRACK_NAME, demoDrums, loadDemo } from "./demo";
import { TIMELINE_HEIGHT, laneTop } from "./timeline/draw";
import { computePoseSpeed } from "./timeline/pose-speed";
import { bindExport } from "./export/button";
import { updateExportPanel } from "./export/panel";
import { syncRigPanel } from "./rig-panel";
import { bindViewControls } from "./app-view";
import { $, LAYOUT } from "./ui";
import { Viewport } from "./viewport";
import { History, bindUndo, sameRecipe } from "./history";
import { bindSequencePanel } from "./sequence-panel";
import { bindMixamo, importedMove } from "./app-mixamo";
import { browserStore, parseSequenceFile, readLibrary } from "./sequence-library";

const PROCEDURAL_NAMES: Partial<Record<CharacterKind, string>> = { mannequin: "Procedural mannequin", block: "Block figure", stick: "Stick figure", blob: "Capsule figure", glider: "Glider (pyramid and sphere)" };

export function startApp(root: HTMLElement) {
  root.innerHTML = LAYOUT;
  const viewport = new Viewport($("viewport"));
  const player = new Player();
  let recipe: Recipe = defaultRiggedRecipe();
  let track: Track | null = null;
  /** What the music hands to the rig and the reactive layer; flat (mid energy) without a track. */
  const FLAT = flatDrive(24, 1);
  let drive: AudioDrive = FLAT;
  let fileCharacter: Character | null = null;
  /** The bundled rigged mannequin, loaded once and kept (it is the default character). */
  let rigged: RiggedCharacter | null = null;
  let bonesFor: Character | undefined;
  let riggedLoading: Promise<RiggedCharacter> | null = null;
  // A failed load is forgotten, so picking the rigged mannequin again retries it.
  const ensureRigged = () => (riggedLoading ??= loadRiggedCharacter().then(c => { rigged = c; return c; }, e => { riggedLoading = null; throw e; }));
  const keep = (c: Character | undefined) => c === fileCharacter || c === rigged;
  let frame = 0;
  let selectedId: string | null = null;
  let exporting = false;
  /** Character kind the inline "clear incompatible moves?" question is about. */
  let pendingClear: CharacterKind | null = null;

  const input = (id: string) => $<HTMLInputElement>(id);
  const say = (id: string, text: string) => { $(id).textContent = text; };
  const totalFrames = () => exportFrameCount(recipe);

  function setRecipe(next: Recipe) {
    recipe = next;
    if (selectedId && !recipe.moves.some(m => m.id === selectedId)) selectedId = null;
    syncCharacter();
    refreshRig();
    syncInputs();
    render();
    schedulePoseSpeed();
  }
  /** Rebuild the camera plan and the path overlay from the recipe and the drive. */
  function refreshRig() {
    const plan = recipe.camera ? planCamera(recipe, drive, totalFrames()) : null;
    cameraPlan = plan;
    viewport.setRig(plan, recipe, drive, totalFrames());
    viewport.setLandmarks(placeLandmarks(recipe, plan, drive === FLAT ? undefined : drive));
    const figure = viewport.getCharacter() as { setColours?(body: number, head: number): void; setShape?(shape: string): void } | undefined;
    if (recipe.figure && figure?.setColours) figure.setColours(parseInt(recipe.figure.body.slice(1), 16), parseInt(recipe.figure.head.slice(1), 16));
    if (figure?.setShape) figure.setShape(recipe.figure?.shape ?? "glider");
    if (!plan && viewport.view === "rig") { viewport.setView("front"); markView("front"); }
  }
  /** A recipe applied as JSON may name another procedural character: show it. */
  function syncCharacter() {
    const kind = recipe.character.kind;
    $<HTMLSelectElement>("character").value = kind;
    if (kind === "rigged") renderClipPalette();
    if (kind === "file" || viewport.getCharacter()?.kind === kind) return;
    if (kind === "rigged") {
      if (rigged) viewport.setCharacter(rigged, !keep(viewport.getCharacter()));
      else void ensureRigged().then(c => { if (recipe.character.kind === "rigged") { viewport.setCharacter(c, !keep(viewport.getCharacter())); renderClipPalette(); render(); } })
        .catch(e => say("characterStatus", `Could not load the rigged mannequin: ${(e as Error).message}`));
    } else viewport.setCharacter(createProceduralCharacter(kind), !keep(viewport.getCharacter()));
  }
  /** Every recipe change goes through here, so each one can be undone. */
  function edit(fn: (r: Recipe) => Recipe) {
    try {
      const before = recipe, next = fn(recipe);
      if (!sameRecipe(before, next)) history.record(before);
      setRecipe(next);
      syncUndo();
      say("jsonStatus", "");
    } catch (e) { say("jsonStatus", (e as Error).message); alertSoft((e as Error).message); }
  }
  /** Bands and drive for commands that read the music. */
  const ctx = (): CommandContext => ({ drive: drive === FLAT ? undefined : drive, bands: drive.bands });
  const commandLog: MotionCommand[] = [];
  /** Every panel edit goes through a core command, logged so it can be replayed by an agent. */
  function command(c: MotionCommand) {
    const before = recipe;
    edit(r => applyMotionCommand(r, c, ctx()));
    if (recipe !== before) logCommand(c);
  }
  function logCommand(c: MotionCommand) {
    commandLog.push(c);
    $<HTMLTextAreaElement>("commandLog").value = JSON.stringify(commandLog.slice(-200), null, 1);
  }
  const mixamo = bindMixamo({ ensureRigged, changed: () => { renderClipPalette(); syncInputs(); render(); schedulePoseSpeed(); } });
  const history = new History();
  const syncUndo = bindUndo(history, { current: () => recipe, restore: r => setRecipe(r) });
  function alertSoft(message: string) { say("exportStatus", message); }

  function syncInputs() {
    input("bpm").value = String(recipe.beatGrid.bpm);
    input("offset").value = String(recipe.beatGrid.offsetSeconds);
    input("perBar").value = String(recipe.beatGrid.beatsPerBar);
    input("lengthBeats").value = String(recipe.durationBeats);
    input("cursorBeat").max = String(recipe.durationBeats - 1);
    $<HTMLTextAreaElement>("recipeJson").value = JSON.stringify(recipe, null, 2);
    if (document.activeElement !== $("shotScript")) $<HTMLTextAreaElement>("shotScript").value = printScript(recipe, drive.bands);
    const move = recipe.moves.find(m => m.id === selectedId);
    $("selected").hidden = !move;
    if (move) {
      const span = blockSpan(recipe, move.id);
      say("selName", move.name);
      say("selBeat", `beats ${span.start}–${+span.end.toFixed(3)} · speed ×${span.speed}`);
      input("selAmp").value = String(move.phases[0].amplitude);
      for (const [id, v] of [["selAmpNum", move.phases[0].amplitude], ["selStart", span.start], ["selLength", +span.length.toFixed(4)], ["selSpeed", span.speed]] as const)
        if (document.activeElement !== input(id)) input(id).value = String(v);
      $<HTMLSelectElement>("selFps").value = String(move.phases[0].previewFps);
      input("selBlend").value = String(Math.round(beatsToFrames(blendBeatsOf(move, recipe), recipe.beatGrid.bpm)));
      $<HTMLSelectElement>("selExpr").value = move.phases[0].expression ?? "";
      $<HTMLSelectElement>("selLock").value = move.lock ?? "off";
      input("selLockStrength").value = move.strength === undefined ? "" : String(move.strength);
      input("selLockStrength").disabled = !move.lock;
    }
    const clipDriven = recipe.character.kind === "file" || recipe.character.kind === "rigged";
    $("palette").hidden = clipDriven;
    $("clipPalette").hidden = !clipDriven;
    syncRigPanel(recipe);
    timeline.setBrush(recipe.character.kind, fileCharacter?.clips.map(c => c.name) ?? [], mixamo.names());
    updateExportPanel(recipe);
  }

  /** Render the recipe at a frame (fractional while previewing above 24 fps). */
  function render(shown: number = frame) {
    const state = view.overlay(frameAt(recipe, shown, drive));
    if (viewport.getCharacter() !== bonesFor) { bonesFor = viewport.getCharacter(); view.fillBones(); }
    viewport.show(state);
    const a = state.active;
    $("caption").textContent = state.phase ? `${state.phase.accent.toUpperCase()} · ${state.phase.name}` : a ? `${a.moveName} · ${a.phaseName}: ${a.caption}` : "";
    say("readout", `F ${String(frame).padStart(3, "0")} / ${totalFrames()} · ${state.seconds.toFixed(2)} s · beat ${Math.max(0, state.beat).toFixed(2)}`);
    currentBeat = Math.max(0, state.beat);
    timeline.draw();
  }
  let currentBeat = 0;
  let cameraPlan: ReturnType<typeof planCamera> | null = null;
  const rate = () => Number($<HTMLSelectElement>("rate").value) || 1;
  const previewFps = () => Number($<HTMLSelectElement>("previewFps").value) || 24;

  function tick() {
    timeline.recordTick(frame, player.playing && !exporting);
    if (player.playing && !exporting) {
      const t = player.position();
      frame = Math.floor(t * recipe.fps);
      if (frame >= totalFrames()) { frame = 0; player.play(track, 0, rate()); }
      // Preview fps: hold frames below 24, interpolate between them above.
      render(Math.floor(t * previewFps()) / previewFps() * recipe.fps);
    }
    requestAnimationFrame(tick);
  }

  function setPlaying(on: boolean) {
    if (on) player.play(track, frame / recipe.fps, rate()); else player.stop();
    say("play", on ? "Pause" : "Play");
  }

  function setCharacter(kind: Recipe["character"]["kind"]) {
    let c: Character | null;
    if (kind === "rigged" && !rigged) {
      const loading = "Loading the rigged mannequin…", select = $<HTMLSelectElement>("character");
      say("characterStatus", loading);
      const settle = (text: string) => { if ($("characterStatus").textContent === loading) say("characterStatus", text); };
      void ensureRigged().then(() => {
        settle("");
        // Another figure picked while it loaded wins: the mannequin stays loaded for later.
        if (select.value === "rigged") setCharacter("rigged");
      }, e => {
        if (select.value === "rigged") select.value = recipe.character.kind;
        settle(`Could not load the rigged mannequin: ${(e as Error).message}`);
      });
      return;
    }
    if (kind === "rigged") c = rigged;
    else if (kind === "file") {
      c = fileCharacter;
      if (!c) { say("characterStatus", "Load a GLB or FBX file first."); $<HTMLSelectElement>("character").value = recipe.character.kind; return; }
    } else c = createProceduralCharacter(kind);
    // Keep the loaded file alive when switching away, so it can be switched back.
    if (c && c !== viewport.getCharacter()) viewport.setCharacter(c, !keep(viewport.getCharacter()));
    const name = PROCEDURAL_NAMES[kind] ?? (kind === "rigged" ? RIGGED_CHARACTER.name : recipe.character.name);
    const licence = kind === "file" ? (input("characterLicence").value.trim() || "unspecified") : kind === "rigged" ? RIGGED_CHARACTER.licence : "MIT (motion-studio)";
    edit(r => validateRecipe({ ...r, character: { kind, name, licence } }));
    $<HTMLSelectElement>("character").value = kind;
    askToClear(kind);
  }

  /** After a switch, offer to clear moves the new character cannot play. Nothing is cleared without a yes. */
  function askToClear(kind: CharacterKind) {
    const bad = incompatibleMoves(recipe, kind);
    pendingClear = bad.length ? kind : null;
    $("switchConfirm").hidden = !bad.length;
    if (!bad.length) return;
    const list = bad.slice(0, 4).map(m => `${m.name} @ ${m.atBeat}`).join(", ") + (bad.length > 4 ? "…" : "");
    say("switchConfirmText", kind === "file" || kind === "rigged"
      ? `${bad.length} library move(s) (${list}) do not drive a loaded character: it shows its rest pose during them. Clear them from the recipe?`
      : `${bad.length} clip move(s) (${list}) need the loaded file: this figure stands at rest during them. Clear them from the recipe?`);
  }
  $("switchClear").onclick = () => {
    const kind = pendingClear;
    if (kind && kind === recipe.character.kind) edit(r => clearIncompatibleMoves(r, kind));
    pendingClear = null;
    $("switchConfirm").hidden = true;
  };
  $("switchKeep").onclick = () => { pendingClear = null; $("switchConfirm").hidden = true; };

  function renderClipPalette() {
    const pal = $("clipPalette");
    pal.innerHTML = "";
    if (recipe.character.kind === "rigged") {
      for (const name of Object.keys(LOOP_CLIPS)) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = name.replace(/_Loop$/, "").replace(/_/g, " ");
        b.title = `${name}: steps land on beats`;
        b.onclick = () => addAtCursor(r => insertMove(r, { move: riggedMove(name, cursor(), r.beatGrid.bpm), atBeat: cursor() }));
        pal.appendChild(b);
      }
      for (const c of mixamo.clips()) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `${c.name} (${c.seconds.toFixed(1)} s)`;
        b.title = "Your Mixamo clip, retargeted onto the mannequin, at its own speed";
        b.onclick = () => addAtCursor(r => insertMove(r, { move: importedMove(c.name, cursor(), r)!, atBeat: cursor() }));
        pal.appendChild(b);
      }
      return;
    }
    for (const clip of fileCharacter?.clips ?? []) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${clip.name} (${clip.seconds.toFixed(1)} s)`;
      b.onclick = () => addAtCursor(r => {
        const at = cursor();
        const cycle = clipCycleBeatsFor(clip.seconds, r.beatGrid.bpm);
        const id = `clip-${at}`;
        return insertMove(r, { move: makeClipMove(clip.name, at, cycle, { id }), atBeat: at });
      });
      pal.appendChild(b);
    }
    if (!fileCharacter?.clips.length) pal.innerHTML = `<p class="muted">This file has no embedded animation clips.</p>`;
  }

  const cursor = () => Math.max(0, Math.min(recipe.durationBeats - 1, Math.round(Number(input("cursorBeat").value) || 0)));
  function addAtCursor(fn: (r: Recipe) => Recipe) {
    const at = cursor();
    edit(fn);
    const placed = recipe.moves.find(m => m.atBeat === at);
    if (placed) selectedId = placed.id;
    input("cursorBeat").value = String(Math.min(recipe.durationBeats - 1, at + recipe.beatGrid.beatsPerBar));
    syncInputs();
    render();
  }

  // Track
  input("trackFile").onchange = () => { const f = input("trackFile").files?.[0]; if (f) void useTrack(f); };
  async function useTrack(file: File) {
    say("trackStatus", `Decoding ${file.name}…`);
    try {
      setPlaying(false);
      track = await loadTrack(file);
      const f = track.features;
      drive = buildDrive(f, recipe.fps, Math.ceil(f.lengthSeconds * recipe.fps) + 1);
      $<HTMLButtonElement>("useDetected").disabled = !f.estimatedBpm;
      $<HTMLButtonElement>("fitTrack").disabled = false;
      say("trackStatus", `${file.name} · ${f.lengthSeconds.toFixed(1)} s · ` +
        (f.estimatedBpm ? `detected ${f.estimatedBpm} BPM, first beat at ${f.estimatedOffsetSeconds.toFixed(2)} s (approximate: check by ear)` : "no clear tempo found; set BPM by hand") +
        (f.bands ? ` · ${f.bands.low.length} kicks, ${f.bands.mid.length} snares, ${f.bands.high.length} hats` : ""));
      const audio = { name: file.name.slice(0, 120).replace(/[<>{}\\]/g, ""), licence: input("audioLicence").value.trim() || "unspecified" };
      edit(r => {
        const beatGrid = f.estimatedBpm ? { ...r.beatGrid, bpm: f.estimatedBpm, offsetSeconds: f.estimatedOffsetSeconds, source: "analysis" as const } : r.beatGrid;
        return validateRecipe({ ...r, beatGrid, audio });
      });
    } catch (e) { say("trackStatus", `Could not decode the track: ${(e as Error).message}`); }
  }
  $("loadDemo").onclick = () => void loadDemo({
    useTrack, fitToTrack: () => $("fitTrack").click(), applyScript: script => command({ type: "applyScript", script }),
    showRig: () => { if (recipe.camera) { viewport.setView("rig"); markView("rig"); render(); } }, setLicence: t => { input("audioLicence").value = t; },
  });
  $("useDetected").onclick = () => { const f = track?.features; if (f?.estimatedBpm) edit(r => validateRecipe({ ...r, beatGrid: { ...r.beatGrid, bpm: f.estimatedBpm!, offsetSeconds: f.estimatedOffsetSeconds, source: "analysis" } })); };
  $("fitTrack").onclick = () => { if (track) edit(r => validateRecipe({ ...r, durationBeats: Math.max(1, Math.min(512, Math.floor((track!.features.lengthSeconds - r.beatGrid.offsetSeconds) * r.beatGrid.bpm / 60))) })); };
  const gridField = (id: string, key: "bpm" | "offsetSeconds" | "beatsPerBar") => {
    input(id).onchange = () => edit(r => validateRecipe({ ...r, beatGrid: { ...r.beatGrid, [key]: Number(input(id).value), source: "manual" } }));
  };
  gridField("bpm", "bpm"); gridField("offset", "offsetSeconds"); gridField("perBar", "beatsPerBar");
  input("lengthBeats").onchange = () => edit(r => validateRecipe({ ...r, durationBeats: Math.round(Number(input("lengthBeats").value)), moves: r.moves.filter(m => m.atBeat < Number(input("lengthBeats").value)) }));
  input("audioLicence").onchange = () => { if (recipe.audio) edit(r => validateRecipe({ ...r, audio: { ...r.audio!, licence: input("audioLicence").value.trim() || "unspecified" } })); };

  // Character
  $<HTMLSelectElement>("character").onchange = () => setCharacter($<HTMLSelectElement>("character").value as Recipe["character"]["kind"]);
  input("characterFile").onchange = () => { const f = input("characterFile").files?.[0]; if (f) void useCharacterFile(f); };
  async function useCharacterFile(file: File) {
    say("characterStatus", `Loading ${file.name}…`);
    try {
      const c = await loadFileCharacter(file, { neutralMaterial: input("plainMaterial").checked });
      if (fileCharacter && fileCharacter !== c) { fileCharacter.object.removeFromParent(); fileCharacter.dispose(); }
      fileCharacter = c;
      recipe = { ...recipe, character: { ...recipe.character, name: file.name.slice(0, 120).replace(/[<>{}\\]/g, "") } };
      renderClipPalette();
      setCharacter("file");
      const rig = c.mixamo ? `Mixamo bones recognised: ${c.mixamo.mapped}/${c.mixamo.total}` : "no skinned mesh found";
      say("characterStatus", `${file.name} · ${c.clips.length} clip(s) · ${rig}. Add clips below; library moves drive only the procedural figures.`);
    } catch (e) { say("characterStatus", (e as Error).message); }
  }
  input("characterLicence").onchange = () => { if (recipe.character.kind === "file") edit(r => validateRecipe({ ...r, character: { ...r.character, licence: input("characterLicence").value.trim() || "unspecified" } })); };

  // Moves
  $("palette").onclick = e => {
    const key = (e.target as HTMLElement).dataset.move as MoveKey | undefined;
    if (key) addAtCursor(r => insertMove(r, { move: key, atBeat: cursor() }));
  };
  input("cursorBeat").onchange = () => render();
  const selectedMove = () => recipe.moves.find(m => m.id === selectedId);
  const editSelected = (fn: (m: Recipe["moves"][number]) => void) => edit(r => {
    const next = structuredClone(r);
    const m = next.moves.find(x => x.id === selectedId);
    if (m) fn(m);
    return validateRecipe(next);
  });
  const field = (id: string, key: "start" | "length" | "speed" | "amplitude") => {
    input(id).onchange = () => { const v = Number(input(id).value); if (selectedId && Number.isFinite(v)) command({ type: "setMoveFields", moveId: selectedId, [key]: v }); };
  };
  field("selStart", "start"); field("selLength", "length"); field("selSpeed", "speed"); field("selAmpNum", "amplitude");
  $<HTMLSelectElement>("selLock").onchange = () => { if (selectedId) command({ type: "setMoveFields", moveId: selectedId, lock: $<HTMLSelectElement>("selLock").value }); };
  input("selLockStrength").onchange = () => { const v = Number(input("selLockStrength").value); if (selectedId && input("selLockStrength").value !== "" && Number.isFinite(v)) command({ type: "setMoveFields", moveId: selectedId, strength: v }); };
  input("selAmp").oninput = () => { if (selectedId) command({ type: "setMoveFields", moveId: selectedId, amplitude: Number(input("selAmp").value) }); };
  const onBand = (target: string) => () => { if (selectedId) command({ type: "snapMoveTo", moveId: selectedId, target }); };
  $("selOnKick").onclick = onBand("kick");
  $("selOnSnare").onclick = onBand("snare");
  $("selPlaceEvery").onclick = () => {
    const m = selectedMove();
    if (!m) return;
    const name = m.clip ?? MOVE_KEYS.find(k => MOVE_LIBRARY[k].name === m.name) ?? m.name;
    command({ type: "placeOnEvery", move: name, target: $<HTMLSelectElement>("selEveryTarget").value, every: Math.max(1, Math.round(Number(input("selEvery").value) || 1)),
      lengthBeats: blockSpan(recipe, m.id).length });
  };
  $<HTMLSelectElement>("selFps").onchange = () => editSelected(m => m.phases.forEach(p => { p.previewFps = Number($<HTMLSelectElement>("selFps").value) as PreviewFps; }));
  input("selBlend").onchange = () => { if (selectedId) edit(r => setMoveBlend(r, { moveId: selectedId!, frames: Number(input("selBlend").value) })); };
  $<HTMLSelectElement>("selExpr").onchange = () => editSelected(m => m.phases.forEach(p => {
    const v = $<HTMLSelectElement>("selExpr").value;
    if (v) p.expression = v as Expression; else delete p.expression;
  }));
  $<HTMLSelectElement>("selSwap").onchange = () => {
    const to = $<HTMLSelectElement>("selSwap").value as MoveKey;
    if (to && selectedMove()) edit(r => swapMove(r, { moveId: selectedId!, to }));
    $<HTMLSelectElement>("selSwap").value = "";
  };
  $("selRemove").onclick = () => { if (selectedId) edit(r => removeMove(r, { moveId: selectedId! })); };

  // Timeline: seeking places the cursor and selects the move under it.
  function seekBeat(beat: number) {
    input("cursorBeat").value = String(Math.min(recipe.durationBeats - 1, Math.floor(beat)));
    const hit = [...recipe.moves].reverse().find(m => m.atBeat <= beat);
    selectedId = hit?.id ?? null;
    timeline.setFocus(hit ? { kind: "move", id: hit.id } : null);
    frame = Math.max(0, Math.round((recipe.beatGrid.offsetSeconds + beat * 60 / recipe.beatGrid.bpm) * recipe.fps));
    if (player.playing) player.play(track, frame / recipe.fps, rate());
    syncInputs();
    render();
  }
  const timeline = new Timeline({
    recipe: () => recipe, drive: () => (drive === FLAT ? undefined : drive),
    rms: () => (track ? { rms: track.features.rms, hop: track.features.hopSeconds } : null),
    wave: () => track?.wave ?? null,
    beat: () => currentBeat, poseSpeed: () => poseSpeedCurve, edit, seek: seekBeat, importedMove, ctx,
    select: id => { selectedId = id; syncInputs(); }, log: logCommand, command, cameraPlan: () => cameraPlan,
  });
  /** Pose speed for the graph, recomputed shortly after the recipe or drive changes. */
  let poseSpeedCurve: Float32Array | null = null;
  let poseTimer = 0;
  function schedulePoseSpeed() {
    clearTimeout(poseTimer);
    poseTimer = window.setTimeout(() => {
      const c = viewport.getCharacter();
      if (!c) return;
      poseSpeedCurve = computePoseSpeed(c, recipe, drive, totalFrames());
      render();
    }, 400);
  }
  $("rate").onchange = () => { if (player.playing) player.play(track, frame / recipe.fps, rate()); };
  $("tStart").onclick = () => { setPlaying(false); frame = 0; render(); };
  $("tEnd").onclick = () => { setPlaying(false); frame = totalFrames() - 1; render(); };

  // Transport
  $("play").onclick = () => setPlaying(!player.playing);
  $("prev").onclick = () => { setPlaying(false); frame = Math.max(0, frame - 1); render(); };
  $("next").onclick = () => { setPlaying(false); frame = Math.min(totalFrames() - 1, frame + 1); render(); };
  window.addEventListener("keydown", e => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.code === "Space") { e.preventDefault(); setPlaying(!player.playing); }
    if (e.code === "ArrowLeft") $("prev").click();
    if (e.code === "ArrowRight") $("next").click();
  });

  // Drag and drop: audio goes to the track, .glb/.fbx to the character.
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => {
    e.preventDefault();
    for (const f of e.dataTransfer?.files ?? []) {
      if (/\.(glb|gltf|fbx)$/i.test(f.name)) void mixamo.tryDrop(f).then(done => { if (!done) void useCharacterFile(f); });
      else if (/\.json$/i.test(f.name)) void f.text().then(t => edit(() => parseSequenceFile(t)));
      else if (f.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(f.name)) void useTrack(f);
    }
  });

  viewport.setFrameSource(f => frameAt(recipe, Math.max(0, f), drive));
  const view = bindViewControls({
    viewport, recipe: () => recipe, edit, command, render: () => render(), say,
    drive: () => (drive === FLAT ? undefined : drive), frame: () => frame, cursor, selectedMarker: () => timeline.selectedMarker(),
  });
  const { markView, applyResolution } = view;

  bindSequencePanel({ recipe: () => recipe, load: r => edit(() => r) });

  // Recipe JSON
  $("applyScript").onclick = () => {
    const before = recipe;
    command({ type: "applyScript", script: $<HTMLTextAreaElement>("shotScript").value });
    say("scriptStatus", recipe === before ? $("jsonStatus").textContent ?? "" : "Applied.");
    $<HTMLTextAreaElement>("shotScript").value = printScript(recipe, drive.bands);
  };
  $("applyJson").onclick = () => edit(() => validateRecipe(JSON.parse($<HTMLTextAreaElement>("recipeJson").value)));

  // Export
  bindExport({ recipe: () => recipe, viewport, say, render: () => render(), track: () => track, drive: () => drive,
    setExporting: on => { exporting = on; if (on) setPlaying(false); } });

  applyResolution();
  markView("front");
  viewport.setCharacter(createProceduralCharacter("mannequin"));
  syncCharacter();
  renderClipPalette();
  refreshRig();
  syncInputs();
  render();
  requestAnimationFrame(tick);
  window.addEventListener("resize", () => render());
  openSequenceFromUrl();
  /** `?sequence=<name>` (the Draw Control page's "Full studio" link): load that saved sequence, with the demo track if it names it. */
  function openSequenceFromUrl() {
    const name = new URLSearchParams(location.search).get("sequence");
    const entry = name ? readLibrary(browserStore()).find(e => e.name === name) : undefined;
    if (!entry) return;
    const load = () => { edit(() => entry.recipe); if (recipe.camera) { viewport.setView("rig"); markView("rig"); render(); } };
    if (entry.recipe.audio?.name !== DEMO_TRACK_NAME) { load(); return; }
    const d = demoDrums();
    input("audioLicence").value = DEMO_LICENCE;
    void useTrack(new File([encodeWav([d.samples], d.sampleRate, 0, d.seconds) as BlobPart], DEMO_TRACK_NAME, { type: "audio/wav" })).then(load);
  }
  if (import.meta.env.DEV) {
    // Dev-only probe for the smoke script: the live recipe, the analysed bands and the lane geometry.
    (window as unknown as { __msFrame: unknown }).__msFrame = (n: number) => { const f = frameAt(recipe, n, drive); return { amplitude: f.amplitude, envelope: f.envelope, root: f.root }; };
    (window as unknown as { __msProbe: unknown }).__msProbe = () => ({
      recipe, frame, lanes: { ...laneTop, height: TIMELINE_HEIGHT },
      bands: drive.bands ? { low: drive.bands.low.map(o => o.seconds), mid: drive.bands.mid.map(o => o.seconds), high: drive.bands.high.map(o => o.seconds), peaks: drive.bands.peaks.length } : null,
    });
  }
}
