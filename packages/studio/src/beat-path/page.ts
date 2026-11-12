/**
 * The Beat Path page: draw a path, add music, and the movement and the camera lock to the
 * beat; export a guide clip. A thin surface over the core (public entry) and the studio's
 * viewport, audio player and bundle export. The page state is a shot script (script.ts):
 * every edit changes the state, `beatPathRecipe` applies its script, and the preview, map,
 * strip and lanes redraw. page-actions.ts binds the buttons, the menus and the keyboard.
 */
import {
  beatAtSeconds, buildDrive, cameraAtSeconds, clipBeats, flatDrive, frameAt, planCamera, secondsAtBeat, snapBeat, travelStations,
  type AudioDrive, type CameraPlan, type Recipe,
} from "@motion-studio/core";
import { Player, loadTrack, trackFromSamples, type Track } from "../audio";
import { createGlider } from "../characters/glider";
import { DEMO_LICENCE, DEMO_TRACK_NAME, demoDrums } from "../demo";
import { Viewport } from "../viewport";
import { exampleState } from "./examples";
import { LaneView, Menu } from "./lanes";
import { LAYOUT } from "./layout";
import { MapView, type Tool, type View } from "./map";
import { bindActions } from "./page-actions";
import { beatPathRecipe, type TrackInfo } from "./recipe-map";
import { LABELS, fitLanes, type BeatPathState, type CameraWord, type CharacterWord } from "./script";
import { AudioStrip } from "./strip";

export type Page = ReturnType<typeof startBeatPath>;

export function startBeatPath(root: HTMLElement) {
  root.innerHTML = LAYOUT;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  let state: BeatPathState = exampleState(0);
  let tool: Tool = "subject", view: View = "top";
  let track: Track | null = null, info: TrackInfo | null = null;
  let drive: AudioDrive = flatDrive(24, 1);
  let recipe: Recipe = beatPathRecipe(state, null), plan: CameraPlan;
  let hits: number[] = [];
  let busy = false, started = false, head = 0, dirty = true;
  const past: BeatPathState[] = [], future: BeatPathState[] = [];
  let dragBase: BeatPathState | null = null;
  const player = new Player();
  const live = () => (track ? drive : undefined);
  const bpm = () => info?.bpm ?? 120;
  const totalBeats = () => clipBeats(state.clip, bpm());
  const window0 = () => secondsAtBeat(recipe.beatGrid, 0);
  const window1 = () => window0() + state.clip;

  const viewport = new Viewport($("preview"));
  viewport.setCharacter(createGlider());
  viewport.setShowPaths(false);
  viewport.setGrid(true);
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
    rebuild();
  }

  const map = new MapView($<HTMLCanvasElement>("map"), {
    tool: () => tool, view: () => view,
    points: t => (t === "subject" ? state.subject : state.camera),
    corners: t => (t === "subject" ? state.subjectCorners : state.cameraCorners),
    change: (t, points, final) => {
      const next = { ...state, ...(t === "subject" ? { subject: points } : { camera: points }) };
      // A drawn camera path is used: a lane without "my path" gets it over its whole length.
      if (t === "camera" && final && points.length >= 2 && !next.cameraLane.some(b => b.word === "path")) next.cameraLane = [{ from: 0, to: totalBeats(), word: "path" }];
      update(next, final);
    },
  });
  const strip = new AudioStrip($<HTMLCanvasElement>("wave"), seconds => { head = Math.max(window0(), Math.min(window1(), seconds)); if (player.playing) player.play(track, head); dirty = true; });
  const menu = new Menu($("menu"));
  const lane = <W extends string>(id: string, key: "character" | "cameraLane", labels: Record<W, string>, words: readonly W[], single?: W) => {
    const view: LaneView<W> = new LaneView<W>($(id), {
      blocks: () => state[key] as unknown as { from: number; to: number; word: W }[],
      total: totalBeats,
      label: w => labels[w],
      snap: b => snapBeat(recipe, b, "halfBeat"),
      commit: (blocks, final) => update({ ...state, [key]: blocks }, final),
      open: (anchor, i, beat) => actions.openBlock(key, view, anchor, i, beat, labels, words, single),
    });
    return view;
  };
  const characterLane = lane<CharacterWord>("laneCharacter", "character", LABELS.character, ["glide", "hover", "spin", "jump"], "glide");
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
    map.setScene({ floor, stations, trail });
    hits = [...stationBeats, ...plan.programmed.hits.flat()].map(b => secondsAtBeat(recipe.beatGrid, b)).sort((a, b) => a - b);
    const bands = live()?.bands, t0 = window0(), t1 = window1(), inClip = (t: number) => t >= t0 && t <= t1;
    const beats: number[] = [];
    for (let b = 0; secondsAtBeat(recipe.beatGrid, b) <= t1; b++) beats.push(secondsAtBeat(recipe.beatGrid, b));
    strip.setScene({ track, start: t0, end: t1, beats, kicks: (bands?.low ?? []).map(o => o.seconds).filter(inClip), snares: (bands?.mid ?? []).map(o => o.seconds).filter(inClip), locked: hits });
    characterLane.render(); cameraLane.render();
    actions.sync();
    head = Math.max(t0, Math.min(t1, head));
    dirty = true;
  }
  let pending = 0;
  function schedule(now: boolean) {
    if (now) { cancelAnimationFrame(pending); pending = 0; rebuild(); return; }
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; rebuild(); });
  }

  function show(seconds: number) {
    const st = frameAt(recipe, seconds * recipe.fps, live());
    viewport.show(st);
    const cam = cameraAtSeconds(plan, seconds);
    map.setLive({ subject: { x: st.root.x, z: st.root.z, yaw: st.root.yawRadians }, camera: { x: cam.position[0], z: cam.position[2], tx: cam.target[0], tz: cam.target[2], fov: cam.fov } });
    strip.setHead(seconds);
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
    if (on) { if (head >= window1() - 0.05 || head < window0()) head = window0(); player.play(track, head); started = true; }
    else { if (player.playing) head = player.position(); player.stop(); }
    $("play").classList.toggle("playing", on);
    $("play").setAttribute("aria-label", on ? "Pause" : "Play");
    $("bigPlay").hidden = started;
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
    say(f.bands ? `${f.bands.low.length} kicks, ${f.bands.mid.length} snares found` : "No drums found: lock to the beat");
  }
  const useDemo = () => { const d = demoDrums(); return useTrack(trackFromSamples(DEMO_TRACK_NAME, [d.samples], d.sampleRate), DEMO_LICENCE); };
  async function useFile(file: File) {
    strip.message = `Decoding ${file.name}…`;
    strip.setScene({ track, start: window0(), end: window1(), beats: [], kicks: [], snares: [], locked: [] });
    try { await useTrack(await loadTrack(file), "unspecified"); }
    catch (e) { strip.message = ""; rebuild(); say(`Could not read the track: ${(e as Error).message}`); }
  }

  const page = {
    $, map, menu, viewport, strip, player,
    get state() { return state; }, get recipe() { return recipe; }, get tool() { return tool; }, get view() { return view; },
    get track() { return track; }, get drive() { return live(); }, get info() { return info; }, get busy() { return busy; }, set busy(v: boolean) { busy = v; dirty = true; },
    get head() { return head; }, totalBeats, window0, window1, update, undo, rebuild, setPlaying, useDemo, useFile, say,
    setTool(t: Tool) { tool = t; map.refresh(); actions.sync(); },
    setView(v: View) { view = v; map.refresh(); actions.sync(); },
    retheme() { map.retheme(); strip.retheme(); },
  };
  const actions = bindActions(page);
  rebuild();
  void useDemo();
  requestAnimationFrame(tick);
  return page;
}
