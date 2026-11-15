/**
 * The shared cost dialog (cost-dialog.ts): one question at a time, so OK always answers the
 * question on screen and a second run's question waits instead of overwriting the first (which
 * then never resolved); a stopped run's question resolves false; a held Enter or a click right as
 * the dialog opens never confirms a spend.
 */
import { describe, expect, it } from "vitest";
import { CONFIRM_GUARD_MS, QuestionQueue, acceptConfirm, type Question } from "../src/beat-path/cost-dialog";

const view = () => { const seen: (Question | null)[] = []; return { seen, show: (q: Question) => void seen.push(q), hide: () => void seen.push(null) }; };
const q = (title: string): Question => ({ title, text: `${title} text`, ok: "Generate" });

describe("QuestionQueue", () => {
  it("shows a second question only after the first is answered, each with its own answer", async () => {
    const v = view(), queue = new QuestionQueue(v);
    const video = queue.ask(q("video")), image = queue.ask(q("image"));
    expect(queue.shown?.title).toBe("video");
    queue.answer(false);
    expect(await video).toBe(false);
    expect(queue.shown?.title).toBe("image");
    queue.answer(true);
    expect(await image).toBe(true);
    expect(v.seen.map(x => x?.title ?? null)).toEqual(["video", "image", null]);
    expect(queue.size).toBe(0);
  });
  it("a stopped run's question resolves false, on screen or waiting, and the next one shows", async () => {
    const v = view(), queue = new QuestionQueue(v), a = new AbortController(), b = new AbortController();
    const first = queue.ask(q("first"), a.signal), second = queue.ask(q("second"), b.signal), third = queue.ask(q("third"));
    b.abort();                         // waiting: dropped without ever showing
    expect(await second).toBe(false);
    a.abort();                         // on screen: answered false, the next shows
    expect(await first).toBe(false);
    expect(queue.shown?.title).toBe("third");
    queue.answer(true);
    expect(await third).toBe(true);
    expect(v.seen.map(x => x?.title ?? null)).toEqual(["first", "third", null]);
  });
  it("an already stopped run is never asked", async () => {
    const v = view(), queue = new QuestionQueue(v), a = new AbortController();
    a.abort();
    expect(await queue.ask(q("late"), a.signal)).toBe(false);
    expect(v.seen).toEqual([]);
  });
});

describe("acceptConfirm", () => {
  it("ignores any confirmation in the first moments of a question", () => {
    expect(acceptConfirm({ sinceOpenMs: CONFIRM_GUARD_MS - 1, keyboard: false, freshKey: false })).toBe(false);
    expect(acceptConfirm({ sinceOpenMs: 10, keyboard: true, freshKey: true })).toBe(false);
  });
  it("takes a click after the guard, and a key only when it was pressed after the question appeared", () => {
    expect(acceptConfirm({ sinceOpenMs: CONFIRM_GUARD_MS + 1, keyboard: false, freshKey: false })).toBe(true);
    expect(acceptConfirm({ sinceOpenMs: 2000, keyboard: true, freshKey: false })).toBe(false);   // a held Enter from the dialog before
    expect(acceptConfirm({ sinceOpenMs: 2000, keyboard: true, freshKey: true })).toBe(true);
  });
});
