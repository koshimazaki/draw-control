/**
 * One download per generated file. The player's local copy (result-sync.ts), the browser's kept
 * copy (run-assets.ts), the image panel and Download all read a result through here: readers that
 * overlap share one fetch, the bytes stay for a short while for a reader that comes just after,
 * and a file already kept in Cache Storage is read from there rather than the network. A failure
 * is not kept, so a retry fetches again; a link the page may not read rejects, and each reader
 * falls back to the plain link.
 */
export type StoredLookup = (url: string) => Promise<Blob | null>;

/** How long fetched bytes stay shared after they arrive (ms). */
export const SHARE_MS = 60_000;

export function blobFetcher(o: { fetcher?: (url: string, init: RequestInit) => Promise<Response>; keepMs?: number; later?: (f: () => void, ms: number) => void } = {}) {
  const shared = new Map<string, Promise<Blob>>();
  let stored: StoredLookup = async () => null;
  const fetcher = o.fetcher ?? ((u, i) => globalThis.fetch(u, i));
  const later = o.later ?? ((f, ms) => void setTimeout(f, ms));
  const forget = (url: string, p: Promise<Blob>) => { if (shared.get(url) === p) shared.delete(url); };
  function get(url: string): Promise<Blob> {
    const known = shared.get(url);
    if (known) return known;
    const p = (async () => {
      const kept = await stored(url).catch(() => null);
      if (kept) return kept;
      const res = await fetcher(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })();
    shared.set(url, p);
    p.then(() => later(() => forget(url, p), o.keepMs ?? SHARE_MS), () => forget(url, p));
    return p;
  }
  return {
    get,
    /** Where kept copies are looked up first (the run log's Cache Storage, page-history.ts). */
    setStored(f: StoredLookup) { stored = f; },
  };
}

/** The page's one fetcher for results. */
export const results = blobFetcher();
