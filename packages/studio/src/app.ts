/**
 * Studio controller: holds the recipe, routes every edit through the core commands
 * (or the validator), and keeps the preview, beat strip and JSON panel in sync.
 */
import {
  DEFAULT_RECIPE, clipCycleBeatsFor, exportFrameCount, frameAt, insertMove, makeClipMove, moveBeats,
  removeMove, setAmplitude, swapMove, validateRecipe, type Expression, type MoveKey, type PreviewFps, type Recipe,
} from "@motion-studio/core";
import { createProceduralCharacter } from "./characters/rig";
import { loadFileCharacter } from "./characters/file-character";
import type { Character } from "./characters/types";
import { Player, loadTrack, type Track } from "./audio";
import { beatFromStripX, drawBeatStrip } from "./beat-strip";
import { exportBundle } from "./export/bundle";
import { $, LAYOUT } from "./ui";
import { Viewport, type Background } from "./viewport";
import type { View } from "./views";

export function startApp(root: HTMLElement) {
  root.innerHTML = LAYOUT;
  const viewport = new Viewport($("viewport"));
  const player = new Player();
  const strip = $<HTMLCanvasElement>("strip");
  let recipe: Recipe = structuredClone(DEFAULT_RECIPE);
  let track: Track | null = null;
  let fileCharacter: Character | null = null;
  let frame = 0;
  let selectedId: string | null = null;
  let exporting = false;

  const input = (id: string) => $<HTMLInputElement>(id);
  const say = (id: string, text: string) => { $(id).textContent = text; };
  const totalFrames = () => exportFrameCount(recipe);

  function setRecipe(next: Recipe) {
    recipe = next;
    if (selectedId && !recipe.moves.some(m => m.id === selectedId)) selectedId = null;
    syncInputs();
    render();
  }
  function edit(fn: (r: Recipe) => Recipe) {
    try { setRecipe(fn(recipe)); say("jsonStatus", ""); }
    catch (e) { say("jsonStatus", (e as Error).message); alertSoft((e as Error).message); }
  }
  function alertSoft(message: string) { say("exportStatus", message); }

  function syncInputs() {
    input("bpm").value = String(recipe.beatGrid.bpm);
    input("offset").value = String(recipe.beatGrid.offsetSeconds);
    input("perBar").value = String(recipe.beatGrid.beatsPerBar);
    input("lengthBeats").value = String(recipe.durationBeats);
    input("cursorBeat").max = String(recipe.durationBeats - 1);
    $<HTMLTextAreaElement>("recipeJson").value = JSON.stringify(recipe, null, 2);
    const move = recipe.moves.find(m => m.id === selectedId);
    $("selected").hidden = !move;
    if (move) {
      say("selName", move.name);
      say("selBeat", `beat ${move.atBeat} · ${moveBeats(move, recipe)} beats per pass`);
      input("selAmp").value = String(move.phases[0].amplitude);
      $<HTMLSelectElement>("selFps").value = String(move.phases[0].previewFps);
      input("selBlend").value = String(move.blendBeats);
      $<HTMLSelectElement>("selExpr").value = move.phases[0].expression ?? "";
    }
    const isFile = recipe.character.kind === "file";
    $("palette").hidden = isFile;
    $("clipPalette").hidden = !isFile;
  }

  function render() {
    const state = frameAt(recipe, frame);
    viewport.show(state);
    const a = state.active;
    $("caption").textContent = a ? `${a.moveName} · ${a.phaseName}: ${a.caption}` : "";
    say("readout", `frame ${frame} / ${totalFrames()} · ${state.seconds.toFixed(2)} s · beat ${Math.max(0, state.beat).toFixed(2)}`);
    drawBeatStrip(strip, {
      recipe, beat: Math.max(0, state.beat), cursorBeat: Number(input("cursorBeat").value) || 0, selectedId,
      waveform: track?.features.waveform ?? null,
      trackBeats: track ? (track.features.lengthSeconds - recipe.beatGrid.offsetSeconds) * recipe.beatGrid.bpm / 60 : null,
    });
  }

  function tick() {
    if (player.playing && !exporting) {
      frame = Math.floor(player.position() * recipe.fps);
      if (frame >= totalFrames()) { frame = 0; player.play(track, 0); }
      render();
    }
    requestAnimationFrame(tick);
  }

  function setPlaying(on: boolean) {
    if (on) player.play(track, frame / recipe.fps); else player.stop();
    say("play", on ? "Pause" : "Play");
  }

  function setCharacter(kind: Recipe["character"]["kind"]) {
    let c: Character | null;
    if (kind === "file") {
      c = fileCharacter;
      if (!c) { say("characterStatus", "Load a GLB or FBX file first."); $<HTMLSelectElement>("character").value = recipe.character.kind; return; }
    } else c = createProceduralCharacter(kind);
    // Keep the loaded file alive when switching away, so it can be switched back.
    if (c !== viewport.getCharacter()) viewport.setCharacter(c, viewport.getCharacter() !== fileCharacter);
    const name = kind === "mannequin" ? "Procedural mannequin" : kind === "block" ? "Block figure" : recipe.character.name;
    const licence = kind === "file" ? (input("characterLicence").value.trim() || "unspecified") : "MIT (motion-studio)";
    edit(r => validateRecipe({ ...r, character: { kind, name, licence } }));
    $<HTMLSelectElement>("character").value = kind;
  }

  function renderClipPalette() {
    const pal = $("clipPalette");
    pal.innerHTML = "";
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
      $<HTMLButtonElement>("useDetected").disabled = !f.estimatedBpm;
      $<HTMLButtonElement>("fitTrack").disabled = false;
      say("trackStatus", `${file.name} · ${f.lengthSeconds.toFixed(1)} s · ` +
        (f.estimatedBpm ? `detected ${f.estimatedBpm} BPM, first beat at ${f.estimatedOffsetSeconds.toFixed(2)} s (approximate: check by ear)` : "no clear tempo found; set BPM by hand"));
      const audio = { name: file.name.slice(0, 120).replace(/[<>{}\\]/g, ""), licence: input("audioLicence").value.trim() || "unspecified" };
      edit(r => {
        const beatGrid = f.estimatedBpm ? { ...r.beatGrid, bpm: f.estimatedBpm, offsetSeconds: f.estimatedOffsetSeconds, source: "analysis" as const } : r.beatGrid;
        return validateRecipe({ ...r, beatGrid, audio });
      });
    } catch (e) { say("trackStatus", `Could not decode the track: ${(e as Error).message}`); }
  }
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
  input("selAmp").oninput = () => { if (selectedId) edit(r => setAmplitude(r, { moveId: selectedId!, value: Number(input("selAmp").value) })); };
  $<HTMLSelectElement>("selFps").onchange = () => editSelected(m => m.phases.forEach(p => { p.previewFps = Number($<HTMLSelectElement>("selFps").value) as PreviewFps; }));
  input("selBlend").onchange = () => editSelected(m => { m.blendBeats = Number(input("selBlend").value); });
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

  // Beat strip: click to seek and place the cursor; clicking a move selects it.
  strip.onclick = e => {
    const beat = beatFromStripX(strip, e.clientX, recipe.durationBeats);
    input("cursorBeat").value = String(Math.min(recipe.durationBeats - 1, Math.floor(beat)));
    const hit = [...recipe.moves].reverse().find(m => m.atBeat <= beat);
    selectedId = hit?.id ?? null;
    frame = Math.max(0, Math.round((recipe.beatGrid.offsetSeconds + beat * 60 / recipe.beatGrid.bpm) * recipe.fps));
    if (player.playing) player.play(track, frame / recipe.fps);
    syncInputs();
    render();
  };

  // View
  $("views").onclick = e => { const v = (e.target as HTMLElement).dataset.view as View | undefined; if (v) { viewport.setView(v); markView(v); render(); } };
  const markView = (v: View) => $("views").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  $<HTMLSelectElement>("background").onchange = () => viewport.setBackground($<HTMLSelectElement>("background").value as Background);
  input("grid").onchange = () => viewport.setGrid(input("grid").checked);
  const applyResolution = () => {
    const [w, h] = $<HTMLSelectElement>("resolution").value.split("x").map(Number);
    $("viewport").style.aspectRatio = `${w} / ${h}`;
    $("viewport").style.setProperty("--ar", String(w / h));
  };
  $<HTMLSelectElement>("resolution").onchange = applyResolution;

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
      if (/\.(glb|gltf|fbx)$/i.test(f.name)) void useCharacterFile(f);
      else if (f.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(f.name)) void useTrack(f);
    }
  });

  // Recipe JSON
  $("applyJson").onclick = () => edit(() => validateRecipe(JSON.parse($<HTMLTextAreaElement>("recipeJson").value)));

  // Export
  $("export").onclick = async () => {
    if (exporting) return;
    exporting = true;
    setPlaying(false);
    const [width, height] = $<HTMLSelectElement>("resolution").value.split("x").map(Number);
    const bar = $<HTMLProgressElement>("exportProgress");
    bar.hidden = false;
    say("exportStatus", "Rendering frame by frame…");
    try {
      const result = await exportBundle({ recipe, viewport, width, height, audio: track?.buffer ?? null,
        onProgress: (d, t) => { bar.value = d / t; } });
      download(result.zip, "guide-bundle.zip");
      say("exportStatus", `Exported ${result.frames} frames (${(result.frames / recipe.fps).toFixed(2)} s, ${result.codec}), ` +
        `${(result.zip.length / 1e6).toFixed(1)} MB zip. Audio ${track ? (result.audioInVideo ? "muxed into the MP4 and" : "not muxed (no AAC encoder);") + " saved as audio.wav" : "none"}.`);
    } catch (e) { say("exportStatus", `Export failed: ${(e as Error).message}`); }
    finally { exporting = false; bar.hidden = true; render(); }
  };

  applyResolution();
  markView("front");
  viewport.setCharacter(createProceduralCharacter("mannequin"));
  syncInputs();
  render();
  requestAnimationFrame(tick);
  window.addEventListener("resize", () => render());
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
