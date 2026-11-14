/**
 * The audio slicer: the track overview's window (where the clip starts in a longer track),
 * its typed start, the beat snap and nudges, your own markers on the music strip (add with
 * Alt-click in the chosen kind, drag, Delete), and the hit counts in the legend. Everything
 * is page state (`slice`, `markers`), so undo and the shot script cover it. Split from page.ts.
 */
import type { AudioDrive, Recipe } from "@motion-studio/core";
import { sliceStart } from "@motion-studio/core/internal";
import type { Track } from "../audio";
import { TrackOverview } from "./overview";
import type { TrackInfo } from "./recipe-map";
import type { BeatPathState } from "./script";

type Band = "low" | "mid" | "high";
type Page = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  state: BeatPathState; recipe: Recipe; track: Track | null; info: TrackInfo | null; drive: AudioDrive | undefined;
  window0(): number; window1(): number;
  update(next: BeatPathState, final?: boolean): void;
  seek(seconds: number): void;
  say(text: string): void;
};

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
    p.update({ ...p.state, slice: start }, final);
    p.seek(start);
    if (final) p.say(`Clip from ${start.toFixed(2)} s to ${(start + p.state.clip).toFixed(2)} s of the track${snap() ? " (on the beat)" : ""}`);
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
      setMarkers(list);
      selected = markers().findIndex(m => m.band === kind && m.seconds === t);
      p.say(`Added a ${{ low: "kick", mid: "snare", high: "hat" }[kind]} at ${(t - p.window0()).toFixed(2)} s · drag it to move, Delete removes it`);
    },
    move(index: number, seconds: number, final: boolean) {
      const t = r3(Math.max(p.window0(), Math.min(p.window1(), seconds)));
      const list = markers().map((m, i) => (i === index ? { ...m, seconds: t } : m));
      p.update({ ...p.state, markers: list }, final);   // kept in place while dragging, sorted on release
      if (final) { const m = list[index]; setMarkers(list, false); selected = markers().findIndex(x => x.band === m.band && x.seconds === m.seconds); }
    },
    select(index: number) { selected = index; },
    /** A detected hit dragged off its place: switched off there, a marker of its band in its place (the drag then moves it; the whole drag is one undo step). */
    detach(seconds: number, band: Band) {
      const t = r3(seconds), s = p.state;
      const muted = s.muted.some(m => Math.abs(m - t) < 0.012) ? s.muted : [...s.muted, t].sort((x, y) => x - y);
      const list = [...markers(), { band, seconds: t }].sort((x, y) => x.seconds - y.seconds);
      p.update({ ...s, muted, markers: list }, false);
      selected = list.findIndex(m => m.band === band && m.seconds === t);
      return selected;
    },
  };
  /** Delete removes the selected marker (true when it did). */
  function removeSelected(): boolean {
    if (selected < 0 || selected >= markers().length) return false;
    setMarkers(markers().filter((_, i) => i !== selected));
    selected = -1;
    p.say("Marker removed");
    return true;
  }

  /** After a rebuild: the overview's track and window, the typed start, the counts in the clip. */
  function sync() {
    const info = p.info, on = sliceable(info, p.state.clip);
    document.querySelector(".editor")?.classList.toggle("with-overview", on);
    overview.setTrack(on ? p.track : null);
    if (on) overview.setWindow(p.window0(), p.state.clip);
    const field = $<HTMLInputElement>("sliceStart");
    if (document.activeElement !== field) field.value = p.window0().toFixed(2);
    const bands = p.drive?.bands, t0 = p.window0(), t1 = p.window1(), muted = p.state.muted;
    const count = (band: Band) => (bands?.[band] ?? []).filter(o => o.seconds >= t0 && o.seconds <= t1 && !muted.some(m => Math.abs(m - o.seconds) < 0.012)).length
      + markers().filter(m => m.band === band && m.seconds >= t0 && m.seconds <= t1).length;
    $("countLow").textContent = String(count("low")); $("countMid").textContent = String(count("mid")); $("countHigh").textContent = String(count("high"));
  }
  return { overview, stripHooks, removeSelected, sync, get selected() { return selected; }, retheme: () => overview.retheme() };
}
