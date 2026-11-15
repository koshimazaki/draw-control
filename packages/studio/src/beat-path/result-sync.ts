/**
 * Smooth playback of a generated clip beside the preview.
 *
 * - Local copies: a result is fetched once into this tab (a blob URL; the same download as the
 *   browser's kept copy, or read from that copy, result-fetch.ts), so the player reads from
 *   memory, not from the provider's link. A link the page may not read (no CORS) is played as
 *   it is. A copy no element shows any more is released.
 * - Following the page's clock: while the page plays, the clip plays too and is only
 *   corrected when it drifts; while paused, it is set to the page's frame. (Setting its time
 *   on every animation frame makes it seek 60 times a second and never actually play.)
 */

import { results } from "./result-fetch";

/** How far a playing clip may drift from the page's clock before it is put back (seconds). */
export const DRIFT = 0.15;
/** How far a paused clip may sit from the page's frame (half a frame at 24 fps). */
export const STILL = 1 / 48;

export type FollowStep = { play?: true; pause?: true; seek?: number };

/** What to do to the clip this frame, given its time and state and the page's. */
export function followStep(clip: { time: number; paused: boolean; duration: number }, page: { time: number; playing: boolean }): FollowStep {
  const d = clip.duration, bounded = Number.isFinite(d) && d > 0, target = Math.max(0, bounded ? Math.min(page.time, d) : page.time);
  const off = Math.abs(clip.time - target), step: FollowStep = {};
  // Past the clip's end (a result shorter than the page's clip): its last frame is held until the page
  // loops. play() on an ended clip restarts it from 0, so it would flicker between its first and last frame.
  const past = bounded && page.time >= d - STILL;
  if (page.playing && !past) {
    if (clip.paused) { step.play = true; if (off > STILL) step.seek = target; }
    else if (off > DRIFT) step.seek = target;
  } else {
    if (!clip.paused) step.pause = true;
    if (off > STILL) step.seek = target;
  }
  return step;
}

/** Apply a step to a video element. */
export function applyStep(v: HTMLVideoElement, s: FollowStep) {
  if (s.seek !== undefined && !v.seeking) v.currentTime = s.seek;
  if (s.play) void v.play().catch(() => { /* autoplay refused: the page's play button retries */ });
  if (s.pause) v.pause();
}

/** An element that may be showing a copy: still in the page, and its source. */
export type Viewer = { readonly isConnected: boolean; readonly src: string };
type Copy = { promise: Promise<string>; blob?: string; users: Set<Viewer>; touched: number };
/** A copy just made or just handed out is kept this long even with no viewer yet (its element is being set up). */
export const COPY_GRACE_MS = 5000;

/**
 * The blob URLs made for results, one per link, with the elements showing each. A copy no element
 * shows any more (replaced, or its row re-rendered) is released when the next copy is asked for;
 * asked for again later, it is made again from the bytes the browser keeps (result-fetch.ts).
 */
export class Copies {
  private copies = new Map<string, Copy>();
  constructor(private urls: { create(b: Blob): string; revoke(u: string): void } = { create: b => URL.createObjectURL(b), revoke: u => URL.revokeObjectURL(u) },
    private now: () => number = () => Date.now()) {}

  /** A blob URL holding the file at `url`, or `url` itself when the page may not read it. */
  get(url: string, load: (url: string) => Promise<Blob>): Promise<string> {
    this.sweep(url);
    const known = this.copies.get(url);
    if (known) { known.touched = this.now(); return known.promise; }
    const c: Copy = { users: new Set(), touched: this.now(), promise: Promise.resolve(url) };
    c.promise = load(url).then(b => { c.blob = this.urls.create(b); c.touched = this.now(); return c.blob; }, () => { this.copies.delete(url); return url; });
    this.copies.set(url, c);
    return c.promise;
  }
  /** `v` now shows the copy of `url`. */
  use(url: string, v: Viewer) { const c = this.copies.get(url); if (c) { c.users.add(v); c.touched = this.now(); } }
  /** Release every finished copy no element shows (except `keep`). */
  sweep(keep?: string) {
    for (const [url, c] of this.copies) {
      if (url === keep || !c.blob) continue;
      for (const v of c.users) if (!v.isConnected || v.src !== c.blob) c.users.delete(v);
      if (!c.users.size && this.now() - c.touched > COPY_GRACE_MS) { this.urls.revoke(c.blob); this.copies.delete(url); }
    }
  }
  get size() { return this.copies.size; }
}

const copies = new Copies();
/** A blob URL holding the clip at `url` (one download, shared with the browser's copy), or `url` itself when it cannot be read. */
export function localCopy(url: string, load: (url: string) => Promise<Blob> = results.get): Promise<string> {
  if (!/^https?:/i.test(url)) return Promise.resolve(url);
  return copies.get(url, load);
}

/**
 * Point a video at the local copy of `url`. The link is not streamed meanwhile (that was a second
 * download of the same file): the video waits for the copy, and gets the link itself only when
 * the page may not read it. Resolves with the source it got (a blob URL can be drawn on a canvas).
 */
export function playLocal(v: HTMLVideoElement, url: string, load?: (url: string) => Promise<Blob>): Promise<string> {
  v.preload = "auto";
  v.dataset.result = url;
  if (!/^https?:/i.test(url)) { v.src = url; return Promise.resolve(url); }
  return localCopy(url, load).then(src => {
    if (v.dataset.result !== url) return src;   // pointed at another result meanwhile
    v.src = src;
    copies.use(url, v);
    return src;
  });
}
