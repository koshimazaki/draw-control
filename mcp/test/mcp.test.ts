import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { encodeWav } from "../../packages/core/src/index.ts";
import { patternTimes, synthDrums } from "../../packages/core/test/drum-synth.ts";
import { Session, createServer } from "../src/server.ts";

const dir = mkdtempSync(join(tmpdir(), "ms-mcp-"));
const wav = join(dir, "drums.wav");
writeFileSync(wav, encodeWav([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100, 0, 16.6));

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
  return { client, session, call };
}

describe("motion-studio MCP server", () => {
  it("lists the tools", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(["analyse_audio", "new_recipe", "apply", "set", "describe", "undo", "render", "list_commands"]));
  });
  it("worked example over MCP: analyse, a jump on every second kick, a camera push on the first snare", async () => {
    const { call, session } = await connect();
    expect((await call("analyse_audio", { path: wav })).text).toMatch(/120 BPM.*20 kicks, 16 snares/);
    await call("new_recipe");
    const r = await call("apply", { commands: [
      { type: "placeOnEvery", move: "jump", target: "kick", every: 2, replace: true },
      { type: "setCameraModes", modes: ["orbit"] },
      { type: "startCameraMove", modes: ["pushIn"], target: "snare", index: 0, lengthBeats: 4 },
    ] });
    expect(r.error).toBe(false);
    expect(r.text).toMatch(/Hit markers \(10, edited\)/);
    expect(session.recipe.camera!.segments.map(s => s.modes[0])).toEqual(["orbit", "pushIn", "orbit"]);
    expect((await call("set", { path: "camera.distance", value: 6 })).error).toBe(false);
    expect(session.recipe.camera!.distance).toBe(6);
    expect((await call("undo")).text).toBe("Undone.");
    expect(session.recipe.camera!.distance).toBe(4.4);
  });
  it("shot script over MCP: apply_script and get_script", async () => {
    const { call, session } = await connect();
    await call("analyse_audio", { path: wav });
    await call("new_recipe");
    await call("apply", { commands: [{ type: "setRootPath", points: [{ x: 0, z: 0 }, { x: 2, z: -3 }, { x: 5, z: -5 }, { x: 8, z: -5 }], fromBeat: 0, toBeat: 8 }] });
    const script = readFileSync(new URL("../../examples/scripts/follow-jump-top.txt", import.meta.url), "utf8");
    const r = await call("apply_script", { script });
    expect(r.error).toBe(false);
    expect(r.text).toMatch(/beats 8-10 +\| action: jump @snare 1 +\| camera: orbit 360/);
    expect(session.recipe.camera!.segments[1]).toMatchObject({ modes: ["orbit"], amount: 360, shot: "medium" });
    expect((await call("get_script")).text).toBe(r.text);
    const bad = await call("apply_script", { script: "beats 0-4 | camera: swoop" });
    expect(bad.error).toBe(true);
    expect(bad.text).toMatch(/unknown camera move "swoop"/);
  });
  it("reports a refused command as a tool error and keeps the recipe", async () => {
    const { call, session } = await connect();
    const before = JSON.stringify(session.recipe);
    const r = await call("apply", { commands: [{ type: "set", path: "beatGrid.bpm", value: 999 }] });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/bpm must be 40–240/);
    expect(JSON.stringify(session.recipe)).toBe(before);
  });
});
