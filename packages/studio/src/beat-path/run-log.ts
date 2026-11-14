/**
 * The run log: every generation sent to Runware (video or image), kept in this browser so a
 * reload, a crash or a closed tab never loses a paid run. The page wraps the fetch it hands the
 * embed: each inference task it sends is written down (its taskUUID, the model, the example,
 * the time) before the request goes out, and each result that comes back fills in the link and
 * the cost. A run still processing after a reload is asked for again with Runware's
 * getResponse and the same taskUUID; it is never sent twice. Only ids, links, costs and the
 * time are stored, never the key or the prompt.
 */
export type RunEntry = {
  taskUUID: string;
  kind: "video" | "image";
  /** The model's name as the page showed it. */
  model: string;
  /** The example it was made for ("0", "1", "2", "own"). */
  slot: string;
  /** When it was sent (ms since 1970). */
  at: number;
  status: "processing" | "done" | "failed";
  url?: string;
  cost?: number | null;
  error?: string;
  /** Made by the local preview (nothing was sent): kept for the list, never asked for again. */
  local?: boolean;
};
type FetchLike = (url: string, init: { body: string; [k: string]: unknown }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; clone?(): { json(): Promise<unknown> } }>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export const RUNWARE_API = "https://api.runware.ai/v1";
const KEY = "beatPath.runs";
const INFERENCE: Record<string, RunEntry["kind"]> = { videoInference: "video", imageInference: "image" };

export class RunLog {
  private listeners = new Set<() => void>();
  constructor(private store: Storage | null, private max = 40) {}

  list(): RunEntry[] {
    try { const raw = this.store?.getItem(KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
  }
  private save(list: RunEntry[]) {
    try { this.store?.setItem(KEY, JSON.stringify(list.slice(0, this.max))); } catch { /* storage full or off: the run still goes ahead */ }
    for (const f of this.listeners) f();
  }
  add(e: RunEntry) { this.save([e, ...this.list().filter(x => x.taskUUID !== e.taskUUID)]); }
  update(taskUUID: string, patch: Partial<RunEntry>) {
    const list = this.list(), i = list.findIndex(x => x.taskUUID === taskUUID);
    if (i < 0) return;
    list[i] = { ...list[i], ...patch };
    this.save(list);
  }
  get(taskUUID: string) { return this.list().find(x => x.taskUUID === taskUUID); }
  pending() { return this.list().filter(x => x.status === "processing" && !x.local); }
  onChange(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
}

type Row = { taskUUID?: string; status?: string; videoURL?: unknown; imageURL?: unknown; cost?: unknown; error?: { message?: string } };
/** What a getResponse answer says about one task: done (link, cost), failed (why), or still processing. */
export function readResponse(taskUUID: string, body: unknown): Partial<RunEntry> | null {
  const b = (body ?? {}) as { data?: Row[]; errors?: { taskUUID?: string; message?: string }[] };
  const err = (b.errors ?? []).find(e => e.taskUUID === taskUUID);
  if (err) return { status: "failed", error: String(err.message ?? "Runware reported an error") };
  const rows = (b.data ?? []).filter(r => r.taskUUID === taskUUID);
  const ok = rows.find(r => typeof r.videoURL === "string" || typeof r.imageURL === "string");
  if (ok) {
    const cost = typeof ok.cost === "number" ? ok.cost : typeof ok.cost === "string" && Number.isFinite(Number(ok.cost)) ? Number(ok.cost) : null;
    return { status: "done", url: String(ok.videoURL ?? ok.imageURL), cost };
  }
  const bad = rows.find(r => r.status === "error");
  if (bad) return { status: "failed", error: bad.error?.message ?? "Task failed" };
  return null;
}

/**
 * Wrap the fetch handed to the embed: inference tasks are logged as they are sent (before the
 * request leaves), results as they come back. The embed reads the response itself, so the log
 * reads a clone; a failure to log never fails the run.
 */
export function loggingFetch(inner: FetchLike, log: RunLog, meta: () => { slot: string; model: string; local?: boolean }): FetchLike {
  return async (url, init) => {
    let tasks: { taskType?: string; taskUUID?: string }[] = [];
    try { const v = JSON.parse(init.body); tasks = Array.isArray(v) ? v : []; } catch { /* not ours to read */ }
    const m = meta();
    for (const t of tasks) {
      const kind = INFERENCE[t.taskType ?? ""];
      if (kind && t.taskUUID) log.add({ taskUUID: t.taskUUID, kind, model: m.model, slot: m.slot, at: Date.now(), status: "processing", ...(m.local ? { local: true } : {}) });
    }
    const res = await inner(url, init);
    const asked = tasks.filter(t => t.taskType === "getResponse" && t.taskUUID && log.get(t.taskUUID)).map(t => t.taskUUID!);
    if (asked.length) {
      try {
        const body = await (res.clone ? res.clone().json() : res.json());
        for (const id of asked) { const patch = readResponse(id, body); if (patch) log.update(id, patch); }
      } catch { /* the embed still gets the response */ }
    }
    return res;
  };
}

/** Ask Runware once about a logged run (after a reload): updates the log, returns the new state. */
export async function checkRun(log: RunLog, taskUUID: string, key: string, fetchImpl: FetchLike = (u, i) => globalThis.fetch(u, i as RequestInit) as ReturnType<FetchLike>): Promise<RunEntry | undefined> {
  const res = await fetchImpl(RUNWARE_API, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ taskType: "getResponse", taskUUID }]),
  });
  const patch = readResponse(taskUUID, await res.json());
  if (patch) log.update(taskUUID, patch);
  return log.get(taskUUID);
}
