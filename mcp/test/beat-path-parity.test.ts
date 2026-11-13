/**
 * Voice → agent → script → page without the page: the same Beat Path shot script gives the
 * same recipe in the page's code, through the CLI (`new --character glider --clip 8`, then
 * `script`) and through the MCP server (`new_recipe`, then `apply_script`).
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { encodeWav } from "../../packages/core/src/index.ts";
import { patternTimes, synthDrums } from "../../packages/core/src/drum-synth.ts";
import { Session, createServer } from "../src/server.ts";
import { main } from "../../cli/src/main.ts";
import { driveFrom, parseAnalysis } from "../../cli/src/analysis.ts";
import { beatPathRecipe } from "../../packages/studio/src/beat-path/recipe-map.ts";
import { BLANK_STATE, fromScript, toScript } from "../../packages/studio/src/beat-path/script.ts";

const dir = mkdtempSync(join(tmpdir(), "ms-beat-path-"));
const wav = join(dir, "drums.wav"), analysisPath = join(dir, "analysis.json");
writeFileSync(wav, encodeWav([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100, 0, 16.6));
const scriptsDir = new URL("../../examples/scripts/", import.meta.url);
const examples = readdirSync(scriptsDir).filter(f => f.startsWith("beat-path-"));
const cli = async (...argv: string[]) => { const err: string[] = []; const code = await main(argv, () => {}, s => err.push(s)); if (code) throw new Error(err.join("\n")); };

describe("Beat Path scripts: page, CLI and MCP agree", () => {
  it("has the examples", () => expect(examples.length).toBe(7));
  for (const file of examples) it(file, async () => {
    const text = readFileSync(new URL(file, scriptsDir), "utf8");
    await cli("analyse", wav, "--out", analysisPath);
    const analysis = parseAnalysis(readFileSync(analysisPath, "utf8"));
    // The page: the script read into its state, printed again and applied to its base.
    const { state, notes } = fromScript(text, BLANK_STATE);
    expect(notes).toEqual([]);
    const page = beatPathRecipe(state, { name: "drums.wav", licence: "unspecified", bpm: analysis.bpm!, offsetSeconds: analysis.offsetSeconds, lengthSeconds: analysis.lengthSeconds },
      { bands: analysis.bands, drive: driveFrom(analysis) });
    // The CLI, with the example file as written.
    const base = join(dir, `${file}.base.json`), out = join(dir, `${file}.out.json`), scriptFile = join(dir, file);
    writeFileSync(scriptFile, text);
    await cli("new", "--character", "glider", "--clip", String(state.clip), "--analysis", analysisPath, "--out", base);
    await cli("script", base, scriptFile, "--analysis", analysisPath, "--out", out);
    const viaCli = JSON.parse(readFileSync(out, "utf8"));
    expect(viaCli).toEqual(page);
    // The MCP server, with the page's printed script.
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
    await call("new_recipe", { character: "glider", clip: state.clip });
    await call("apply_script", { script: toScript(state) });
    expect(JSON.parse(await call("get_recipe"))).toEqual(page);
  });
});
