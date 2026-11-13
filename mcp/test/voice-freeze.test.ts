/**
 * The worked voice → script example (docs/agents.md, examples/scripts/voice-freeze-orbit.txt):
 * travel, over the shoulder, a jump with the camera above, a freeze mid-air while the camera
 * orbits, the landing, a crane down, a dolly in. The CLI and the MCP server build the same
 * recipe; the freeze holds the figure in the air; the shot description travels in the recipe.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { encodeWav, frameAt, planCamera, printScript, applyScript, type Recipe } from "../../packages/core/src/index.ts";
import { patternTimes, synthDrums } from "../../packages/core/src/drum-synth.ts";
import { Session, createServer } from "../src/server.ts";
import { main } from "../../cli/src/main.ts";
import { driveFrom, parseAnalysis } from "../../cli/src/analysis.ts";

const dir = mkdtempSync(join(tmpdir(), "ms-voice-"));
const wav = join(dir, "drums.wav"), analysisPath = join(dir, "analysis.json"), script = new URL("../../examples/scripts/voice-freeze-orbit.txt", import.meta.url);
writeFileSync(wav, encodeWav([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100, 0, 16.6));
const cli = async (...argv: string[]) => { const err: string[] = []; const code = await main(argv, () => {}, s => err.push(s)); if (code) throw new Error(err.join("\n")); };

describe("voice → script: freeze mid-air while the camera orbits", () => {
  it("the CLI and the MCP server give the same recipe; the freeze holds the figure in the air", async () => {
    await cli("analyse", wav, "--out", analysisPath);
    const base = join(dir, "base.json"), out = join(dir, "out.json");
    await cli("new", "--character", "glider", "--clip", "8", "--analysis", analysisPath, "--out", base);
    await cli("script", base, script.pathname, "--analysis", analysisPath, "--out", out);
    const viaCli = JSON.parse(readFileSync(out, "utf8")) as Recipe;
    const session = new Session();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(session).connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
      if (r.isError) throw new Error(r.content[0].text);
      return r.content[0].text;
    };
    await call("load_analysis", { path: analysisPath });
    await call("new_recipe", { character: "glider", clip: 8 });
    await call("apply_script", { script: readFileSync(script, "utf8") });
    expect(JSON.parse(await call("get_recipe"))).toEqual(viaCli);

    const drive = driveFrom(parseAnalysis(readFileSync(analysisPath, "utf8")));
    expect(viaCli.freezes).toEqual([{ fromBeat: 8.5, toBeat: 10.5 }]);
    expect(viaCli.shot?.subject).toMatch(/dancer/);
    expect(viaCli.camera!.segments.map(s => s.modes.join("+") + (s.shoulder ? " shoulder" : ""))).toEqual(["chase", "chase shoulder", "top", "orbit", "rise", "pushIn"]);
    const at = (beat: number) => frameAt(viaCli, Math.round((viaCli.beatGrid.offsetSeconds + beat / 2) * 24), drive).root;
    const held = at(8.6), later = at(10.3);
    expect(held.y).toBeGreaterThan(0.25);   // in the air
    expect([later.x, later.y, later.z]).toEqual([held.x, held.y, held.z]);   // and still there
    expect(at(12).y).toBeLessThan(0.05);    // landed, moving on
    expect(Math.hypot(at(14).x - at(12).x, at(14).z - at(12).z)).toBeGreaterThan(0.3);
    // the camera orbits during the freeze, and keeps the figure in frame
    const plan = planCamera(viaCli, drive, 420), f = (beat: number) => Math.round((viaCli.beatGrid.offsetSeconds + beat / 2) * 24);
    expect(Math.hypot(...plan.samples[f(10.3)].position.map((v, i) => v - plan.samples[f(8.7)].position[i]))).toBeGreaterThan(2);
    // printing and applying again gives the same recipe
    expect(applyScript(JSON.parse(readFileSync(base, "utf8")), { script: printScript(viaCli, drive.bands) }, { drive, bands: drive.bands })).toEqual(viaCli);
  });
});
