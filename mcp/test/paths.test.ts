import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { decodeAudioFile } from "../../cli/src/audio-file.ts";
import { REPO_ROOT, allowedRoots, canonicalPath, confine } from "../src/paths.ts";
import { Session, createServer } from "../src/server.ts";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "ms-paths-")));
// Outside every default root: the home folder is above the repo and the temp directory, never inside either.
const home = realpathSync(homedir());
const outside = join(home, `.ms-mcp-refused-${process.pid}.json`);

async function connect() {
  const session = new Session();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(session).connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0].text, error: !!r.isError };
  };
  return { session, call };
}

describe("MCP path roots", () => {
  it("allows a path inside each default root: the working directory, the repo and the temp directory", () => {
    expect(confine(join(home, "a", "recipe.json"), "write", allowedRoots({}, home))).toBe(join(home, "a", "recipe.json"));
    expect(confine(join(REPO_ROOT, "out", "x.json"), "write", allowedRoots({}, tmp))).toBe(join(realpathSync(REPO_ROOT), "out", "x.json"));
    expect(confine(join(tmpdir(), "new", "deep", "x.json"), "write", allowedRoots({}, REPO_ROOT))).toBe(join(realpathSync(tmpdir()), "new", "deep", "x.json"));
  });
  it("derives the repo root from the module, not the working directory", () => {
    expect(existsSync(join(REPO_ROOT, "mcp", "src", "paths.ts"))).toBe(true);
  });
  it("adds MOTION_STUDIO_ROOTS, separated like PATH", () => {
    const roots = allowedRoots({ MOTION_STUDIO_ROOTS: `${join(home, "ms-a")}${delimiter}${join(home, "ms-b")}` }, tmp);
    expect(confine(join(home, "ms-b", "x.json"), "write", roots)).toBe(join(home, "ms-b", "x.json"));
    expect(() => confine(join(home, "ms-c", "x.json"), "write", roots)).toThrow(/outside the folders/);
    expect(() => confine(join(home, "x.json"), "write", allowedRoots({}, tmp))).toThrow(/MOTION_STUDIO_ROOTS/);
  });
  it("refuses a .. escape", () => {
    const root = join(tmp, "root");
    mkdirSync(root, { recursive: true });
    expect(() => confine(`${root}/../../../etc/x.json`, "write", [root])).toThrow(/will not write .*outside the folders/);
    expect(() => confine(`${root}/sub/../../x.json`, "read", [root])).toThrow(/will not read/);
    expect(confine(`${root}/sub/../x.json`, "write", [root])).toBe(join(root, "x.json"));
  });
  it("checks the prefix on a path-segment boundary", () => {
    expect(() => confine(join(tmp, "rootling", "x.json"), "write", [join(tmp, "root")])).toThrow(/outside/);
  });
  it("refuses a symlink inside a root that points outside it, a dangling one included", () => {
    const link = join(tmp, "to-home"), dangling = join(tmp, "dangling.json");
    symlinkSync(home, link);
    symlinkSync(join(home, `.ms-mcp-nowhere-${process.pid}`, "x.json"), dangling);
    expect(canonicalPath(join(link, "x.json"))).toBe(join(home, "x.json"));
    expect(() => confine(join(link, "x.json"), "write")).toThrow(/outside the folders/);
    // link/.. is the parent of the link's target (the OS's reading), not the temp folder holding the link.
    expect(canonicalPath(`${link}/../x.json`)).toBe(join(home, "..", "x.json"));
    expect(() => confine(`${link}/../x.json`, "write")).toThrow(/outside the folders/);
    expect(() => confine(dangling, "write")).toThrow(/points nowhere/);
  });
  it("audio input must be an existing local file, never a URL or an ffmpeg protocol", () => {
    expect(() => decodeAudioFile("https://example.com/track.mp3")).toThrow(/not a local file/);
    expect(() => decodeAudioFile("concat:a.mp3|b.mp3")).toThrow(/not a local file/);
    expect(() => decodeAudioFile(join(tmp, "missing.mp3"))).toThrow(/not an existing file/);
    expect(() => decodeAudioFile(tmp)).toThrow(/not an existing file/);
  });
});

describe("MCP file tools stay inside the roots", () => {
  it("save_recipe, analyse_audio out and render out refuse a path outside, and write nothing", async () => {
    const { call } = await connect();
    const save = await call("save_recipe", { path: outside });
    expect(save.error).toBe(true);
    expect(save.text).toMatch(/will not write .*MOTION_STUDIO_ROOTS/);
    const t0 = Date.now();
    const r = await call("render", { out: join(home, `.ms-mcp-bundle-${process.pid}`) });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/will not write/);
    expect(Date.now() - t0).toBeLessThan(2000);   // refused before a server or a browser starts
    const wav = join(tmp, "silence.wav");
    writeFileSync(wav, Buffer.from("RIFF"));
    const an = await call("analyse_audio", { path: wav, out: outside });
    expect(an.error).toBe(true);
    expect(an.text).toMatch(/will not write/);
    expect(existsSync(outside)).toBe(false);
    const ok = await call("save_recipe", { path: join(tmp, "saved.json") });
    expect(ok.error).toBe(false);
    expect(existsSync(join(tmp, "saved.json"))).toBe(true);
  });
  it("load_recipe and load_analysis refuse a file outside, and never quote a file's contents", async () => {
    const { call } = await connect();
    const passwd = await call("load_recipe", { path: "/etc/passwd" });
    expect(passwd.error).toBe(true);
    expect(passwd.text).toMatch(/will not read \/etc\/passwd/);
    const secret = join(tmp, "secret.txt");
    writeFileSync(secret, "TOKEN=SECRET-CONTENT-12345\n");
    for (const tool of ["load_recipe", "load_analysis"]) {
      const r = await call(tool, { path: secret });
      expect(r.error).toBe(true);
      expect(r.text).toMatch(/is not valid JSON/);
      expect(r.text).not.toMatch(/SECRET|TOKEN/);
    }
  });
  it("analyse_audio refuses a URL and an ffmpeg protocol string", async () => {
    const { call } = await connect();
    for (const path of ["https://example.com/track.mp3", "concat:/etc/hosts|/etc/hosts"]) {
      const r = await call("analyse_audio", { path });
      expect(r.error).toBe(true);
      expect(r.text).toMatch(/not a local file/);
    }
  });
});

describe("MCP undo history", () => {
  it("a refused load_recipe adds no undo step", async () => {
    const { call, session } = await connect();
    const bad = join(tmp, "bad-recipe.json");
    writeFileSync(bad, JSON.stringify({ version: "nope" }));
    const before = JSON.stringify(session.recipe);
    expect((await call("load_recipe", { path: bad })).error).toBe(true);
    expect(session.undoDepth).toBe(0);
    expect(JSON.stringify(session.recipe)).toBe(before);
    expect((await call("undo")).text).toBe("Nothing to undo.");
  });
  it("new_recipe and load_recipe keep the same 100-step cap as apply", () => {
    const session = new Session();
    for (let i = 0; i < Session.UNDO_LIMIT + 50; i++) session.replace(session.recipe);
    expect(session.undoDepth).toBe(Session.UNDO_LIMIT);
    for (let i = 0; i < 10; i++) session.apply([{ type: "set", path: "beatGrid.bpm", value: 120 }]);
    expect(session.undoDepth).toBe(Session.UNDO_LIMIT);
  });
});
