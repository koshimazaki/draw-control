/**
 * Published clips: real model outputs shipped with the static build, so a visitor without a
 * Runware key still sees what each model made. One JSON file, `public/published/index.json`
 * (docs/deploy.md), keyed by example id and model id:
 *
 *   { "version": 1, "clips": { "flyer": { "kling-4": { "url": "published/flyer-kling-4.mp4",
 *     "prompt": "…", "costUsd": 0.42, "seconds": 8 } } } }
 *
 * A url is absolute (http/https, e.g. Cloudflare R2) or relative to the page (a file under
 * public/published/). Reading never throws: a missing or broken list is an empty one, and a
 * bad entry is dropped on its own. A visitor's own run for the same example and model wins.
 * The list may also name the reference images an example was made with, under "refs":
 *
 *   "refs": { "flyer": { "character": "published/flyer-character.jpg", "environment": "published/flyer-environment.jpg" } }
 *
 * The page loads them into that example's Character and Environment drops when it opens. A clip
 * made with other images names its own under "refs" in its entry: they show while its model is chosen.
 * A model's entry may be a list of clips. A clip with a "subject" (one guide, another subject) gets
 * its own row in the Gallery, with its images and its "shot" lines, and choosing its model again in
 * the editor moves to the next clip.
 * No runtime imports: scripts/publish-clip.mjs runs this file on Node as it is.
 */

/** Where the list sits, relative to the page. */
export const PUBLISHED_INDEX = "published/index.json";

/** The three lines of a shot description (a subject's own, for a clip made with another subject on the same guide). */
export type PublishedShot = { subject: string; environment: string; action: string };
export type PublishedClip = { url: string; prompt: string; costUsd?: number; seconds?: number; refs?: PublishedRefs; subject?: string; shot?: PublishedShot };
/** The reference images an example was made with: urls, read like a clip's. */
export type PublishedRefs = { character?: string; environment?: string };
export const REF_KINDS = ["character", "environment"] as const;
export type PublishedIndex = { version: 1; clips: Record<string, Record<string, PublishedClip | PublishedClip[]>>; refs?: Record<string, PublishedRefs> };
/** A model's entry as a list: one clip, or several (one guide carried by several subjects, each named by `subject`). */
export const clipList = (entry: unknown): unknown[] => (Array.isArray(entry) ? entry : [entry]);
const MAX_SUBJECT = 40, MAX_SHOT_LINE = 2000;
/** Everything the list holds that the page can use. */
export type Published = { clips: PublishedRun[]; refs: Record<string, PublishedRefs> };
/** One usable entry, its url resolved against the page. */
export type PublishedRun = PublishedClip & { example: string; model: string };
export type KnownIds = { examples: readonly string[]; models: readonly string[] };

export const emptyIndex = (): PublishedIndex => ({ version: 1, clips: {} });

/** A plain object: not null, not an array. */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_URL = 2048, MAX_PROMPT = 4000;

/** The url resolved against `base` (the page), or null when it is not http(s) or a plain relative path. */
export function resolveClipUrl(url: unknown, base: string): string | null {
  if (typeof url !== "string" || !url.trim() || url.length > MAX_URL) return null;
  const u = url.trim();
  // A scheme other than http(s) (javascript:, data:, blob:, file:) or a protocol-relative link is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) ? !/^https?:\/\//i.test(u) : u.startsWith("//")) return null;
  try { const r = new URL(u, base); return /^https?:$/.test(r.protocol) ? r.href : null; } catch { return null; }
}

/** One entry checked: url, prompt, optional non-negative finite cost and seconds. Null when it is not usable. */
export function checkClip(raw: unknown, base: string): PublishedClip | null {
  if (!isRecord(raw)) return null;
  const url = resolveClipUrl(raw.url, base);
  if (!url) return null;
  const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, MAX_PROMPT) : "";
  const clip: PublishedClip = { url, prompt };
  for (const k of ["costUsd", "seconds"] as const) {
    const v = raw[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    clip[k] = v;
  }
  const refs = checkRefs(raw.refs, base);
  if (refs) clip.refs = refs;
  if (typeof raw.subject === "string" && raw.subject.trim()) clip.subject = raw.subject.trim().slice(0, MAX_SUBJECT);
  if (isRecord(raw.shot)) {
    const line = (k: string) => (typeof (raw.shot as Record<string, unknown>)[k] === "string" ? ((raw.shot as Record<string, unknown>)[k] as string).trim().slice(0, MAX_SHOT_LINE) : "");
    const shot = { subject: line("subject"), environment: line("environment"), action: line("action") };
    if (shot.subject || shot.environment || shot.action) clip.shot = shot;
  }
  return clip;
}

/** A set of reference images checked: each url like a clip's; null when none is usable. */
export function checkRefs(raw: unknown, base: string): PublishedRefs | null {
  if (!isRecord(raw)) return null;
  const refs: PublishedRefs = {};
  for (const k of REF_KINDS) { const url = resolveClipUrl(raw[k], base); if (url) refs[k] = url; }
  return refs.character || refs.environment ? refs : null;
}

/** The usable entries of a parsed list: known example and model ids only, each entry checked on its own. */
export function parsePublished(raw: unknown, ids: KnownIds, base: string): PublishedRun[] {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.clips)) return [];
  const out: PublishedRun[] = [];
  for (const [example, byModel] of Object.entries(raw.clips)) {
    if (!ids.examples.includes(example) || !isRecord(byModel)) continue;
    for (const [model, entry] of Object.entries(byModel)) {
      if (!ids.models.includes(model)) continue;
      for (const one of clipList(entry)) {
        const clip = checkClip(one, base);
        if (clip) out.push({ ...clip, example, model });
      }
    }
  }
  return out;
}

/** The usable reference images of a parsed list: known example ids only, each url checked like a clip's. */
export function parseRefs(raw: unknown, ids: KnownIds, base: string): Record<string, PublishedRefs> {
  const out: Record<string, PublishedRefs> = {};
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.refs)) return out;
  for (const [example, byKind] of Object.entries(raw.refs)) {
    if (!ids.examples.includes(example) || !isRecord(byKind)) continue;
    const refs = checkRefs(byKind, base);
    if (refs) out[example] = refs;
  }
  return out;
}

/** The reference images to show for an example and the published clip on show: the example's, with the clip's own over them. */
export function refsFor(all: Published, example: string, clip: PublishedClip | undefined): PublishedRefs {
  return { ...all.refs[example], ...clip?.refs };
}

/** An example's clips that share its own subject (no `subject`): its row in the Gallery. */
export const mainClips = (clips: readonly PublishedRun[], example: string): PublishedRun[] => clips.filter(c => c.example === example && !c.subject);
/** An example's other subjects, in the list's order, each with its clips: a Gallery row each. */
export function subjectRows(clips: readonly PublishedRun[], example: string): { subject: string; clips: PublishedRun[] }[] {
  const rows: { subject: string; clips: PublishedRun[] }[] = [];
  for (const c of clips) {
    if (c.example !== example || !c.subject) continue;
    const row = rows.find(r => r.subject === c.subject);
    if (row) row.clips.push(c); else rows.push({ subject: c.subject, clips: [c] });
  }
  return rows;
}
/** A model's published clips for an example, in the list's order. */
export const clipsFor = (clips: readonly PublishedRun[], example: string, model: string): PublishedRun[] => clips.filter(c => c.example === example && c.model === model);
/** The clip on show from a model's list: the `turn`-th, going round (click the model again for the next). */
export const pickClip = (list: readonly PublishedRun[], turn: number): PublishedRun | undefined => (list.length ? list[((turn % list.length) + list.length) % list.length] : undefined);

/** Fetch and read the list: its clips and its reference images. Any failure (no file, not JSON, wrong shape) is an empty list. */
export async function loadPublishedAll(ids: KnownIds, base: string, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<Published> {
  try {
    const r = await fetcher(new URL(PUBLISHED_INDEX, base).href, { cache: "no-cache" });
    if (!r.ok) return { clips: [], refs: {} };
    const raw: unknown = await r.json();
    return { clips: parsePublished(raw, ids, base), refs: parseRefs(raw, ids, base) };
  } catch { return { clips: [], refs: {} }; }
}

/** Fetch and read the list's clips. Any failure is an empty list. */
export async function loadPublished(ids: KnownIds, base: string, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<PublishedRun[]> {
  return (await loadPublishedAll(ids, base, fetcher)).clips;
}

/** What a model tile shows: the visitor's own run when there is one, else the published clip, else nothing. */
export function tileClip<R extends { url: string }>(own: R | undefined, published: PublishedRun | undefined): { kind: "own"; run: R } | { kind: "published"; run: PublishedRun } | null {
  if (own) return { kind: "own", run: own };
  if (published) return { kind: "published", run: published };
  return null;
}

/**
 * What the output pane beside the preview shows for the chosen model: the visitor's own result when it was
 * made with that model, else that model's published clip, else the visitor's own result, else nothing.
 */
export function paneClip<R extends { url: string }>(own: R | undefined, ownIsThisModel: boolean, published: PublishedRun | undefined): { kind: "own"; run: R } | { kind: "published"; run: PublishedRun } | null {
  if (own && ownIsThisModel) return { kind: "own", run: own };
  if (published) return { kind: "published", run: published };
  return own ? { kind: "own", run: own } : null;
}

/** The list with one entry set (replacing any for the same example and model). */
export function withClip(index: PublishedIndex, example: string, model: string, clip: PublishedClip): PublishedIndex {
  // A previous value that is not a plain object (a string, an array) is dropped, never spread into its characters.
  const prev = index.clips[example];
  const clips = { ...index.clips, [example]: { ...(isRecord(prev) ? prev : {}), [model]: clip } };
  // Whatever else the list holds (its reference images) is kept.
  return { ...index, version: 1, clips };
}
