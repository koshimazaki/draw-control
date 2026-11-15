/**
 * The playhead across the timeline: a line over both lanes at the page's clock (the music strip
 * draws its own), at any zoom, and a click or drag on a lane's empty space moves the playback
 * position. Blocks keep their own gestures (move, edges, menu). Every move goes through the page's
 * one clock (`seek`), so the audio, the preview, the map's figure and a result video follow it,
 * playing or paused, and it stays inside the clip window. Split from page-actions.ts.
 */
import { captureDrag } from "./drag";

type Page = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  readonly head: number; state: { clip: number };
  window0(): number;
  seek(seconds: number): void;
};

/** The clip's time at a fraction of the timeline's width (0 to 1, clamped). */
export const timeAtFraction = (window0: number, clip: number, fraction: number) => window0 + Math.max(0, Math.min(1, fraction)) * clip;

export function bindPlayhead(p: Page) {
  const inner = p.$("tlInner"), line = document.createElement("div");
  line.className = "tl-head";
  line.setAttribute("aria-hidden", "true");
  inner.append(line);
  let last = -1;
  const place = () => {
    const f = Math.max(0, Math.min(1, (p.head - p.window0()) / Math.max(0.001, p.state.clip)));
    if (f !== last) { line.style.left = `${f * 100}%`; last = f; }
    requestAnimationFrame(place);
  };
  requestAnimationFrame(place);
  for (const id of ["laneCharacter", "laneCamera"]) {
    const lane = p.$(id);
    lane.addEventListener("pointerdown", e => {
      if (e.target !== lane || e.button !== 0) return;   // a block, its edge or its menu: as before
      const at = (ev: PointerEvent) => { const r = lane.getBoundingClientRect(); return timeAtFraction(p.window0(), p.state.clip, (ev.clientX - r.left) / Math.max(1, r.width)); };
      e.preventDefault();
      p.seek(at(e));
      captureDrag(lane, e, ev => p.seek(at(ev)));
    });
  }
}
