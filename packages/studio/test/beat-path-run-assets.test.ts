/**
 * Copies of paid results (run-assets.ts): a failed copy (a blip, a 5xx, a CDN not serving the
 * file yet) is tried again with a growing wait, a copy that still fails stays retryable on a later
 * visit while the provider's link may still work, and the message does not claim CORS when the
 * cause is unknown.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY_DELAYS_MS, LINK_ALIVE_MS, copyErrorText, saveAsset, shouldCopy, storeErrorText, withRetry } from "../src/beat-path/run-assets";
import { RunLog, type RunEntry } from "../src/beat-path/run-log";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const NOW = 1_800_000_000_000, START = NOW - 60_000;
const done = (patch: Partial<RunEntry> = {}): RunEntry => ({ taskUUID: "t1", kind: "video", model: "Kling 4.0", slot: "0", at: NOW - 1000, status: "done", url: "https://cdn.example/t1.mp4", ...patch });

describe("withRetry", () => {
  it("tries again with the growing waits until it works", async () => {
    let n = 0;
    const waits: number[] = [];
    const v = await withRetry(async () => { if (++n < 3) throw new Error("HTTP 503"); return "ok"; }, COPY_DELAYS_MS, async ms => void waits.push(ms));
    expect(v).toBe("ok");
    expect(waits).toEqual(COPY_DELAYS_MS.slice(0, 2));
    expect(waits[1]).toBeGreaterThan(waits[0]);
  });
  it("throws the last error once the tries run out", async () => {
    let n = 0;
    await expect(withRetry(async () => { throw new Error(`HTTP 50${++n}`); }, [1, 2], async () => {})).rejects.toThrow("HTTP 503");
    expect(n).toBe(3);
  });
});

describe("copyErrorText", () => {
  it("does not claim CORS for a failed read, and says an HTTP status as such", () => {
    const t = copyErrorText(new TypeError("Failed to fetch"), 4);
    expect(t).not.toMatch(/CORS/);
    expect(t).toMatch(/4 tries/);
    expect(copyErrorText(new Error("HTTP 404"), 1)).toBe("not copied after 1 try: the provider answered HTTP 404");
  });
});

describe("shouldCopy", () => {
  it("copies a done run once per page load", () => {
    expect(shouldCopy(done(), NOW, START, false)).toBe(true);
    expect(shouldCopy(done(), NOW, START, true)).toBe(false);
    expect(shouldCopy(done({ saved: true }), NOW, START, false)).toBe(false);
    expect(shouldCopy(done({ status: "processing" }), NOW, START, false)).toBe(false);
  });
  it("tries a failed copy again on a later visit while the link may still work", () => {
    expect(shouldCopy(done({ saved: false }), NOW, START, false)).toBe(true);
    expect(shouldCopy(done({ saved: false, at: NOW - LINK_ALIVE_MS - 1 }), NOW, START, false)).toBe(false);
  });
  it("never copies a blob link from an earlier page (it is gone)", () => {
    expect(shouldCopy(done({ url: "blob:http://x/1", at: START - 1 }), NOW, START, false)).toBe(false);
    expect(shouldCopy(done({ url: "blob:http://x/1", at: START + 1 }), NOW, START, false)).toBe(true);
  });
});

describe("saveAsset", () => {
  const stored = new Map<string, Response>();
  beforeEach(() => { (globalThis as { caches?: unknown }).caches = { open: async () => ({ put: async (k: string, r: Response) => void stored.set(k, r) }) }; (globalThis as { location?: unknown }).location = { origin: "http://localhost" }; });
  afterEach(() => { delete (globalThis as { caches?: unknown }).caches; delete (globalThis as { location?: unknown }).location; stored.clear(); });

  it("keeps the file after a transient failure", async () => {
    const log = new RunLog(memory()), e = done();
    log.add({ ...e, status: "processing" }); log.update(e.taskUUID, { status: "done", url: e.url });
    let n = 0;
    const ok = await saveAsset(log, e, { load: async () => { if (++n === 1) throw new Error("HTTP 502"); return new Blob([new Uint8Array(4)], { type: "video/mp4" }); }, wait: async () => {} });
    expect(ok).toBe(true);
    expect(log.get("t1")).toMatchObject({ saved: true });
    expect(stored.size).toBe(1);
  });
  it("records why after the last try, retryable later", async () => {
    const log = new RunLog(memory()), e = done();
    log.add(e);
    const ok = await saveAsset(log, e, { load: async () => { throw new TypeError("Failed to fetch"); }, wait: async () => {} });
    expect(ok).toBe(false);
    const after = log.get("t1")!;
    expect(after.saved).toBe(false);
    expect(after.saveError).toMatch(/not copied after 4 tries/);
    expect(shouldCopy(after, NOW, START, false)).toBe(true);
  });
  it("counts the tries it made, not the most it could", async () => {
    const log = new RunLog(memory()), e = done();
    log.add(e);
    await saveAsset(log, e, { load: async () => { throw new Error("HTTP 404"); }, delays: [1], wait: async () => {} });
    expect(log.get("t1")!.saveError).toBe("not copied after 2 tries: the provider answered HTTP 404");
  });
  it("a storage failure is said as such, after one try, and stays retryable", async () => {
    let puts = 0, loads = 0;
    (globalThis as { caches?: unknown }).caches = { open: async () => ({ put: async () => { puts++; throw new DOMException("Quota exceeded", "QuotaExceededError"); } }) };
    const log = new RunLog(memory()), e = done();
    log.add(e);
    const ok = await saveAsset(log, e, { load: async () => { loads++; return new Blob([new Uint8Array(4)], { type: "video/mp4" }); }, wait: async () => {} });
    expect(ok).toBe(false);
    expect([loads, puts]).toEqual([1, 1]);
    const after = log.get("t1")!;
    expect(after.saveError).toBe(storeErrorText(new DOMException("Quota exceeded", "QuotaExceededError")));
    expect(after.saveError).not.toMatch(/tries/);
    expect(shouldCopy(after, NOW, START, false)).toBe(true);
  });
});
