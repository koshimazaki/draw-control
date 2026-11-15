/**
 * The files of finished runs, kept in this browser (Cache Storage). Runware is infrastructure: it
 * does not keep a customer's results for re-download, so the page keeps its own copy of each video
 * or image as soon as the run is done. Show and Download then work after the provider's link has
 * gone. A copy is tried a few times with a growing wait; one that still fails (a link the page
 * may not read, the network, the provider) keeps the link, says why, and is tried again on a later
 * visit while the link may still work. Only the runs in the log keep their files; the copies of
 * runs dropped from it are deleted.
 */
import type { RunEntry, RunLog } from "./run-log";
import { download as saveFile } from "../shared/download";
import { results } from "./result-fetch";

const CACHE = "beat-path-runs";
const keyOf = (taskUUID: string) => new URL(`/__beat-path-runs/${taskUUID}`, location.origin).href;
const supported = () => typeof caches !== "undefined";

/** The waits between tries of a copy (a network blip, a 5xx, a CDN not serving the file yet): four tries in about 13 s. */
export const COPY_DELAYS_MS = [1000, 3000, 9000];
/** How long a provider's link may still work after its run: a failed copy is tried again on a later visit until then. */
export const LINK_ALIVE_MS = 24 * 60 * 60_000;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** `once` until it succeeds, waiting `delays` between tries; the last error is thrown. */
export async function withRetry<T>(once: () => Promise<T>, delays: readonly number[] = COPY_DELAYS_MS, wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await once(); } catch (err) { if (i >= delays.length) throw err; await wait(delays[i]); }
  }
}

/** Why a copy failed, without guessing: a refused or failed read (a TypeError) can be CORS or the network, so it is not called CORS. */
export function copyErrorText(err: unknown, tries: number): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const why = err instanceof TypeError ? "the page could not read the link (it may not allow copying, or the network failed)"
    : /^HTTP \d+/.test(msg) ? `the provider answered ${msg}` : msg || "unknown error";
  return `not copied after ${tries} ${tries === 1 ? "try" : "tries"}: ${why}`;
}

/**
 * Whether a done run's file is to be copied now (at most once per page load, `tried`): never
 * copied yet, or a failed copy whose link may still work (not a blob URL of an earlier page, and
 * within LINK_ALIVE_MS of the run).
 */
export function shouldCopy(e: RunEntry, now: number, pageStart: number, tried: boolean): boolean {
  if (tried || e.status !== "done" || !e.url || e.saved) return false;
  if (e.url.startsWith("blob:") && e.at < pageStart) return false;
  return e.saved === undefined || now - e.at < LINK_ALIVE_MS;
}

/** Copy a done run's file into the browser, trying again a few times; the log records whether it worked. */
export async function saveAsset(log: RunLog, e: RunEntry, o: { load?: (url: string) => Promise<Blob>; delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {}): Promise<boolean> {
  if (!supported() || !e.url) return false;
  const url = e.url, load = o.load ?? results.get, delays = o.delays ?? COPY_DELAYS_MS;
  try {
    const blob = await withRetry(() => load(url), delays, o.wait);
    const type = blob.type || (e.kind === "video" ? "video/mp4" : "image/png");
    await (await caches.open(CACHE)).put(keyOf(e.taskUUID), new Response(blob, { headers: { "Content-Type": type } }));
    log.update(e.taskUUID, { saved: true, saveError: undefined });
    return true;
  } catch (err) {
    log.update(e.taskUUID, { saved: false, saveError: copyErrorText(err, delays.length + 1) });
    return false;
  }
}

/** The run's file from the browser's copy, or null when there is none. */
export async function savedBlob(e: RunEntry): Promise<Blob | null> {
  if (!supported() || !e.saved) return null;
  try { const r = await (await caches.open(CACHE)).match(keyOf(e.taskUUID)); return r ? await r.blob() : null; } catch { return null; }
}

/** Where the page's result fetch looks first (result-fetch.ts): a run's file kept here is read from here, not downloaded again. */
export const storedLookup = (log: RunLog) => async (url: string): Promise<Blob | null> => {
  const e = log.list().find(x => x.url === url && x.saved);
  return e ? savedBlob(e) : null;
};

/** Drop the copies of runs no longer in the log. */
export async function pruneAssets(log: RunLog) {
  if (!supported()) return;
  try {
    const c = await caches.open(CACHE), keep = new Set(log.list().map(e => keyOf(e.taskUUID)));
    for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
  } catch { /* storage off: nothing to drop */ }
}

/** A file name for a download: example, model, time. */
export function fileName(e: RunEntry, type: string) {
  const ext = type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : e.kind === "video" ? "mp4" : "png";
  const d = new Date(e.at), two = (n: number) => String(n).padStart(2, "0");
  const when = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;   // local time, as the list shows
  const where = e.slot === "own" ? "own" : `ex${Number(e.slot) + 1}`;
  return `beat-path-${where}-${e.model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${when}.${ext}`;
}

/** Save the run's file to the computer: the browser's copy, else the link if it may be read, else open the link. */
export async function download(e: RunEntry): Promise<"saved" | "fetched" | "opened"> {
  let blob = await savedBlob(e), how: "saved" | "fetched" | "opened" = "saved";
  if (!blob && e.url) { try { blob = await results.get(e.url); how = "fetched"; } catch { /* opened below */ } }
  if (!blob) { if (e.url) window.open(e.url, "_blank", "noopener"); return "opened"; }
  saveFile(blob, fileName(e, blob.type), blob.type);
  return how;
}
