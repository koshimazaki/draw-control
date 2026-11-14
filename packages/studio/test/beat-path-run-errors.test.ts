/**
 * The words for a stopped or failed run (generate.ts runErrorText): a Stop or a timeout after the
 * task was submitted says it may still be billed and lands in Runs, so nobody pays twice by
 * pressing Generate again; one before anything was sent says nothing was submitted.
 */
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, runErrorText } from "../src/beat-path/generate";

const ID = "3f2a9c1e-0000-4000-8000-000000000001";

describe("runErrorText", () => {
  it("a Stop after submission keeps the billing warning and the task id", () => {
    const t = runErrorText({ code: "aborted", message: `Stopped. The task was already submitted and may still finish and be billed (taskUUID ${ID}); do not resubmit.`, taskUUID: ID });
    expect(t).toMatch(/already submitted/);
    expect(t).toMatch(/billed/);
    expect(t).toMatch(/Runs/);
    expect(t).toContain(ID.slice(0, 8));
    expect(t).not.toBe(ERROR_MESSAGES.aborted);
  });
  it("a Stop before submission says nothing was submitted", () => {
    expect(runErrorText({ code: "aborted", message: "Stopped. Nothing was submitted." })).toBe("Stopped. Nothing was submitted.");
  });
  it("a timeout after submission says it may still be billed and appears in Runs", () => {
    const t = runErrorText({ code: "timeout", message: `Still running after 20 min. Resume with taskUUID ${ID}; do not resubmit.`, taskUUID: ID });
    expect(t).toMatch(/taking long/);
    expect(t).toMatch(/billed/);
    expect(t).toMatch(/Runs/);
  });
  it("keeps the embed's detail for refused and provider errors, and a page's own wording for a code", () => {
    expect(runErrorText({ code: "provider", message: "HTTP 500" })).toBe(`${ERROR_MESSAGES.provider}: HTTP 500`);
    expect(runErrorText({ code: "over-price", message: "x" }, { "over-price": "Too dear for an image." })).toBe("Too dear for an image.");
    expect(runErrorText({ code: "not-confirmed", message: "x" })).toBe(ERROR_MESSAGES["not-confirmed"]);
    expect(runErrorText({ message: "boom" })).toBe("boom");
  });
});
