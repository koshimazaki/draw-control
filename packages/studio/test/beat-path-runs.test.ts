/**
 * The run log: an inference task is written down before its request leaves, a result fills in
 * its link and cost, an error marks it failed, and a run left processing is asked for again
 * with getResponse and the same id (never resubmitted). Only ids, links, costs and times are kept.
 */
import { describe, expect, it } from "vitest";
import { RunLog, checkRun, loggingFetch, readResponse } from "../src/beat-path/run-log";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m }; };
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body, clone: () => ({ json: async () => body }) });

describe("Runs: every generation's task id survives a reload", () => {
  it("logs the task before the request is answered, then the result", async () => {
    const store = memory(), log = new RunLog(store);
    let seenBeforeAnswer = false;
    const inner = async (_u: string, init: { body: string }) => {
      const t = JSON.parse(init.body)[0];
      if (t.taskType === "videoInference") { seenBeforeAnswer = log.get("v1")?.status === "processing"; return reply({ data: [{ taskUUID: "v1" }] }); }
      return reply({ data: [{ taskUUID: "v1", status: "success", videoURL: "https://cdn.example/v1.mp4", cost: 1.84 }] });
    };
    const f = loggingFetch(inner, log, () => ({ slot: "1", model: "Seedance 2.5" }));
    await f("https://api.runware.ai/v1", { body: JSON.stringify([{ taskType: "videoInference", taskUUID: "v1", model: "bytedance:seedance@2.5", positivePrompt: "secret prompt" }]) });
    expect(seenBeforeAnswer).toBe(true);
    await f("https://api.runware.ai/v1", { body: JSON.stringify([{ taskType: "getResponse", taskUUID: "v1" }]) });
    expect(log.get("v1")).toMatchObject({ kind: "video", model: "Seedance 2.5", slot: "1", status: "done", url: "https://cdn.example/v1.mp4", cost: 1.84 });
    // A fresh log on the same storage (a reload) still has it; the prompt and the key were never stored.
    expect(new RunLog(store).get("v1")?.url).toBe("https://cdn.example/v1.mp4");
    expect([...store.raw.values()].join()).not.toMatch(/secret prompt|Bearer/);
  });
  it("ignores uploads and polls of tasks it never logged", async () => {
    const log = new RunLog(memory());
    const f = loggingFetch(async () => reply({ data: [] }), log, () => ({ slot: "0", model: "x" }));
    await f("u", { body: JSON.stringify([{ taskType: "mediaStorage", taskUUID: "m1" }, { taskType: "getResponse", taskUUID: "zz" }]) });
    expect(log.list()).toEqual([]);
  });
  it("reads done, failed and still-processing answers", () => {
    expect(readResponse("a", { data: [{ taskUUID: "a", status: "processing" }] })).toBeNull();
    expect(readResponse("a", { data: [{ taskUUID: "a", status: "error", error: { message: "moderated" } }] })).toEqual({ status: "failed", error: "moderated" });
    expect(readResponse("a", { errors: [{ taskUUID: "a", message: "invalid key" }] })).toEqual({ status: "failed", error: "invalid key" });
    expect(readResponse("a", { data: [{ taskUUID: "a", imageURL: "https://cdn.example/a.png", cost: "0.04" }] })).toEqual({ status: "done", url: "https://cdn.example/a.png", cost: 0.04 });
  });
  it("after a reload, Check asks getResponse with the same id and the key, and never resubmits", async () => {
    const log = new RunLog(memory());
    log.add({ taskUUID: "v9", kind: "video", model: "Kling 4.0", slot: "0", at: Date.now(), status: "processing" });
    const sent: { body: unknown; auth: unknown }[] = [];
    const now = await checkRun(log, "v9", "rw-key-123456", async (_u, init) => { sent.push({ body: JSON.parse(init.body), auth: (init.headers as Record<string, string>).Authorization }); return reply({ data: [{ taskUUID: "v9", status: "success", videoURL: "https://cdn.example/v9.mp4" }] }); });
    expect(sent).toEqual([{ body: [{ taskType: "getResponse", taskUUID: "v9" }], auth: "Bearer rw-key-123456" }]);
    expect(now).toMatchObject({ status: "done", url: "https://cdn.example/v9.mp4" });
    expect(log.pending()).toEqual([]);
  });
});
