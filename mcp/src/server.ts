/**
 * motion-studio MCP server: the studio's edit commands over stdio, for agents. A session
 * holds one working recipe and, optionally, one track analysis; every edit goes through
 * the same `applyMotionCommand` the studio UI and the CLI use, and can be undone.
 * Tools: analyse_audio, load_analysis, new_recipe, load_recipe, save_recipe, get_recipe,
 * describe, get_script, apply_script, list_commands, apply, set, undo, render.
 * Files are read and written on this machine only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyCommands, commandHelp, describeRecipe, printScript, validateRecipe, type CommandContext, type MotionCommand, type Recipe } from "../../packages/core/src/index.ts";
import { analyse, driveFrom, parseAnalysis, type AnalysisJson } from "../../cli/src/analysis.ts";
import { decodeAudioFile } from "../../cli/src/audio-file.ts";
import { newRecipe } from "../../cli/src/main.ts";

export class Session {
  recipe: Recipe = newRecipe("rigged");
  analysis?: AnalysisJson;
  private past: Recipe[] = [];
  ctx(): CommandContext { return this.analysis ? { bands: this.analysis.bands, drive: driveFrom(this.analysis) } : {}; }
  apply(commands: MotionCommand[]): Recipe {
    const next = applyCommands(this.recipe, commands, this.ctx());
    this.past.push(this.recipe);
    if (this.past.length > 100) this.past.shift();
    this.recipe = next;
    return next;
  }
  replace(r: Recipe) { this.past.push(this.recipe); this.recipe = validateRecipe(r); }
  undo(): boolean { const r = this.past.pop(); if (!r) return false; this.recipe = r; return true; }
  describe() { return describeRecipe(this.recipe, this.analysis?.bands); }
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true });
const guard = <A,>(fn: (a: A) => Promise<{ content: { type: "text"; text: string }[] }> | { content: { type: "text"; text: string }[] }) =>
  async (a: A) => { try { return await fn(a); } catch (e) { return fail(e); } };

export function createServer(session = new Session()): McpServer {
  const server = new McpServer({ name: "motion-studio", version: "0.1.0" });
  const help = commandHelp();
  const summary = (a: AnalysisJson) => `${a.lengthSeconds} s, ${a.bpm ? `${a.bpm} BPM, first beat ${a.offsetSeconds} s` : "no clear tempo"}; ${a.bands.low.length} kicks, ${a.bands.mid.length} snares, ${a.bands.high.length} hats, ${a.bands.peaks.length} peaks`;

  server.registerTool("analyse_audio", {
    description: "Analyse a local music file (WAV; MP3/M4A/FLAC/OGG with ffmpeg): tempo, kicks, snares, hats and peaks. Keeps the analysis for commands that read the music; writes analysis.json when `out` is given.",
    inputSchema: { path: z.string(), out: z.string().optional() },
  }, guard(({ path, out }: { path: string; out?: string }) => {
    session.analysis = analyse(decodeAudioFile(path), path);
    if (out) writeFileSync(out, JSON.stringify(session.analysis) + "\n");
    return text(`Analysed ${path}: ${summary(session.analysis)}.`);
  }));
  server.registerTool("load_analysis", { description: "Load an analysis.json written by `motion-studio analyse`.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { session.analysis = parseAnalysis(readFileSync(path, "utf8")); return text(`Loaded ${path}: ${summary(session.analysis)}.`); }));
  server.registerTool("new_recipe", {
    description: "Start a new working recipe (rigged mannequin by default), fitted to the analysed track's tempo and length when there is one.",
    inputSchema: { character: z.enum(["rigged", "mannequin", "block", "stick", "blob"]).optional() },
  }, guard(({ character }: { character?: string }) => { session.replace(newRecipe(character ?? "rigged", session.analysis)); return text(session.describe()); }));
  server.registerTool("load_recipe", { description: "Load a recipe JSON file as the working recipe.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { session.replace(JSON.parse(readFileSync(path, "utf8"))); return text(session.describe()); }));
  server.registerTool("save_recipe", { description: "Write the working recipe to a JSON file.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { writeFileSync(path, JSON.stringify(session.recipe, null, 2) + "\n"); return text(`Wrote ${path}.`); }));
  server.registerTool("get_recipe", { description: "The working recipe as JSON." }, guard(() => text(JSON.stringify(session.recipe, null, 2))));
  server.registerTool("describe", { description: "The timeline as text: moves (blocks), markers, camera, walk path, envelope, onsets in beats." }, guard(() => text(session.describe())));
  server.registerTool("get_script", { description: "The working recipe as a shot script: one row per block, \"beats 0-8 | action: run on path | camera: chase | shot: wide\"." },
    guard(() => text(printScript(session.recipe, session.analysis?.bands))));
  server.registerTool("apply_script", {
    description: "Replace the Action and Camera tracks from a shot script (the grammar get_script prints; see docs/recipe.md#shot-script). Unknown words fail with the valid ones. Returns the script as it now reads.",
    inputSchema: { script: z.string().min(1).max(100_000) },
  }, guard(({ script }: { script: string }) => { session.apply([{ type: "applyScript", script }]); return text(printScript(session.recipe, session.analysis?.bands)); }));
  server.registerTool("list_commands", { description: "Every edit command with its arguments." },
    guard(() => text(Object.entries(help).map(([k, v]) => `${k}: ${v}`).join("\n"))));
  server.registerTool("apply", {
    description: `Apply edit commands in order to the working recipe (all or none). Each is { type, ...args }; types: ${Object.keys(help).join(", ")}. Call list_commands for arguments.`,
    inputSchema: { commands: z.array(z.object({ type: z.string() }).passthrough()).min(1).max(500) },
  }, guard(({ commands }: { commands: MotionCommand[] }) => { session.apply(commands); return text(`Applied ${commands.length} command(s).\n${session.describe()}`); }));
  server.registerTool("set", {
    description: "Set any recipe field by path (beatGrid.bpm, moves#<id>.speed, camera.distance, reactive.amplitude…); null deletes it.",
    inputSchema: { path: z.string().max(200), value: z.unknown() },
  }, guard(({ path, value }: { path: string; value: unknown }) => { session.apply([{ type: "set", path, value }]); return text(`Set ${path}.`); }));
  server.registerTool("undo", { description: "Undo the last change to the working recipe." },
    guard(() => text(session.undo() ? "Undone." : "Nothing to undo.")));
  server.registerTool("render", {
    description: "Render the working recipe to a guide bundle folder in headless Chrome (MP4, frame 0, beats.json with onsets, camera.json, recipe, meta). Slow: about real time or a little more.",
    inputSchema: {
      out: z.string(), audio: z.string().optional(), view: z.enum(["rig", "front", "side", "top", "orbit", "iso"]).optional(), size: z.string().regex(/^\d+x\d+$/).optional(),
      start: z.number().optional(), length: z.number().optional(), unit: z.enum(["beats", "seconds"]).optional(), grid: z.boolean().optional(),
    },
  }, guard(async (o: { out: string; audio?: string; view?: string; size?: string; start?: number; length?: number; unit?: "beats" | "seconds"; grid?: boolean }) => {
    const { render } = await import("../../cli/src/render.ts");
    const log: string[] = [];
    const files = await render(session.recipe, { ...o, log: s => log.push(s) });
    return text(`Wrote ${files.join(", ")} to ${o.out}.\n${log.join("\n")}`);
  }));
  return server;
}
