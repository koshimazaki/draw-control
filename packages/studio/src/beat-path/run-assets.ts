/**
 * The files of finished runs, kept in this browser (Cache Storage). Runware is infrastructure: it
 * does not keep a customer's results for re-download, so the page keeps its own copy of each video
 * or image as soon as the run is done. Show and Download then work after the provider's link has
 * gone. A link the browser may not read (no CORS) cannot be copied: the run keeps the link and
 * says so. Only the newest runs in the log keep their files; older copies are dropped.
 */
import type { RunEntry, RunLog } from "./run-log";
import { download as saveFile } from "../shared/download";

const CACHE = "beat-path-runs";
const keyOf = (taskUUID: string) => new URL(`/__beat-path-runs/${taskUUID}`, location.origin).href;
const supported = () => typeof caches !== "undefined";

/** Copy a done run's file into the browser; the log records whether it worked. */
export async function saveAsset(log: RunLog, e: RunEntry): Promise<boolean> {
  if (!supported() || !e.url) return false;
  try {
    const res = await fetch(e.url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const type = blob.type || (e.kind === "video" ? "video/mp4" : "image/png");
    await (await caches.open(CACHE)).put(keyOf(e.taskUUID), new Response(blob, { headers: { "Content-Type": type } }));
    log.update(e.taskUUID, { saved: true, saveError: undefined });
    return true;
  } catch (err) {
    log.update(e.taskUUID, { saved: false, saveError: err instanceof TypeError ? "the link does not let the page copy it (CORS)" : (err as Error).message });
    return false;
  }
}

/** The run's file from the browser's copy, or null when there is none. */
export async function savedBlob(e: RunEntry): Promise<Blob | null> {
  if (!supported() || !e.saved) return null;
  try { const r = await (await caches.open(CACHE)).match(keyOf(e.taskUUID)); return r ? await r.blob() : null; } catch { return null; }
}

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
  if (!blob && e.url) { try { const r = await fetch(e.url, { mode: "cors" }); if (r.ok) { blob = await r.blob(); how = "fetched"; } } catch { /* opened below */ } }
  if (!blob) { if (e.url) window.open(e.url, "_blank", "noopener"); return "opened"; }
  saveFile(blob, fileName(e, blob.type), blob.type);
  return how;
}
