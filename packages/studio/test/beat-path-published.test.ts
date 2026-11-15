/**
 * Published clips: the list shipped with the build is read without ever throwing (a missing,
 * broken or partly bad list shows what is usable and nothing else), relative links resolve
 * against the page, a visitor's own run wins over a published clip, and the publish script
 * checks its ids, copies only into public/published/, keeps one file per tile and refuses files over Cloudflare's 25 MiB.
 */
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/beat-path/examples";
import { MODELS } from "../src/beat-path/generate";
import { EXAMPLE_TRACKS } from "../src/beat-path/tracks";
import { checkClip, isRecord, loadPublished, parsePublished, resolveClipUrl, tileClip, withClip, emptyIndex } from "../src/beat-path/published";

const ids = { examples: EXAMPLES.map(e => e.id), models: MODELS.map(m => m.id) };
const PAGE = "https://demo.example/some/sub/path/index.html";

describe("Published clips: reading the list", () => {
  it("keeps good entries, resolves relative links against the page and drops each bad one on its own", () => {
    const list = parsePublished({ version: 1, clips: {
      flyer: { "kling-4": { url: "published/flyer-kling-4.mp4", prompt: "a car", costUsd: 0.42, seconds: 8 }, "h3": { url: "https://r2.example/h3.mp4", prompt: "p" }, "nope": { url: "x.mp4" } },
      runner: { "kling-4": { url: "javascript:alert(1)" }, "seedance-2.5": { url: "//evil.example/x.mp4" }, "h3": { url: "data:video/mp4;base64,AA" } },
      car: { "kling-4": { url: "c.mp4", costUsd: -1 }, "h3": { url: "c.mp4", seconds: "8" }, "seedance-2.5": "not an object" },
      ghost: { "kling-4": { url: "g.mp4" } },
    } }, ids, PAGE);
    expect(list).toEqual([
      { example: "flyer", model: "kling-4", url: "https://demo.example/some/sub/path/published/flyer-kling-4.mp4", prompt: "a car", costUsd: 0.42, seconds: 8 },
      { example: "flyer", model: "h3", url: "https://r2.example/h3.mp4", prompt: "p" },
    ]);
  });
  it("reads a missing, empty or wrongly shaped list as no clips", () => {
    for (const raw of [null, undefined, "x", [], {}, { version: 2, clips: {} }, { version: 1 }, { version: 1, clips: [] }, { version: 1, clips: {} }]) expect(parsePublished(raw, ids, PAGE)).toEqual([]);
  });
  it("accepts only http(s) links", () => {
    expect(resolveClipUrl("./published/a.mp4", PAGE)).toBe("https://demo.example/some/sub/path/published/a.mp4");
    expect(resolveClipUrl("HTTPS://r2.example/a.mp4", PAGE)).toBe("https://r2.example/a.mp4");
    for (const bad of ["", "  ", "file:///etc/passwd", "blob:https://x/1", "ftp://x/a.mp4", 42, null]) expect(resolveClipUrl(bad, PAGE)).toBeNull();
  });
  it("fetches the list next to the page and never throws", async () => {
    let asked = "";
    const ok = (async (u: string) => { asked = u; return { ok: true, json: async () => ({ version: 1, clips: { car: { h3: { url: "published/c.mp4", prompt: "" } } } }) }; }) as unknown as typeof fetch;
    expect(await loadPublished(ids, PAGE, ok)).toHaveLength(1);
    expect(asked).toBe("https://demo.example/some/sub/path/published/index.json");
    const missing = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const broken = (async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } })) as unknown as typeof fetch;
    const offline = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    for (const f of [missing, broken, offline]) expect(await loadPublished(ids, PAGE, f)).toEqual([]);
  });
  it("ships a valid list whose every entry the page will show", () => {
    const shipped = JSON.parse(readFileSync(new URL("../public/published/index.json", import.meta.url), "utf8"));
    expect(shipped.version).toBe(1);
    expect(isRecord(shipped.clips)).toBe(true);
    // Named per key first, so a bad entry fails with a readable diff rather than a TypeError or a bare count.
    const notObjects = Object.entries(shipped.clips as Record<string, unknown>).filter(([, v]) => !isRecord(v)).map(([k]) => k);
    expect(notObjects).toEqual([]);
    const unusable = Object.entries(shipped.clips as Record<string, Record<string, unknown>>).flatMap(([e, byModel]) => Object.entries(byModel).filter(([, c]) => !checkClip(c, PAGE)).map(([m]) => `${e}/${m}`));
    expect(unusable).toEqual([]);
    const committed = Object.values(shipped.clips as Record<string, object>).flatMap(o => Object.keys(o)).length;
    expect(parsePublished(shipped, ids, PAGE)).toHaveLength(committed);
  });
});

describe("Published clips: which clip a model tile shows", () => {
  const pub = { example: "flyer", model: "kling-4", url: "https://r2.example/p.mp4", prompt: "" };
  it("the visitor's own run wins, then the published clip, then nothing", () => {
    const own = { url: "blob:own" };
    expect(tileClip(own, pub)).toEqual({ kind: "own", run: own });
    expect(tileClip(undefined, pub)).toEqual({ kind: "published", run: pub });
    expect(tileClip(undefined, undefined)).toBeNull();
  });
  it("setting an entry replaces the one for the same example and model only", () => {
    const a = withClip(withClip(emptyIndex(), "flyer", "h3", { url: "a.mp4", prompt: "" }), "flyer", "kling-4", { url: "b.mp4", prompt: "" });
    expect(withClip(a, "flyer", "h3", { url: "c.mp4", prompt: "x" }).clips.flyer).toEqual({ h3: { url: "c.mp4", prompt: "x" }, "kling-4": { url: "b.mp4", prompt: "" } });
  });
  it("setting an entry over a value that is not an object starts that example afresh", () => {
    const clip = { url: "a.mp4", prompt: "" };
    for (const prev of ["oops", ["x"], 3, null]) {
      const broken = { version: 1, clips: { flyer: prev, car: { h3: clip } } } as unknown as Parameters<typeof withClip>[0];
      expect(withClip(broken, "flyer", "h3", clip).clips).toEqual({ flyer: { h3: clip }, car: { h3: clip } });
    }
  });
});

describe("Published clips: npm run publish:clip", () => {
  const script = fileURLToPath(new URL("../../../scripts/publish-clip.mjs", import.meta.url));
  let root = "";
  const fresh = () => { root = mkdtempSync(join(tmpdir(), "publish-clip-")); return root; };
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args, "--root", root], { encoding: "utf8" });
  const index = () => JSON.parse(readFileSync(join(root, "packages/studio/public/published/index.json"), "utf8"));
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it("checks against the same example ids the page uses", () => {
    expect(Object.keys(EXAMPLE_TRACKS).sort()).toEqual([...ids.examples].sort());
  });
  it("copies a local clip into public/published/ and writes its entry", () => {
    fresh(); const clip = join(root, "take.mp4"); writeFileSync(clip, "fake");
    const r = run("runner", "seedance-2.5", clip, "--prompt", "a runner", "--cost", "0.42", "--seconds", "8");
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(root, "packages/studio/public/published/runner-seedance-2.5.mp4"))).toBe(true);
    expect(index()).toEqual({ version: 1, clips: { runner: { "seedance-2.5": { url: "published/runner-seedance-2.5.mp4", prompt: "a runner", costUsd: 0.42, seconds: 8 } } } });
  });
  it("writes only the entry for a URL, keeping the others", () => {
    fresh();
    expect(run("car", "h3", "https://r2.example/car-h3.mp4").status).toBe(0);
    expect(run("flyer", "kling-4", "https://r2.example/f.mp4", "--prompt", "p").status).toBe(0);
    expect(index().clips).toEqual({ car: { h3: { url: "https://r2.example/car-h3.mp4", prompt: "" } }, flyer: { "kling-4": { url: "https://r2.example/f.mp4", prompt: "p" } } });
  });
  it("refuses unknown ids, a path-like id, a non-video file, a bad number and a broken list", () => {
    fresh(); const clip = join(root, "take.mp4"); writeFileSync(clip, "fake"); writeFileSync(join(root, "notes.txt"), "x");
    for (const args of [["nope", "h3", clip], ["flyer", "gpt", clip], ["../../etc", "h3", clip], ["flyer", "../h3", clip], ["flyer", "h3", join(root, "notes.txt")], ["flyer", "h3", clip, "--cost", "-2"], ["flyer", "h3", "javascript:alert(1)"]]) {
      const r = run(...args);
      expect(r.status, args.join(" ")).not.toBe(0);
    }
    expect(existsSync(join(root, "packages/studio/public/published/index.json"))).toBe(false);
    mkdirSync(join(root, "packages/studio/public/published"), { recursive: true });
    writeFileSync(join(root, "packages/studio/public/published/index.json"), "{ not json");
    expect(run("flyer", "h3", clip).status).not.toBe(0);
    expect(readFileSync(join(root, "packages/studio/public/published/index.json"), "utf8")).toBe("{ not json");
  });
  it("refuses a list with a non-object example or an entry the page would not show, naming it and leaving the file as it was", () => {
    fresh(); mkdirSync(join(root, "packages/studio/public/published"), { recursive: true });
    const file = join(root, "packages/studio/public/published/index.json");
    for (const body of ['{"version":1,"clips":{"flyer":"oops"}}', '{"version":1,"clips":{"car":{},"flyer":["x"]}}', '{"version":1,"clips":{"flyer":null}}', '{"version":1,"clips":{"flyer":{"h3":"oops"}}}', '{"version":1,"clips":{"car":{"h3":{"url":"javascript:alert(1)"}}}}']) {
      writeFileSync(file, body);
      const r = run("flyer", "h3", "https://r2.example/f.mp4");
      expect(r.status, body).not.toBe(0);
      expect(r.stderr).toMatch(/fix or remove it first/);
      expect(readFileSync(file, "utf8")).toBe(body);
    }
    const body = '{"version":1,"clips":{"car":{"h3":{"url":"c.mp4","prompt":""}},"flyer":{"h3":"oops","kling-4":{"url":"f.mp4","costUsd":-1}}}}';
    writeFileSync(file, body);
    const r = run("car", "h3", "https://r2.example/c.mp4");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/flyer\/h3, flyer\/kling-4\); fix or remove it first/);
    expect(r.stderr).not.toMatch(/car\/h3/);
    expect(readFileSync(file, "utf8")).toBe(body);
  });
  it("refuses a local file over 25 MiB before copying it, unless --force", () => {
    fresh(); const clip = join(root, "big.mp4"); writeFileSync(clip, ""); truncateSync(clip, 26 * 1024 * 1024);
    const r = run("flyer", "h3", clip);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/25 MiB.*R2.*--force/s);
    expect(existsSync(join(root, "packages/studio/public/published/flyer-h3.mp4"))).toBe(false);
    const forced = run("flyer", "h3", clip, "--force");
    expect(forced.status, forced.stderr).toBe(0);
    expect(forced.stderr).toMatch(/WARNING/);
    expect(existsSync(join(root, "packages/studio/public/published/flyer-h3.mp4"))).toBe(true);
  });
  it("takes only .mp4 and .webm", () => {
    fresh(); const clip = join(root, "take.mov"); writeFileSync(clip, "fake");
    expect(run("flyer", "h3", clip).status).not.toBe(0);
  });
  it("keeps one clip per tile: a new extension or a URL removes the old copy", () => {
    fresh(); const dir = join(root, "packages/studio/public/published");
    const mp4 = join(root, "take.mp4"), webm = join(root, "take.webm"); writeFileSync(mp4, "a"); writeFileSync(webm, "b");
    expect(run("car", "h3", mp4).status).toBe(0);
    const r = run("car", "h3", webm);
    expect(r.stdout).toMatch(/removed the old car-h3\.mp4/);
    expect(existsSync(join(dir, "car-h3.mp4"))).toBe(false);
    expect(existsSync(join(dir, "car-h3.webm"))).toBe(true);
    expect(run("car", "h3", webm).stdout).toMatch(/car-h3\.webm/);
    expect(run("car", "h3", "https://r2.example/c.mp4").status).toBe(0);
    expect(existsSync(join(dir, "car-h3.webm"))).toBe(false);
    expect(index().clips.car.h3.url).toBe("https://r2.example/c.mp4");
  });
  it("runs as an npm script with no other setup", () => {
    fresh();
    expect(execFileSync(process.execPath, [script, "flyer", "h3", "https://r2.example/x.mp4", "--root", root], { encoding: "utf8" })).toMatch(/flyer \/ h3/);
  });
});
