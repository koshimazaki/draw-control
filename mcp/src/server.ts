/**
 * motion-studio MCP server: the studio's edit commands over stdio, for agents. A session
 * holds one working recipe and, optionally, one track analysis; every edit goes through
 * the same `applyMotionCommand` the studio UI and the CLI use, and can be undone.
 * Tools: analyse_audio, load_analysis, new_recipe, load_recipe, save_recipe, get_recipe,
 * describe, timed_prompt, get_script, apply_script, list_commands, apply, set, undo, render.
 * Files are read and written on this machine only, and only under the allowed roots
 * (paths.ts: cwd, the repo, the temp directory, MOTION_STUDIO_ROOTS); audio input may be
 * any existing local file, never a URL.
 */
import { writeFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyCommands, commandHelp, describeRecipe, printScript, timedPrompt, validateRecipe, type CommandContext, type MotionCommand, type Recipe } from "../../packages/core/src/index.ts";
import { analyse, checkAnalysis, driveFrom, type AnalysisJson } from "../../cli/src/analysis.ts";
import { decodeAudioFile, localAudioPath } from "../../cli/src/audio-file.ts";
import { confine, readJsonConfined } from "./paths.ts";
import { newRecipe } from "../../cli/src/main.ts";

export class Session {
  recipe: Recipe = newRecipe("rigged");
  analysis?: AnalysisJson;
  /** Undo steps, newest last; at most UNDO_LIMIT. */
  private past: Recipe[] = [];
  static readonly UNDO_LIMIT = 100;
  get undoDepth() { return this.past.length; }
  ctx(): CommandContext { return this.analysis ? { bands: this.analysis.bands, drive: driveFrom(this.analysis) } : {}; }
  apply(commands: MotionCommand[]): Recipe { this.commit(applyCommands(this.recipe, commands, this.ctx())); return this.recipe; }
  /** Validated first: a refused recipe leaves the working one and the undo history as they were. */
  replace(r: unknown) { this.commit(validateRecipe(r)); }
  private commit(next: Recipe) {
    this.past.push(this.recipe);
    if (this.past.length > Session.UNDO_LIMIT) this.past.shift();
    this.recipe = next;
  }
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
    const target = out === undefined ? undefined : confine(out, "write");
    session.analysis = analyse(decodeAudioFile(path), path);
    if (target) writeFileSync(target, JSON.stringify(session.analysis) + "\n");
    return text(`Analysed ${path}: ${summary(session.analysis)}.`);
  }));
  server.registerTool("load_analysis", { description: "Load an analysis.json written by `motion-studio analyse`.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { session.analysis = checkAnalysis(readJsonConfined(path)); return text(`Loaded ${path}: ${summary(session.analysis)}.`); }));
  server.registerTool("new_recipe", {
    description: "Start a new working recipe (rigged mannequin by default), fitted to the analysed track's tempo and length when there is one. character glider starts the Draw Control base: a clip of `clip` seconds (whole seconds, 3 to 30) with the page's camera rig, for a Draw Control shot script; `slice` starts the clip that many seconds into a longer track (snapped to its nearest beat). A script line \"slice: 42.5s\" does the same.",
    inputSchema: { character: z.enum(["rigged", "mannequin", "block", "stick", "blob", "glider"]).optional(), clip: z.number().min(1).max(60).optional(), slice: z.number().min(0).max(3600).optional() },
  }, guard(({ character, clip, slice }: { character?: string; clip?: number; slice?: number }) => { session.replace(newRecipe(character ?? "rigged", session.analysis, clip ?? 8, slice)); return text(session.describe()); }));
  server.registerTool("load_recipe", { description: "Load a recipe JSON file as the working recipe.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { session.replace(readJsonConfined(path)); return text(session.describe()); }));
  server.registerTool("save_recipe", { description: "Write the working recipe to a JSON file.", inputSchema: { path: z.string() } },
    guard(({ path }: { path: string }) => { writeFileSync(confine(path, "write"), JSON.stringify(session.recipe, null, 2) + "\n"); return text(`Wrote ${path}.`); }));
  server.registerTool("get_recipe", { description: "The working recipe as JSON." }, guard(() => text(JSON.stringify(session.recipe, null, 2))));
  server.registerTool("describe", { description: "The timeline as text: moves (blocks), markers, camera, walk path, envelope, onsets in beats." }, guard(() => text(session.describe())));
  server.registerTool("timed_prompt", {
    description: "The shot as a timed prompt, the Draw Control page's Timed button: one line per camera block with times in seconds from the clip's start (\"0.0–2.5 s, on the snare: …\"), the hit or beat each block starts on (from the loaded analysis), and the subject's turns, jumps and holds. style brackets writes Seedance's \"[0-2.5s]\" windows. seconds: the clip length (default: the recipe's clip). write: true also puts it in the recipe's shot action (replacing what is there).",
    inputSchema: { style: z.enum(["plain", "brackets"]).optional(), seconds: z.number().min(1).max(3600).optional(), write: z.boolean().optional() },
  }, guard(({ style, seconds, write }: { style?: "plain" | "brackets"; seconds?: number; write?: boolean }) => {
    const timed = timedPrompt(session.recipe, { bands: session.analysis?.bands, ...(style ? { style } : {}), ...(seconds !== undefined ? { seconds } : {}) });
    if (write) { const r = session.recipe; session.replace({ ...r, shot: { subject: "", environment: "", legend: "", ...r.shot, action: timed } }); }
    return text(write ? `Wrote the shot action:\n${timed}` : timed);
  }));
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
    const out = confine(o.out, "write"), audio = o.audio === undefined ? undefined : localAudioPath(o.audio);
    const files = await render(session.recipe, { ...o, out, audio, log: s => log.push(s) });
    return text(`Wrote ${files.join(", ")} to ${o.out}.\n${log.join("\n")}`);
  }));
  return server;
}
