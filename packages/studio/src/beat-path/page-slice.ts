/**
 * The audio slicer: the track overview's window (where the clip starts in a longer track),
 * its typed start, the beat snap and nudges, your own markers on the music strip (add with
 * Alt-click in the chosen kind, drag, Delete), and the hit counts in the legend. Everything
 * is page state (`slice`, `markers`), so undo and the shot script cover it. Split from page.ts.
 * Slice and Export under Sensitivity: the music inside the window becomes the track, or a WAV
 * file (track-cut.ts).
 */
import type { AudioDrive, Recipe } from "@motion-studio/core";
import { clipBeats, sensitiveBands, sliceStart } from "@motion-studio/core/internal";
import { trackFromSamples, type Track } from "../audio";
import { download } from "../shared/download";
import { cutChannels, exportName, moveOntoCut, slicedName, windowWav } from "./track-cut";
import { TrackOverview } from "./overview";
import type { TrackInfo } from "./recipe-map";
import { clampClip, fitLanes, type BeatPathState } from "./script";

type Band = "low" | "mid" | "high";
type Page = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  state: BeatPathState; recipe: Recipe; track: Track | null; info: TrackInfo | null; drive: AudioDrive | undefined;
  window0(): number; window1(): number;
  /** False when the page refused the edit (a guide is rendering). */
  update(next: BeatPathState, final?: boolean): boolean;
  seek(seconds: number): void;
  say(text: string): void;
  /** Load a cut as the track, on the same beat grid, every state moved by `move` (false when refused). */
  useCut(next: Track, move: (s: BeatPathState) => BeatPathState): boolean;
};

/** A sliced track's original: its name and where the cut starts in it (so a second slice still names the original's seconds). */
const origins = new WeakMap<Track, { name: string; offset: number }>();
const originOf = (t: Track) => origins.get(t) ?? { name: t.name, offset: 0 };

/** The window's start for a wanted time: snapped to the track's beats (snap on) and kept inside the track. */
export function sliceFor(at: number, info: TrackInfo, clip: number, snap: boolean): number {
  return sliceStart(at, { bpm: info.bpm, firstBeat: info.offsetSeconds, lengthSeconds: info.lengthSeconds }, clip, snap);
}
/** Does the track run longer than the clip (so a window can move)? */
export const sliceable = (info: TrackInfo | null, clip: number) => !!info && info.lengthSeconds > clip + 0.5;

export function bindSlice(p: Page) {
  const { $ } = p;
  const snap = () => $<HTMLInputElement>("snap").checked;
  let kind: Band = "low", selected = -1;
  const overview = new TrackOverview($<HTMLCanvasElement>("overview"), {
    move: (at, final) => moveTo(at, final),
    resize: (edge, at, final) => resizeTo(edge, at, final),
    nudge: dir => {
      const info = p.info;
      if (!info) return;
      const step = snap() ? 60 / info.bpm : 1 / 24;
      moveTo(p.window0() + dir * step, true);
    },
  });
  function moveTo(at: number, final: boolean) {
    const info = p.info;
    if (!info || !sliceable(info, p.state.clip)) return;
    const start = sliceFor(at, info, p.state.clip, snap());
    if (start === p.state.slice && !final) return;
    if (!p.update({ ...p.state, slice: start }, final)) return;
    p.seek(start);
    if (final) p.say(`Clip from ${start.toFixed(2)} s to ${(start + p.state.clip).toFixed(2)} s of the track${snap() ? " (on the beat)" : ""}`);
  }
  /** A bracket dragged: the clip's length in whole seconds (3–30, inside the track), the other end held; the lanes refit. */
  function resizeTo(edge: "start" | "end", at: number, final: boolean) {
    const info = p.info;
    if (!info) return;
    const start0 = p.window0(), end0 = start0 + p.state.clip, room = (from: number) => Math.floor(info.lengthSeconds - from - 0.05);
    let start = start0, clip: number;
    if (edge === "end") clip = Math.min(room(start0), clampClip(at - start0));
    else { clip = clampClip(end0 - at); start = sliceFor(Math.max(0, end0 - clip), info, clip, snap()); clip = Math.min(clip, room(start)); }
    if (clip < 3) return;
    if (clip === p.state.clip && start === p.window0() && !final) return;
    if (!p.update(fitLanes({ ...p.state, clip, slice: start }, clipBeats(clip, info.bpm)), final)) return;
    if (final) p.say(`Clip ${clip} s, from ${start.toFixed(2)} s to ${(start + clip).toFixed(2)} s of the track · the lanes fit it`);
  }
  $<HTMLInputElement>("sliceStart").onchange = () => { const v = Number($<HTMLInputElement>("sliceStart").value); if (Number.isFinite(v)) moveTo(v, true); };

  // The legend picks the kind Alt-click adds.
  document.querySelectorAll<HTMLButtonElement>(".legend .kind").forEach(b => b.addEventListener("click", () => {
    kind = b.dataset.band as Band;
    document.querySelectorAll<HTMLButtonElement>(".legend .kind").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); });
    p.say(`Alt-click the music strip to add a ${{ low: "kick", mid: "snare", high: "hat" }[kind]}`);
  }));

  const markers = () => p.state.markers ?? [];
  const setMarkers = (list: { band: Band; seconds: number }[], final = true) =>
    p.update({ ...p.state, markers: list.length ? [...list].sort((a, b) => a.seconds - b.seconds) : undefined }, final);
  const r3 = (t: number) => Math.round(t * 1000) / 1000;
  /** Hooks for the music strip. */
  const stripHooks = {
    add(seconds: number) {
      const t = r3(seconds), list = [...markers(), { band: kind, seconds: t }];
      if (!setMarkers(list)) return;
      selected = markers().findIndex(m => m.band === kind && m.seconds === t);
      p.say(`Added a ${{ low: "kick", mid: "snare", high: "hat" }[kind]} at ${(t - p.window0()).toFixed(2)} s · drag it to move, Delete removes it`);
    },
    move(index: number, seconds: number, final: boolean) {
      const t = r3(Math.max(p.window0(), Math.min(p.window1(), seconds)));
      const list = markers().map((m, i) => (i === index ? { ...m, seconds: t } : m));
      if (!p.update({ ...p.state, markers: list }, final)) return;   // kept in place while dragging, sorted on release
      if (final) { const m = list[index]; setMarkers(list, false); selected = markers().findIndex(x => x.band === m.band && x.seconds === m.seconds); }
    },
    select(index: number) { selected = index; },
    /** A detected hit dragged off its place: switched off there, a marker of its band in its place (the drag then moves it; the whole drag is one undo step). */
    detach(seconds: number, band: Band) {
      const t = r3(seconds), s = p.state;
      const muted = s.muted.some(m => Math.abs(m - t) < 0.012) ? s.muted : [...s.muted, t].sort((x, y) => x - y);
      const list = [...markers(), { band, seconds: t }].sort((x, y) => x.seconds - y.seconds);
      if (!p.update({ ...s, muted, markers: list }, false)) return -1;
      selected = list.findIndex(m => m.band === band && m.seconds === t);
      return selected;
    },
  };
  /** Delete removes the selected marker (true when it did). */
  function removeSelected(): boolean {
    if (selected < 0 || selected >= markers().length) return false;
    if (!setMarkers(markers().filter((_, i) => i !== selected))) return true;   // refused: said, and the key is handled
    selected = -1;
    p.say("Marker removed");
    return true;
  }

  // Slice: the track becomes the music inside the window, analysed again; Export: that music as a WAV file.
  const sliceButton = $<HTMLButtonElement>("sliceTrack"), exportButton = $<HTMLButtonElement>("exportTrack");
  sliceButton.onclick = () => {
    const track = p.track, info = p.info;
    if (!track || !sliceable(info, p.state.clip)) return;
    const start = p.window0(), clip = p.state.clip, origin = originOf(track);
    const cut = trackFromSamples(slicedName(origin.name, origin.offset + start, origin.offset + start + clip), cutChannels(track.buffer, start, clip), track.buffer.sampleRate);
    origins.set(cut, { name: origin.name, offset: origin.offset + start });
    // An example keeps its cut when it shows again (its markers moved onto the cut); its whole music comes back with a reload.
    const example = !!p.state.track;
    if (p.useCut(cut, s => moveOntoCut(s, start, clip))) p.say(`Sliced to ${clip.toFixed(1)} s. ${example ? "The example keeps this cut while the page is open: reload the page for its whole music" : "Load the file again to get the whole track back"}`);
  };
  exportButton.onclick = () => {
    const track = p.track;
    if (!track) return;
    const start = p.window0(), clip = p.state.clip, origin = originOf(track), name = exportName(origin.name, origin.offset + start, origin.offset + start + clip);
    download(windowWav(track.buffer, start, clip), name, "audio/wav");
    p.say(`Saved ${name} (${clip.toFixed(1)} s) to your downloads · load it again with Your track`);
  };

  /** After a rebuild: the overview's track and window, the typed start, the counts in the clip, Slice and Export. */
  function sync() {
    const info = p.info, on = sliceable(info, p.state.clip);
    sliceButton.disabled = !p.track || !on;
    exportButton.disabled = !p.track;
    document.querySelector(".editor")?.classList.toggle("with-overview", on);
    overview.setTrack(on ? p.track : null);
    if (on) overview.setWindow(p.window0(), p.state.clip);
    const field = $<HTMLInputElement>("sliceStart");
    if (document.activeElement !== field) field.value = p.window0().toFixed(2);
    const bands = sensitiveBands(p.drive?.bands, p.state.sensitivity), t0 = p.window0(), t1 = p.window1(), muted = p.state.muted;
    const count = (band: Band) => (bands?.[band] ?? []).filter(o => o.seconds >= t0 && o.seconds <= t1 && !muted.some(m => Math.abs(m - o.seconds) < 0.012)).length
      + markers().filter(m => m.band === band && m.seconds >= t0 && m.seconds <= t1).length;
    $("countLow").textContent = String(count("low")); $("countMid").textContent = String(count("mid")); $("countHigh").textContent = String(count("high"));
    const sens = Math.round((p.state.sensitivity ?? 1) * 100), field2 = $<HTMLInputElement>("sensitivity");
    if (document.activeElement !== field2) field2.value = String(sens);
    $("sensitivityOut").textContent = `${sens}%`;
  }
  // Hit sensitivity: the counts and the strip follow the drag; the whole drag is one undo step.
  const sensInput = $<HTMLInputElement>("sensitivity");
  const setSens = (final: boolean) => { const v = Number(sensInput.value) / 100; return p.update({ ...p.state, sensitivity: v >= 1 ? undefined : v }, final); };
  sensInput.addEventListener("input", () => setSens(false));
  sensInput.addEventListener("change", () => { if (setSens(true)) p.say(`Sensitivity ${sensInput.value}%: the locks land on ${$("countLow").textContent} kicks, ${$("countMid").textContent} snares, ${$("countHigh").textContent} hats in the clip`); });
  return { overview, stripHooks, removeSelected, sync, get selected() { return selected; }, retheme: () => overview.retheme() };
}
