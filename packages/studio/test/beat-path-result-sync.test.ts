/** A generated clip beside the preview (result-sync.ts): it plays with the page, is corrected only on drift, and is read from a local copy. */
import { describe, expect, it } from "vitest";
import { COPY_GRACE_MS, Copies, DRIFT, followStep, localCopy } from "../src/beat-path/result-sync";
import { blobFetcher } from "../src/beat-path/result-fetch";

const clip = (time: number, paused: boolean, duration = 8) => ({ time, paused, duration });

describe("followStep", () => {
  it("lets a playing clip play: no seek while it is within the drift", () => {
    expect(followStep(clip(2.0, false), { time: 2.0 + DRIFT * 0.9, playing: true })).toEqual({});
  });
  it("puts a playing clip back once it drifts", () => {
    expect(followStep(clip(2.0, false), { time: 2.5, playing: true })).toEqual({ seek: 2.5 });
  });
  it("starts the clip when the page plays", () => {
    expect(followStep(clip(2.0, true), { time: 2.0, playing: true })).toEqual({ play: true });
    expect(followStep(clip(0, true), { time: 3, playing: true })).toEqual({ play: true, seek: 3 });
  });
  it("pauses with the page and shows the page's frame", () => {
    expect(followStep(clip(2.0, false), { time: 2.3, playing: false })).toEqual({ pause: true, seek: 2.3 });
    expect(followStep(clip(2.3, true), { time: 2.3, playing: false })).toEqual({});
  });
  it("never seeks a paused clip on every frame for the same time (the old stutter)", () => {
    let t = 1.0, seeks = 0;
    for (let i = 0; i < 60; i++) { const s = followStep(clip(t, true), { time: 1.0 + 1e-4 * i, playing: false }); if (s.seek !== undefined) { seeks++; t = s.seek; } }
    expect(seeks).toBe(0);
  });
  it("holds the last frame past the clip's end", () => {
    expect(followStep(clip(8, true, 8), { time: 9, playing: false })).toEqual({});
  });
  it("holds the last frame while the page plays on past a shorter clip (never restarts an ended clip)", () => {
    // The clip has ended (paused at its end) and the page's clip is longer: nothing to do, above all no play().
    expect(followStep(clip(8, true, 8), { time: 8.6, playing: true })).toEqual({});
    // Still playing as the page passes its end: stopped on the last frame.
    expect(followStep(clip(7.5, false, 8), { time: 8.2, playing: true })).toEqual({ pause: true, seek: 8 });
    // A whole tail of frames: no play and no seek once it is held.
    let t = 8, paused = true, acts = 0;
    for (let i = 0; i < 60; i++) { const s = followStep(clip(t, paused, 8), { time: 8 + i / 60, playing: true }); if (s.play || s.seek !== undefined) acts++; if (s.seek !== undefined) t = s.seek; if (s.play) paused = false; }
    expect(acts).toBe(0);
  });
  it("starts again from the page's time when the page loops back", () => {
    expect(followStep(clip(8, true, 8), { time: 0.02, playing: true })).toEqual({ play: true, seek: 0.02 });
  });
});

describe("localCopy", () => {
  it("keeps a blob URL as it is", async () => {
    expect(await localCopy("blob:http://x/1")).toBe("blob:http://x/1");
  });
  it("loads a link once and hands back a blob URL", async () => {
    let calls = 0;
    const load = async () => { calls++; return new Blob([new Uint8Array(4)], { type: "video/mp4" }); };
    const a = await localCopy("https://example.test/a.mp4", load), b = await localCopy("https://example.test/a.mp4", load);
    expect(a.startsWith("blob:")).toBe(true);
    expect(b).toBe(a);
    expect(calls).toBe(1);
  });
  it("plays the link itself when the page may not read it", async () => {
    const load = async (): Promise<Blob> => { throw new TypeError("Failed to fetch"); };
    expect(await localCopy("https://example.test/no-cors.mp4", load)).toBe("https://example.test/no-cors.mp4");
  });
});

describe("one download per result (result-fetch.ts)", () => {
  const response = () => new Response(new Blob([new Uint8Array(8)], { type: "video/mp4" }));
  it("readers that overlap share one fetch, and one just after still gets the bytes", async () => {
    let calls = 0;
    const later: (() => void)[] = [];
    const f = blobFetcher({ fetcher: async () => { calls++; return response(); }, later: g => void later.push(g) });
    const [a, b] = await Promise.all([f.get("https://cdn.test/r.mp4"), f.get("https://cdn.test/r.mp4")]);
    expect(a).toBe(b);
    expect(await f.get("https://cdn.test/r.mp4")).toBe(a);
    expect(calls).toBe(1);
    later.forEach(g => g());                 // the share window is over: a later reader fetches again
    await f.get("https://cdn.test/r.mp4");
    expect(calls).toBe(2);
  });
  it("reads a file already kept in the browser instead of the network", async () => {
    let calls = 0;
    const kept = new Blob([new Uint8Array(2)]);
    const f = blobFetcher({ fetcher: async () => { calls++; return response(); } });
    f.setStored(async url => (url.endsWith("kept.mp4") ? kept : null));
    expect(await f.get("https://cdn.test/kept.mp4")).toBe(kept);
    expect(calls).toBe(0);
  });
  it("keeps no failure, so a retry fetches again", async () => {
    let calls = 0;
    const f = blobFetcher({ fetcher: async () => (++calls === 1 ? new Response("", { status: 503 }) : response()) });
    await expect(f.get("https://cdn.test/late.mp4")).rejects.toThrow("HTTP 503");
    await expect(f.get("https://cdn.test/late.mp4")).resolves.toBeInstanceOf(Blob);
    expect(calls).toBe(2);
  });
});

describe("Copies: blob URLs are released when nothing shows them", () => {
  const setup = () => {
    let t = 0, n = 0;
    const revoked: string[] = [];
    const copies = new Copies({ create: () => `blob:test/${++n}`, revoke: u => void revoked.push(u) }, () => t);
    return { copies, revoked, tick: (ms: number) => { t += ms; } };
  };
  const blob = async () => new Blob([new Uint8Array(1)]);
  it("keeps a copy an element shows, and releases it once that element is gone", async () => {
    const { copies, revoked, tick } = setup();
    const src = await copies.get("https://cdn.test/a.mp4", blob);
    const v = { isConnected: true, src };
    copies.use("https://cdn.test/a.mp4", v);
    tick(COPY_GRACE_MS + 1);
    copies.sweep();
    expect(revoked).toEqual([]);
    v.isConnected = false;                   // its row was re-rendered
    copies.sweep();
    expect(revoked).toEqual([src]);
    expect(copies.size).toBe(0);
  });
  it("never releases a copy just made (its element is being set up) or the one being asked for", async () => {
    const { copies, revoked, tick } = setup();
    await copies.get("https://cdn.test/a.mp4", blob);
    copies.sweep();
    expect(revoked).toEqual([]);
    tick(COPY_GRACE_MS + 1);
    await copies.get("https://cdn.test/a.mp4", blob);   // asked for again: kept and handed out
    expect(revoked).toEqual([]);
    await copies.get("https://cdn.test/b.mp4", blob);   // the next copy sweeps; a was just touched
    expect(revoked).toEqual([]);
    tick(COPY_GRACE_MS + 1);
    await copies.get("https://cdn.test/c.mp4", blob);
    expect(revoked).toEqual(["blob:test/1", "blob:test/2"]);
  });
  it("an element pointed at another source no longer holds the copy", async () => {
    const { copies, revoked, tick } = setup();
    const src = await copies.get("https://cdn.test/a.mp4", blob), v = { isConnected: true, src };
    copies.use("https://cdn.test/a.mp4", v);
    v.src = "blob:test/other";
    tick(COPY_GRACE_MS + 1);
    copies.sweep();
    expect(revoked).toEqual([src]);
  });
});
