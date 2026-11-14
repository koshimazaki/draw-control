/**
 * Smooth playback of a generated clip beside the preview.
 *
 * - Local copies: a result is fetched once into this tab (a blob URL), so the player
 *   reads from memory, not from the provider's link. A link the page may not read (no CORS)
 *   is played as it is.
 * - Following the page's clock: while the page plays, the clip plays too and is only
 *   corrected when it drifts; while paused, it is set to the page's frame. (Setting its time
 *   on every animation frame makes it seek 60 times a second and never actually play.)
 */

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

const copies = new Map<string, Promise<string>>();
/** A blob URL holding the clip at `url` (fetched once per tab), or `url` itself when it cannot be read. */
export function localCopy(url: string, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<string> {
  if (!/^https?:/i.test(url)) return Promise.resolve(url);
  let p = copies.get(url);
  if (!p) {
    p = fetcher(url, { mode: "cors" })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return URL.createObjectURL(await r.blob()); })
      .catch(() => { copies.delete(url); return url; });
    copies.set(url, p);
  }
  return p;
}

/** Point a video at the local copy of `url` (the link meanwhile, so nothing waits on the fetch). */
export function playLocal(v: HTMLVideoElement, url: string, fetcher?: typeof fetch) {
  v.preload = "auto";
  v.src = url;
  if (!/^https?:/i.test(url)) return;
  void localCopy(url, fetcher).then(local => {
    if (local === url || v.getAttribute("src") !== url) return;
    const t = v.currentTime, wasPlaying = !v.paused;
    v.src = local;
    v.addEventListener("loadedmetadata", () => { v.currentTime = t; if (wasPlaying) void v.play().catch(() => {}); }, { once: true });
  });
}
