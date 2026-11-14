/**
 * The Beat Path page: draw a path, add music, and the movement and the camera lock to the
 * beat; export a guide clip. A thin surface over the core (public entry) and the studio's
 * viewport, audio player and bundle export. The page state is a shot script (script.ts):
 * every edit changes the state, `beatPathRecipe` applies its script, and the preview, map,
 * strip and lanes redraw. page-actions.ts binds the buttons, the menus and the keyboard.
 */
import {
  beatAtSeconds, buildDrive, placeLandmarks, onsetBeats, cameraAtSeconds, clipBeats, flatDrive, frameAt, planCamera, secondsAtBeat, snapBeat, travelStations,
  type AudioDrive, type CameraPlan, type Recipe,
} from "@motion-studio/core";
import { sensitiveBands } from "@motion-studio/core/internal";
import { Player, loadTrack, trackFromSamples, type Track } from "../audio";
import { createGlider } from "../characters/glider";
import { GROOVES, grooveTimes, synthDrums } from "@motion-studio/core";
import { EXAMPLE_TRACKS } from "./tracks";
import { Viewport } from "../viewport";
import { GRID_LOOKS } from "../ground-grid";
import { exampleState, ownState } from "./examples";
import { bindGenerate } from "./page-generate";
import { LaneView, Menu } from "./lanes";
import { LAYOUT } from "./layout";
import { MapView, type Tool, type View } from "./map";
import { BlockTool } from "./map-blocks";
import { FollowTool, type FollowSeg } from "./map-follow";
import { bindActions } from "./page-actions";
import { bindSlice } from "./page-slice";
import { initPills } from "./ui/seg-pill";
import { beatPathRecipe, type TrackInfo } from "./recipe-map";
import { LABELS, fitLanes, isFollowWord, type BeatPathState, type CameraWord, type CharacterWord } from "./script";
import { AudioStrip } from "./strip";

export type Page = ReturnType<typeof startBeatPath>;

export function startBeatPath(root: HTMLElement) {
  root.innerHTML = LAYOUT;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  let state: BeatPathState = exampleState(0);
  let tool: Tool = "subject", view: View = "top", pen: "edit" | "draw" = "edit";
  /** What Delete removes and Escape clears: a lane block or a path point. */
  let selection: { kind: "point"; tool: Tool; index: number } | { kind: "block"; lane: "character" | "cameraLane"; index: number } | null = null;
  let track: Track | null = null, info: TrackInfo | null = null;
  let drive: AudioDrive = flatDrive(24, 1);
  let recipe: Recipe = beatPathRecipe(state, null), plan: CameraPlan;
  let hits: number[] = [];
  let busy = false, head = 0, dirty = true;
  const past: BeatPathState[] = [], future: BeatPathState[] = [];
  let dragBase: BeatPathState | null = null;
  const player = new Player();
  const live = () => (track ? drive : undefined);
  const bpm = () => info?.bpm ?? 120;
  const totalBeats = () => clipBeats(state.clip, bpm());
  const window0 = () => secondsAtBeat(recipe.beatGrid, 0);
  const window1 = () => window0() + state.clip;

  const viewport = new Viewport($("preview"));
  const glider = createGlider();
  viewport.setCharacter(glider);
  viewport.setShowPaths(false);
  viewport.setGrid(true);
  // The guide's colour coding: a dark ground with lighter 1 m and 4 m lines, fading to a dark horizon.
  const look = GRID_LOOKS[new URLSearchParams(location.search).get("ground") === "light" ? "light" : "dark"];
  viewport.setGridLook(look);
  viewport.setBackgroundColour(look.horizon);
  viewport.setExportGrid(true);
  viewport.setView("rig");

  /** Every edit: the new state; history on a final edit (a drag records where it began). */
  function update(next: BeatPathState, final = true) {
    if (!dragBase) dragBase = structuredClone(state);
    state = next;
    if (final) { past.push(dragBase); if (past.length > 200) past.shift(); future.length = 0; dragBase = null; }
    schedule(final);
  }
  function undo(redo = false) {
    const from = redo ? future : past, to = redo ? past : future;
    const s = from.pop();
    if (!s) return;
    to.push(structuredClone(state));
    state = s;
    // A selection may point past what the restored state holds: drop it rather than act on the wrong item.
    if (selection && (selection.kind === "point" ? selection.index >= (selection.tool === "camera" ? state.camera : state.subject).length : selection.index >= state[selection.lane].length)) selection = null;
    if (JSON.stringify(s.boxes) !== JSON.stringify(to.at(-1)?.boxes)) blocks.selected = -1;
    rebuild();
  }

  const map = new MapView($<HTMLCanvasElement>("map"), {
    tool: () => tool, view: () => view,
    points: t => (t === "subject" ? state.subject : t === "camera" ? state.camera : []),
    corners: t => (t === "camera" ? state.cameraCorners : state.subjectCorners),
    change: (t, points, final) => {
      const next = { ...state, ...(t === "subject" ? { subject: points } : { camera: points }) };
      // A drawn camera path flies a block: the selected camera block, else the block under the playhead
      // (a new "path" block when the lane is empty). It is never silently stored with nothing using it.
      if (t === "camera" && final && points.length >= 2) {
        const sel = selection?.kind === "block" && selection.lane === "cameraLane" ? selection.index : -1;
        const used = next.cameraLane.findIndex(b => b.word === "path");
        if (sel >= 0 || used < 0) {
          const beat = beatAtSeconds(recipe.beatGrid, head);
          const k = sel >= 0 ? sel : next.cameraLane.findIndex(b => beat >= b.from && beat < b.to);
          if (k < 0) next.cameraLane = [...next.cameraLane, { from: 0, to: totalBeats(), word: "path" as const }];
          else next.cameraLane = next.cameraLane.map((b, i) => (i === k ? { from: b.from, to: b.to, word: "path" as const } : b));
          say(k < 0 ? "A new path block on the Camera lane flies your path" : next.cameraLane.length > 1 ? `Block ${k + 1} of the Camera lane now flies your path · Whole clip (map footer) makes it fly all of it` : "Your path flies the whole clip");
        } else say(`Block ${used + 1} of the Camera lane flies your path`);
      }
      update(next, final);
    },
    blocksDown: (e, w, toScreen, fromScreen) => blocks.down(e, w, toScreen, fromScreen),
    followDown: (e, toScreen, fromScreen) => follow.down(e, toScreen, fromScreen),
    selectedBox: () => blocks.selected,
    pen: () => pen,
    // Draw new stays armed after a stroke (Escape or Edit disarms it), so a second stroke draws too.
    drew: () => {},
    hint: text => { if (text) say(text); },
    selected: () => (selection?.kind === "point" ? { tool: selection.tool, index: selection.index } : null),
    select: sel => { selection = sel ? { kind: "point", ...sel } : null; },
  });
  /** The scenery as editable boxes (map-blocks.ts): explicit once edited, else the placement of the preset. */
  let lastLandmarks: { x: number; z: number; w: number; d: number; h: number; yaw: number }[] = [], lastFloor: { x: number; z: number }[] = [];
  const blocks = new BlockTool($<HTMLCanvasElement>("map"), {
    boxes: () => state.boxes ?? lastLandmarks.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, ...(b.yaw ? { yaw: b.yaw } : {}) })),
    setBoxes: (boxes, final) => update({ ...state, boxes, scenery: state.scenery === "none" ? "street" : state.scenery, landmarks: { ...state.landmarks, on: true } }, final),
    pen: () => pen, subject: () => lastFloor, say: text => say(text), changed: () => { map.refresh(); actions.sync(); },
  });
  /** Follow blocks on the map: dragging a follow line sets the block's offset (map-follow.ts); one undo step per drag. */
  let followSegs: FollowSeg[] = [];
  const follow = new FollowTool($<HTMLCanvasElement>("map"), {
    segments: () => followSegs,
    current: k => state.cameraLane[k]?.follow,
    set: (k, f, final) => update({ ...state, cameraLane: state.cameraLane.map((b, i) => (i === k ? { ...b, follow: f } : b)) }, final),
    say: text => say(text),
  });
  /** One clock for the page: the transport bar, the music strip and the play buttons all move it. */
  function seek(seconds: number) { head = Math.max(window0(), Math.min(window1(), seconds)); if (player.playing) player.play(track, head); dirty = true; }
  const strip = new AudioStrip($<HTMLCanvasElement>("wave"), seconds => seek(seconds),
    seconds => toggleHit(seconds), {
      add: t => hooks.slice?.stripHooks.add(t), move: (i, t, final) => hooks.slice?.stripHooks.move(i, t, final), select: i => { hooks.slice?.stripHooks.select(i); dirty = true; rebuildSoon(); },
      detach: (t, band) => hooks.slice?.stripHooks.detach(t, band) ?? -1,
    });
  const rebuildSoon = () => schedule(false);
  /** Switch a kick or snare off for every lock, or back on (undoable, in the recipe and the script). */
  function toggleHit(seconds: number) {
    const t = Math.round(seconds * 1000) / 1000, on = state.muted.some(m => Math.abs(m - t) < 0.012);
    update({ ...state, muted: on ? state.muted.filter(m => Math.abs(m - t) >= 0.012) : [...state.muted, t].sort((a, b) => a - b) });
  }
  const menu = new Menu($("menu"));
  const lane = <W extends string>(id: string, key: "character" | "cameraLane", labels: Record<W, string>, words: readonly W[], single?: W) => {
    const view: LaneView<W> = new LaneView<W>($(id), {
      blocks: () => state[key] as unknown as { from: number; to: number; word: W }[],
      total: totalBeats,
      label: w => labels[w],
      snap: b => snapLane(b),
      commit: (blocks, final) => update({ ...state, [key]: blocks }, final),
      open: (anchor, i, beat) => actions.openBlock(key, view, anchor, i, beat, labels, words, single),
    });
    return view;
  };
  /** Snap on: the nearest beat or hit (kick, snare). Off: the nearest frame (24 fps), its number shown while dragging. */
  function snapLane(b: number): number {
    const g = recipe.beatGrid;
    if (!$<HTMLInputElement>("snap").checked) {
      const frame = Math.max(0, Math.round(secondsAtBeat(g, b) * 24));
      say(`frame ${frame}`);
      return Math.round(beatAtSeconds(g, frame / 24) * 10000) / 10000;
    }
    const hits = track ? [...onsetBeats(recipe, live()?.bands, "kick"), ...onsetBeats(recipe, live()?.bands, "snare")] : [];
    return [snapBeat(recipe, b, "beat"), ...hits].reduce((best, x) => (Math.abs(x - b) < Math.abs(best - b) ? x : best));
  }
  const characterLane = lane<CharacterWord>("laneCharacter", "character", LABELS.character, ["glide", "hover", "spin", "jump", "freeze"], "glide");
  const cameraLane = lane<CameraWord>("laneCamera", "cameraLane", LABELS.camera, ["behind", "side", "orbit", "top", "path", "push"]);
  const say = (text: string) => { $("status").textContent = text; };
  const ctx = () => (track ? { drive, bands: drive.bands } : {});

  /** Rebuild the recipe, the camera plan and every view from the state. */
  function rebuild() {
    try { recipe = beatPathRecipe(state, info, ctx()); }
    catch (e) { say(`Not applied: ${(e as Error).message}`); return; }
    const frames = Math.ceil((window1() + 0.2) * recipe.fps) + 1;
    plan = planCamera(recipe, live(), frames);
    viewport.setRig(plan, recipe, live(), frames);
    const at = (n: number) => frameAt(recipe, Math.max(0, Math.min(frames - 1, n)), live()).root;
    const f0 = Math.floor(window0() * 24), f1 = Math.ceil(window1() * 24);
    const floor: { x: number; z: number }[] = [], trail: { x: number; z: number }[] = [];
    for (let n = f0; n <= f1; n += 2) { const r = at(n), s = plan.samples[n].position; floor.push({ x: r.x, z: r.z }); trail.push({ x: s[0], z: s[2] }); }
    const stationBeats = travelStations(recipe, live());
    const stations = stationBeats.map(b => {
      const n = Math.round(secondsAtBeat(recipe.beatGrid, b) * recipe.fps), p = at(n), a = at(n - 6), c = at(n + 6);
      return { x: p.x, z: p.z, dx: c.x - a.x, dz: c.z - a.z };
    });
    glider.setColours(parseInt(state.figure.body.slice(1), 16), parseInt(state.figure.head.slice(1), 16));
    glider.setShape(state.figure.shape);
    const landmarks = placeLandmarks(recipe, plan, live());
    viewport.setLandmarks(landmarks);
    lastLandmarks = landmarks; lastFloor = floor;
    map.setScene({ floor, stations, trail, landmarks, ...cameraTrack(frames) });
    hits = [...stationBeats, ...plan.programmed.hits.flat()].map(b => secondsAtBeat(recipe.beatGrid, b)).sort((a, b) => a - b);
    const bands = sensitiveBands(live()?.bands, state.sensitivity), t0 = window0(), t1 = window1(), inClip = (t: number) => t >= t0 && t <= t1;
    const beats: number[] = [];
    for (let b = 0; secondsAtBeat(recipe.beatGrid, b) <= t1; b++) beats.push(secondsAtBeat(recipe.beatGrid, b));
    strip.setScene({ track, start: t0, end: t1, beats, kicks: (bands?.low ?? []).map(o => o.seconds).filter(inClip), snares: (bands?.mid ?? []).map(o => o.seconds).filter(inClip),
      hats: (bands?.high ?? []).map(o => o.seconds).filter(inClip), added: state.markers ?? [], selected: hooks.slice?.selected ?? -1, locked: hits, muted: state.muted });
    $("resetMarkers").hidden = !state.muted.length;
    $("resetMarkers").textContent = `Reset markers (${state.muted.length})`;
    characterLane.render(); cameraLane.render();
    actions.sync();
    hooks.generate?.sync();
    hooks.slice?.sync();
    head = Math.max(t0, Math.min(t1, head));
    dirty = true;
  }
  /** The camera's track per block (smoothed over a quarter second), beat ticks and its hits, for the map. */
  function cameraTrack(frames: number) {
    const g = recipe.beatGrid, fr = (b: number) => Math.max(0, Math.min(frames - 1, Math.round(secondsAtBeat(g, b) * 24)));
    const pos = (n: number) => { const p = plan.samples[Math.max(0, Math.min(frames - 1, n))].position; return { x: p[0], z: p[2] }; };
    const smooth = (n: number) => { let x = 0, z = 0, c = 0; for (let k = -6; k <= 6; k += 2) { const q = pos(n + k); x += q.x; z += q.z; c++; } return { x: x / c, z: z / c }; };
    const sel = selection?.kind === "block" && selection.lane === "cameraLane" ? state.cameraLane[selection.index] : null;
    const NAME: Record<string, string> = { chase: "Follow behind", side: "Follow side", orbit: "Orbit", top: "Top", path: "My path", pushIn: "Push in", pullOut: "Pull out", rise: "Crane", static: "Hold", fixed: "Tripod", lead: "Follow front", threeQuarter: "Three-quarter", truck: "Truck" };
    followSegs = [];
    const cameraSegments = (recipe.camera?.segments ?? []).map(sg => {
      const points: { x: number; z: number }[] = [], frames: number[] = [];
      for (let n = fr(sg.fromBeat); n <= fr(sg.toBeat); n += 2) { points.push(smooth(n)); frames.push(n); }
      const side = sg.modes.includes("side") && Math.abs(sg.follow?.angle ?? 0) > 90 ? " right" : "";
      const label = sg.shoulder ? "Over shoulder" : sg.modes.map(m => NAME[m] ?? m).join(" + ") + side;
      const emphasis = !sel ? "normal" as const : sg.fromBeat >= sel.from - 1e-6 && sg.toBeat <= sel.to + 1e-6 ? "selected" as const : "dim" as const;
      // A plain follow block's line can be dragged: its frames carry where the subject is and which way it faces.
      const block = state.cameraLane.findIndex(b => sg.fromBeat >= b.from - 1e-6 && sg.toBeat <= b.to + 1e-6);
      const b = state.cameraLane[block], editable = !!b && isFollowWord(b.word) && !b.phrase;
      // With more than one block, each stretch carries its block's number (a sliced path shows which part plays when).
      const numbered = state.cameraLane.length > 1 && block >= 0 ? `${block + 1} · ${label}` : label;
      if (editable) followSegs.push({ block, word: b.word as "behind" | "side", points, anchors: frames.map(n => { const r = frameAt(recipe, n, live()).root; return { x: r.x, z: r.z, heading: r.yawRadians }; }) });
      return { label: numbered, points, emphasis, editable };
    });
    const subjectBeats: { x: number; z: number }[] = [], cameraBeats: { x: number; z: number }[] = [];
    for (let b = 0; b <= recipe.durationBeats; b++) { const r = frameAt(recipe, fr(b), live()).root; subjectBeats.push({ x: r.x, z: r.z }); cameraBeats.push(smooth(fr(b))); }
    const cameraHits = plan.programmed.hits.flat().map(b => smooth(fr(b)));
    return { cameraSegments, subjectBeats, cameraBeats, cameraHits };
  }
  let pending = 0;
  function schedule(now: boolean) {
    if (now) { cancelAnimationFrame(pending); pending = 0; rebuild(); return; }
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; rebuild(); });
  }

  let shown = 0;
  function show(seconds: number) {
    shown = seconds;
    const st = frameAt(recipe, seconds * recipe.fps, live());
    viewport.show(st);
    const cam = cameraAtSeconds(plan, seconds);
    map.setLive({ subject: { x: st.root.x, z: st.root.z, yaw: st.root.yawRadians }, camera: { x: cam.position[0], z: cam.position[2], tx: cam.target[0], tz: cam.target[2], fov: cam.fov } });
    strip.setHead(seconds);
    hooks.slice?.overview.setHead(seconds);
    // The transport bar under the screens: position, time and beat.
    const t = seconds - window0(), total = state.clip;
    $<HTMLInputElement>("scrub").value = String(Math.max(0, Math.min(1, t / total)));
    $("scrub").style.setProperty("--pos", `${Math.max(0, Math.min(100, t / total * 100))}%`);
    $("transportTime").textContent = `${Math.max(0, t).toFixed(2)} / ${total.toFixed(2)} s · beat ${Math.max(0, beatAtSeconds(recipe.beatGrid, seconds)).toFixed(1)}`;
    $("hudBeat").textContent = `beat ${Math.max(0, beatAtSeconds(recipe.beatGrid, seconds)).toFixed(1).padStart(4, " ")}`;
    let since = Infinity;
    for (const h of hits) if (h <= seconds + 1e-3) since = seconds - h;
    $("hudPulse").style.opacity = String(0.15 + 0.85 * Math.exp(-Math.max(0, since) / 0.12));
  }
  function tick() {
    if (player.playing && !busy) {
      head = player.position();
      if (head >= window1()) { head = window0(); player.play(track, head); }
      show(head);
    } else if (dirty && !busy) show(head);
    dirty = false;
    requestAnimationFrame(tick);
  }
  function setPlaying(on: boolean) {
    if (on) { if (head >= window1() - 0.05 || head < window0()) head = window0(); player.play(track, head); }
    else { if (player.playing) head = player.position(); player.stop(); }
    for (const id of ["play", "barPlay"]) { $(id).classList.toggle("playing", on); $(id).setAttribute("aria-label", on ? "Pause" : "Play"); }
    // The bar over the screens hides while playing (hover or focus brings it back).
    $("screens").classList.toggle("playing", on);
    dirty = true;
  }

  async function useTrack(next: Track, licence: string) {
    setPlaying(false);
    track = next;
    const f = next.features;
    drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1);
    info = { name: next.name, licence, bpm: f.estimatedBpm ?? 120, offsetSeconds: f.estimatedBpm ? f.estimatedOffsetSeconds : 0, lengthSeconds: f.lengthSeconds };
    strip.message = "";
    state = fitLanes(state, clipBeats(state.clip, info.bpm));
    head = info.offsetSeconds;
    rebuild();
    $("trackName").textContent = `${next.name} · ${info.bpm} BPM`;
    $("removeTrack").hidden = false;
    say(f.bands ? `${f.bands.low.length} kicks, ${f.bands.mid.length} snares found` : "No drums found: lock to the beat");
  }
  /** No track: a plain timed clip at 120 BPM on the wall clock, a time ruler instead of the waveform. */
  function removeTrack() {
    setPlaying(false);
    track = null; info = null; drive = flatDrive(24, 1);
    state = fitLanes(state, clipBeats(state.clip, 120));
    head = 0;
    rebuild();
    $("trackName").textContent = "No track · 120 BPM";
    $("removeTrack").hidden = true;
    say("Plain timed clip: no hits, so locks have nothing to land on");
  }
  /** An example's own music: generated by the in-repo synth (tracks.ts), or its file when one is set there. */
  async function useExampleTrack(id: keyof typeof EXAMPLE_TRACKS, current: () => boolean = () => true) {
    const t = EXAMPLE_TRACKS[id];
    if (t.file) {
      // A fetched track lands only if its example is still the one showing (rapid switching).
      try { const res = await fetch(t.file); const loaded = await loadTrack(new File([await res.blob()], t.name)); if (!current()) return; return useTrack(loaded, t.licence); }
      catch (e) { say(`Could not load ${t.file}: ${(e as Error).message}`); }
    }
    const bpm = GROOVES[t.groove].bpm, seconds = 0.1 + t.bars * 4 * 60 / bpm + 0.5;
    return useTrack(trackFromSamples(t.name, [synthDrums(grooveTimes(t.groove, t.bars, 0.1), seconds)], 44100), t.licence);
  }
  /** The example switcher: each slot keeps its own edits; an example brings its own music. */
  const slots = new Map<string, BeatPathState>();
  let slot = "0", switching = 0;
  async function switchSlot(next: string) {
    if (next === slot && slots.size) return;
    if (map.busy) map.cancelStroke();
    slots.set(slot, structuredClone(state));
    slot = next;
    const ticket = ++switching;
    setPlaying(false);
    past.length = 0; future.length = 0; dragBase = null;
    state = slots.get(next) ?? (next === "own" ? ownState() : exampleState(Number(next)));
    // Nothing selected carries over: a lane block, a path point or a scenery box of the last example.
    selection = null; blocks.selected = -1; menu.hide();
    if (state.track) { await useExampleTrack(state.track, () => ticket === switching); if (ticket !== switching) return; }
    else if (next === "own" && !track) rebuild();
    else { state = fitLanes(state, totalBeats()); rebuild(); }
    map.fit();
    actions.sync();
    hooks.generate?.onSlot(next);
  }
  async function useFile(file: File) {
    strip.message = `Decoding ${file.name}…`;
    strip.setScene({ track, start: window0(), end: window1(), beats: [], kicks: [], snares: [], hats: [], added: [], selected: -1, locked: [], muted: [] });
    try {
      const loaded = await loadTrack(file, stage => { strip.message = stage; strip.setScene({ track, start: window0(), end: window1(), beats: [], kicks: [], snares: [], hats: [], added: [], selected: -1, locked: [], muted: [] }); });
      // A new track starts at its first beat, with no markers of its own (the old ones belong to the old track).
      state = { ...state, slice: undefined, markers: undefined, muted: [] };
      await useTrack(loaded, "unspecified");
    }
    catch (e) { strip.message = ""; rebuild(); say(`Could not read the track: ${(e as Error).message}`); }
  }

  /** Bound after the page object exists (it needs the page); the rebuild reaches it through here. */
  const hooks: { generate?: ReturnType<typeof bindGenerate>; slice?: ReturnType<typeof bindSlice> } = {};
  const page = {
    $, map, menu, viewport, strip, player,
    get state() { return state; }, get recipe() { return recipe; }, get tool() { return tool; }, get view() { return view; },
    get track() { return track; }, get drive() { return live(); }, get info() { return info; }, get busy() { return busy; }, set busy(v: boolean) { busy = v; dirty = true; },
    get head() { return head; }, get shown() { return shown; }, get slot() { return slot; }, get followSegs() { return followSegs; }, get slice() { return hooks.slice; }, blocks, snapLane, seek, removeTrack, totalBeats, window0, window1, update, undo, rebuild, setPlaying, switchSlot, useFile, say,
    setTool(t: Tool) { tool = t; if (pen === "draw") map.startNew(); map.refresh(); actions.sync(); },
    setView(v: View) { view = v; map.refresh(); actions.sync(); },
    get pen() { return pen; },
    setPen(v: "edit" | "draw") { if (v === "draw" && pen !== "draw") map.startNew(); pen = v; actions.sync(); },
    get selection() { return selection; },
    setSelection(v: typeof selection) { selection = v; rebuild(); },
    retheme() { map.retheme(); strip.retheme(); hooks.slice?.retheme(); },
    /** A new example or script: rebuild and frame it on the map. */
    load(next: BeatPathState) { update(next); map.fit(); },
  };
  const actions = bindActions(page);
  initPills(root);
  hooks.generate = bindGenerate(page);
  hooks.slice = bindSlice(page);
  rebuild();
  map.fit();
  // First run: Example 1 with its own music, ready after one click on Play.
  void useExampleTrack(state.track ?? "flyer").then(() => { map.fit(); hooks.generate?.onSlot(slot); });
  requestAnimationFrame(tick);
  return page;
}
