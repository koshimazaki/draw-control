/**
 * motion-studio: the studio's edit commands from a terminal or an agent.
 *   analyse <audio> --out analysis.json
 *   groove <straight|drive|laidback> [--bars 9] --out track.wav   (the Beat Path examples' in-repo drum music)
 *   new [--character rigged|mannequin|block|stick|blob|glider] [--clip 5|8|10] [--slice 42.5] [--analysis a.json] --out recipe.json
 *       (--slice: where a Beat Path clip starts in a longer track, seconds, snapped to its nearest beat)
 *   apply <recipe.json> <commands.json> [--analysis a.json] [--out next.json]
 *   set <recipe.json> <path> <value> [--out next.json]
 *   describe <recipe.json> [--analysis a.json] [--script]
 *   script <recipe.json> <script.txt> [--analysis a.json] [--out next.json]
 *   commands
 *   render <recipe.json> [--audio track.wav] --out bundle/ [--view rig|front|side|top|orbit|iso] [--size 1280x720]
 *          [--start 8 --length 8 --unit beats|seconds] [--grid]
 * Without --out, apply and set print the recipe to stdout. Every command goes through the
 * same `applyMotionCommand` the studio UI uses.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
  DEFAULT_RECIPE, GROOVES, PROCEDURAL_KINDS, beatPathBase, encodeWav, grooveTimes, synthDrums, applyCommands, commandHelp, defaultRiggedRecipe, describeRecipe, printScript, validateRecipe, type CommandContext, type MotionCommand, type Recipe,
} from "../../packages/core/src/index.ts";
import { sliceStart } from "../../packages/core/src/internal.ts";
import { decodeAudioFile } from "./audio-file.ts";
import { analyse, driveFrom, parseAnalysis, type AnalysisJson } from "./analysis.ts";

type Flags = Record<string, string | true>;
const USAGE = readFileSync(new URL(import.meta.url)).toString().split("*/")[0].replace(/^\/\*\*\n?/, "").replace(/^ \* ?/gm, "");

export function parseArgs(argv: string[]): { pos: string[]; flags: Flags } {
  const pos: string[] = [], flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2), next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true; else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
const flagStr = (f: Flags, k: string) => (typeof f[k] === "string" ? f[k] as string : undefined);
const flagNum = (f: Flags, k: string) => { const v = flagStr(f, k); if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n)) throw new Error(`--${k} must be a number`); return n; };

/** The analysis named by --analysis, and the command context built from it. */
export function contextFrom(f: Flags): { analysis?: AnalysisJson; ctx: CommandContext } {
  const path = flagStr(f, "analysis");
  if (!path) return { ctx: {} };
  const analysis = parseAnalysis(readFileSync(path, "utf8"));
  return { analysis, ctx: { bands: analysis.bands, drive: driveFrom(analysis) } };
}

/** A value from the command line: JSON when it parses (numbers, true, null, objects), text otherwise. */
export const parseValue = (s: string): unknown => { try { return JSON.parse(s); } catch { return s; } };

function output(recipe: Recipe, f: Flags, out: (s: string) => void) {
  const text = JSON.stringify(recipe, null, 2) + "\n";
  const path = flagStr(f, "out");
  if (path) { writeFileSync(path, text); out(`wrote ${path}`); } else out(text.trimEnd());
}

const FIGURE_NAMES: Record<string, string> = { mannequin: "Procedural mannequin", block: "Block figure", stick: "Stick figure", blob: "Capsule figure" };

/** Start a recipe: the rigged mannequin dancing (or a procedural figure), fitted to the analysed track. */
export function newRecipe(character: string, analysis?: AnalysisJson, clip = 8, slice?: number): Recipe {
  // The glider starts from the Beat Path base: a clip of `clip` seconds, the rig the page uses; a slice starts it later in the track.
  if (character === "glider") {
    const start = slice !== undefined && analysis?.bpm ? sliceStart(slice, { bpm: analysis.bpm, firstBeat: analysis.offsetSeconds, lengthSeconds: analysis.lengthSeconds }, clip) : undefined;
    const base = beatPathBase({ seconds: clip, ...(analysis?.bpm ? { bpm: analysis.bpm, offsetSeconds: start ?? analysis.offsetSeconds } : {}),
      ...(analysis ? { audio: { name: basename(analysis.source).replace(/[<>{}\\]/g, ""), licence: "unspecified" } } : {}) });
    return start !== undefined ? validateRecipe({ ...base, slice: start }) : base;
  }
  let r: Recipe = character === "rigged" ? defaultRiggedRecipe() : { ...structuredClone(DEFAULT_RECIPE), character: { kind: character as Recipe["character"]["kind"], name: FIGURE_NAMES[character] ?? "Procedural mannequin", licence: "MIT (motion-studio)" } };
  if (analysis) {
    const bpm = analysis.bpm ?? r.beatGrid.bpm, offset = analysis.bpm ? analysis.offsetSeconds : 0;
    const beats = Math.max(1, Math.min(512, Math.floor((analysis.lengthSeconds - offset) * bpm / 60)));
    r = { ...r, durationBeats: beats, beatGrid: { ...r.beatGrid, bpm, offsetSeconds: offset, source: analysis.bpm ? "analysis" : "manual" }, audio: { name: basename(analysis.source).slice(0, 120).replace(/[<>{}\\]/g, ""), licence: "unspecified" } };
    r.moves = r.moves.filter(m => m.atBeat < beats);
  }
  return validateRecipe(r);
}

export async function main(argv: string[], out: (s: string) => void = s => console.log(s), err: (s: string) => void = s => console.error(s)): Promise<number> {
  const { pos, flags } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  try {
    switch (cmd) {
      case "groove": {
        // The examples' music, the same synth the page uses (tracks.ts): no audio file ships with the repo.
        const style = rest[0] as keyof typeof GROOVES, path = flagStr(flags, "out");
        if (!GROOVES[style] || !path) throw new Error("groove <straight|drive|laidback> [--bars 9] --out track.wav");
        const bars = Number(flagStr(flags, "bars") ?? 9), bpm = GROOVES[style].bpm, seconds = 0.1 + bars * 4 * 60 / bpm + 0.5;
        writeFileSync(path, encodeWav([synthDrums(grooveTimes(style, bars, 0.1), seconds)], 44100, 0, seconds));
        err(`${style}: ${bpm} BPM, ${bars} bars, ${seconds.toFixed(2)} s; wrote ${path}`);
        return 0;
      }
      case "analyse": case "analyze": {
        if (!rest[0]) throw new Error("analyse <audio> --out analysis.json");
        const a = analyse(decodeAudioFile(rest[0]), rest[0]);
        const text = JSON.stringify(a) + "\n";
        const path = flagStr(flags, "out");
        if (path) writeFileSync(path, text); else out(text.trimEnd());
        err(`${basename(rest[0])}: ${a.lengthSeconds} s, ${a.bpm ? `${a.bpm} BPM, first beat ${a.offsetSeconds} s` : "no clear tempo"}; ${a.bands.low.length} kicks, ${a.bands.mid.length} snares, ${a.bands.high.length} hats, ${a.bands.peaks.length} peaks${path ? `; wrote ${path}` : ""}`);
        return 0;
      }
      case "new": {
        const character = flagStr(flags, "character") ?? "rigged";
        if (!["rigged", ...PROCEDURAL_KINDS, "glider"].includes(character)) throw new Error(`--character must be rigged, ${PROCEDURAL_KINDS.join(", ")} or glider`);
        const clip = flagStr(flags, "clip") === undefined ? 8 : Number(flagStr(flags, "clip"));
        if (!(clip > 0 && clip <= 60)) throw new Error("--clip takes seconds, 5 or 8 for Beat Path");
        const slice = flagStr(flags, "slice") === undefined ? undefined : Number(flagStr(flags, "slice"));
        if (slice !== undefined && !(slice >= 0)) throw new Error("--slice takes seconds into the track");
        output(newRecipe(character, contextFrom(flags).analysis, clip, slice), flags, out);
        return 0;
      }
      case "apply": {
        if (!rest[0] || !rest[1]) throw new Error("apply <recipe.json> <commands.json> [--analysis a.json] [--out next.json]");
        const recipe = validateRecipe(readJson(rest[0]));
        const raw = readJson(rest[1]);
        const commands = (Array.isArray(raw) ? raw : [raw]) as MotionCommand[];
        output(applyCommands(recipe, commands, contextFrom(flags).ctx), flags, out);
        return 0;
      }
      case "set": {
        if (!rest[0] || !rest[1] || rest[2] === undefined) throw new Error("set <recipe.json> <path> <value> [--out next.json]");
        const recipe = validateRecipe(readJson(rest[0]));
        output(applyCommands(recipe, [{ type: "set", path: rest[1], value: parseValue(rest[2]) }]), flags, out);
        return 0;
      }
      case "describe": {
        if (!rest[0]) throw new Error("describe <recipe.json> [--analysis a.json] [--script]");
        const r = validateRecipe(readJson(rest[0])), bands = contextFrom(flags).analysis?.bands;
        out(flags.script ? printScript(r, bands).trimEnd() : describeRecipe(r, bands));
        return 0;
      }
      case "script": {
        if (!rest[0] || !rest[1]) throw new Error("script <recipe.json> <script.txt> [--analysis a.json] [--out next.json]");
        const recipe = validateRecipe(readJson(rest[0]));
        output(applyCommands(recipe, [{ type: "applyScript", script: readFileSync(rest[1], "utf8") }], contextFrom(flags).ctx), flags, out);
        return 0;
      }
      case "commands": {
        for (const [k, v] of Object.entries(commandHelp())) out(`${k.padEnd(20)} ${v}`);
        return 0;
      }
      case "render": {
        const dir = flagStr(flags, "out");
        if (!rest[0] || !dir) throw new Error("render <recipe.json> [--audio track.wav] --out bundle/");
        const { render } = await import("./render.ts");
        const unit = flagStr(flags, "unit");
        if (unit && unit !== "beats" && unit !== "seconds") throw new Error("--unit must be beats or seconds");
        const files = await render(validateRecipe(readJson(rest[0])), {
          audio: flagStr(flags, "audio"), out: dir, view: flagStr(flags, "view"), size: flagStr(flags, "size"),
          start: flagNum(flags, "start"), length: flagNum(flags, "length"), unit: unit as "beats" | "seconds" | undefined, grid: flags.grid === true, log: err,
        });
        out(`wrote ${files.length} files to ${dir}: ${files.join(", ")}`);
        return 0;
      }
      default:
        out(USAGE.trim());
        return cmd && cmd !== "help" && !flags.help ? 1 : 0;
    }
  } catch (e) {
    err(`motion-studio ${cmd}: ${(e as Error).message}`);
    return 1;
  }
}
