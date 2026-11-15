/**
 * The timed prompt: the shot as a timeline a video model can follow, one line per camera block
 * (and the subject's notable events inside it), with times in seconds from the start of the clip,
 * e.g. `0.0–2.5 s: wide shot; the camera follows from behind as it flies along its path`. Each
 * block's start says which hit it lands on ("on the kick", "on the snare") when an analysed or
 * hand-added hit sits on its edge, else "on the downbeat" or "on the beat" from the grid.
 *
 * The page's Timed button, `motion-studio describe --timed` and the MCP `timed_prompt` tool all
 * call `timedPrompt`, so a person and an agent get the same text. Wording is plain and describes
 * the camera and the subject's motion, never the page's controls. `style` picks the time syntax:
 * `plain` ("0.0–2.5 s:", Kling's guide writes "0–3 s:") or `brackets` ("[0-2.5s]", Seedance's
 * guide writes "[0-3s]"); docs/models.md has the sources.
 */
import { hitBands } from "./lock";
import { beatAtSeconds } from "./beats";
import { rootAt, travelRange } from "./root-travel";
import type { Recipe } from "./recipe";
import { clipBeats } from "./beat-path";
import type { BandAnalysis } from "./audio-bands";
import type { CameraSegment } from "./camera";

export type TimedStyle = "plain" | "brackets";
export const TIMED_STYLES: readonly TimedStyle[] = ["plain", "brackets"];
export type HitLabel = "kick" | "snare" | "hat" | "downbeat" | "beat";
/** One line of the timeline: seconds from the clip's start, what starts it, and the words. */
export type TimedLine = { from: number; to: number; on?: HitLabel; text: string };
export type TimedOptions = {
  /** The analysed drums (the hits a block edge may land on); without them only the grid labels edges. */
  bands?: BandAnalysis;
  /** The clip's length in seconds (the page's clip); absent: the recipe's own length. */
  seconds?: number;
  style?: TimedStyle;
};

/** A hit within this many seconds of a block edge starts it. */
export const HIT_TOLERANCE = 0.06;
/** At most this many lines: a model loses a long list (Seedance's guide warns against micro-control). Blocks past it go on the last line, each with its start. */
export const MAX_TIMED_LINES = 12;
const BAND_WORD = { low: "kick", mid: "snare", high: "hat" } as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const spanSeconds = (r: Recipe, beat: number) => beat * 60 / r.beatGrid.bpm;

/** What starts a block at `beat`: the nearest hit within the tolerance, else the bar or the beat it sits on. */
export function hitAt(r: Recipe, beat: number, bands?: BandAnalysis): HitLabel | undefined {
  if (beat <= 1e-6) return undefined;
  const b = hitBands(bands, r), t = spanSeconds(r, beat);
  let best: { label: HitLabel; d: number } | undefined;
  if (b) for (const band of ["low", "mid", "high"] as const) for (const o of b[band]) {
    const d = Math.abs(spanSeconds(r, beatAtSeconds(r.beatGrid, o.seconds)) - t);
    if (d <= HIT_TOLERANCE && (!best || d < best.d - 1e-9)) best = { label: BAND_WORD[band], d };
  }
  if (best) return best.label;
  const whole = Math.abs(beat - Math.round(beat)) < 1e-3;
  if (!whole) return undefined;
  // After a slice, beat 0 is the beat nearest the cut, not a bar line: the bar phase is unknown.
  return r.slice === undefined && Math.round(beat) % r.beatGrid.beatsPerBar === 0 ? "downbeat" : "beat";
}

const MOVES: Record<string, string> = {
  static: "the camera holds still", fixed: "a fixed camera pans to keep it in frame", top: "top view, looking straight down on it",
  path: "the camera travels along its own route, keeping it in view", orbit: "the camera circles around it",
  pushIn: "the camera pushes in toward it", pullOut: "the camera pulls back from it", truck: "the camera slides sideways past it",
  chase: "the camera follows from behind", lead: "the camera leads from the front, facing it", side: "the camera tracks alongside it",
  threeQuarter: "the camera follows from a three-quarter angle",
};
const SHOT_WORD = { wide: "wide shot", medium: "medium shot", close: "close-up", low: "low angle", top: "top view" } as const;

/** What a camera block does on the hits it locks to ("its move pausing on each snare"), or "" when it does nothing there. */
export function lockClause(s: CameraSegment): string {
  if (!s.lock || !s.onHit) return "";
  const hit = s.lock === "beat" ? "beat" : s.lock;
  return s.onHit === "punch" ? `punching in on each ${hit}` : `its move pausing on each ${hit}`;
}

/** One camera block in plain words: framing, the move, offsets, lens and pace (`lockClause` says what it does on the hits). */
export function cameraClause(s: CameraSegment, r: Recipe): string {
  const modes = s.modes.filter(m => m !== "static" || s.modes.length === 1);
  const moves = modes.map(m => {
    if (m === "chase" && s.shoulder) return "the camera follows over its shoulder";
    if (m === "side") return (s.follow?.angle ?? 0) >= 90 ? "the camera tracks alongside it, on its right" : MOVES.side;
    if (m === "orbit") return `the camera circles ${(s.amount ?? r.camera?.orbitDegreesPerBeat ?? 1) < 0 ? "clockwise" : "anticlockwise"} around it`;
    if (m === "rise") return (s.amount ?? ((s.to ?? 1) - (s.from ?? 0))) < 0 ? "the camera lowers, tilting up" : "the camera rises, tilting down";
    if (m === "truck") return `the camera slides ${(s.amount ?? 0) < 0 ? "left" : "right"} past it`;
    return MOVES[m] ?? "";
  }).filter(Boolean);
  // A top block already says "top view": the preset's name is not said twice.
  const shot = s.shot && !(s.shot === "top" && modes.includes("top")) ? SHOT_WORD[s.shot] : "";
  const parts = [moves.join(", then ")];
  const f = s.follow;
  if (f && (f.distance !== undefined || f.height !== undefined))
    parts.push(`about ${[f.distance !== undefined ? `${r1(f.distance)} m away` : "", f.height !== undefined ? `${r1(f.height)} m up` : ""].filter(Boolean).join(" and ")}`);
  if (s.modes.includes("path") && r.camera?.path) {
    const ys = r.camera.path.map(p => p.y), y = ys.reduce((a, b) => a + b, 0) / ys.length;
    parts.push(y >= 5 ? "high above the ground" : y <= 0.8 ? "low to the ground" : "");
  }
  parts.push(s.pace === "fast" ? "quickly" : s.pace === "slow" ? "slowly" : "");
  if (s.fov !== undefined) parts.push(s.fov >= 90 ? "on a very wide lens" : s.fov <= 25 ? "on a long lens" : "");
  const move = parts.filter(Boolean).join(", ");
  const text = [shot, move].filter(Boolean).join("; ") || "the camera holds still";
  return s.cut ? `cut: ${text}` : text;
}

const TRAVEL_VERB = { glider: "glides", car: "drives", flyer: "flies", runner: "runs" } as const;
type Event = { beat: number; text: string };
const ACCENT_VERB: Record<string, string> = { jump: "it jumps", spin: "it spins", hit: "it strikes a pose", point: "it points", nod: "it nods" };

/** The subject's notable events: travel starting and stopping, turns along its path, jumps, holds and accents. */
export function subjectEvents(r: Recipe, endBeat: number): Event[] {
  const out: Event[] = [];
  const verb = r.character.kind === "rigged" ? "moves" : TRAVEL_VERB[r.figure?.shape ?? "glider"];
  const travel = travelRange(r.rootPath);
  if (travel && travel.from < endBeat) {
    out.push({ beat: travel.from, text: `it ${verb} along its path` });
    // Turns: runs of heading change in one direction, 35° or more, sampled every quarter beat.
    const step = 0.25, to = Math.min(travel.to, endBeat);
    let prev: { x: number; z: number } | null = null, heading: number | null = null, run = 0, runStart = 0;
    const flush = () => {
      if (Math.abs(run) >= 35) out.push({ beat: runStart, text: `it ${Math.abs(run) >= 120 ? "turns sharply" : "turns"} ${run < 0 ? "left" : "right"}` });
      run = 0;
    };
    for (let b = travel.from; b <= to + 1e-6; b += step) {
      const p = rootAt(r, b);
      if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) > 1e-3) {
        const h = Math.atan2(p.z - prev.z, p.x - prev.x) * 180 / Math.PI;
        if (heading !== null) {
          const d = ((h - heading + 540) % 360) - 180;   // + turns right on screen (x right, z down), - left
          if (Math.abs(d) < 1 || (run !== 0 && Math.sign(d) !== Math.sign(run))) flush();
          if (Math.abs(d) >= 1) { if (run === 0) runStart = b - step; run += d; }
        }
        heading = h;
      }
      prev = p;
    }
    flush();
    if (travel.to < endBeat - 1) out.push({ beat: travel.to, text: "it comes to a stop" });
  }
  for (const j of r.jumps ?? []) out.push({ beat: j.atBeat, text: "it jumps" });
  for (const fz of r.freezes ?? []) out.push({ beat: fz.fromBeat, text: "it freezes in place" }, { beat: fz.toBeat, text: "it moves again" });
  for (const m of r.reactive?.markers ?? []) out.push({ beat: beatAtSeconds(r.beatGrid, m.seconds), text: ACCENT_VERB[m.accent] ?? `it does a ${m.accent}` });
  return out.filter(e => e.beat >= 0 && e.beat < endBeat - 1e-6).sort((a, b) => a.beat - b.beat);
}

/**
 * An estimate of the clip a recipe was made for (the recipe does not record it; the page passes its
 * own clip, and `seconds` overrides this everywhere). A Draw Control recipe (the glider) runs to the
 * beat after its whole-second clip, `clipBeats(seconds, bpm)`: the clip is the longest whole second,
 * 3 to 30, that gives exactly its length in beats. Any other recipe is its own length.
 */
export function clipSeconds(r: Recipe): number {
  const all = r.durationBeats * 60 / r.beatGrid.bpm;
  if (r.character.kind !== "glider") return all;
  for (let w = Math.min(30, Math.ceil(all)); w >= 3; w--) if (clipBeats(w, r.beatGrid.bpm) === r.durationBeats) return w;
  return all;
}

/** The shot as timed lines: one per camera block (gaps hold still), the subject's events folded into the block they fall in. */
export function timedLines(r: Recipe, opts: TimedOptions = {}): TimedLine[] {
  const seconds = opts.seconds ?? clipSeconds(r), endBeat = seconds * r.beatGrid.bpm / 60;
  const blocks: { from: number; to: number; text: string; lock?: string }[] = [];
  let cursor = 0, lastLock = "";
  for (const s of [...(r.camera?.segments ?? [])].sort((a, b) => a.fromBeat - b.fromBeat)) {
    if (s.fromBeat >= endBeat - 1e-6) break;
    if (s.fromBeat > cursor + 1e-6) blocks.push({ from: cursor, to: s.fromBeat, text: "the camera holds still" });
    // The lock is said where it starts or changes, not on every line.
    const lock = lockClause(s);
    blocks.push({ from: s.fromBeat, to: Math.min(s.toBeat, endBeat), text: cameraClause(s, r), ...(lock && lock !== lastLock ? { lock } : {}) });
    lastLock = lock;
    cursor = Math.min(s.toBeat, endBeat);
  }
  if (cursor < endBeat - 1e-6) blocks.push({ from: cursor, to: endBeat, text: blocks.length ? "the camera holds still" : "a steady camera keeps it in frame" });
  const events = subjectEvents(r, endBeat);
  const lines: TimedLine[] = blocks.map(b => {
    const inside = events.filter(e => e.beat >= b.from - 1e-6 && e.beat < b.to - 1e-6);
    const atStart = inside.filter(e => Math.abs(spanSeconds(r, e.beat - b.from)) < 0.25).map(e => e.text);
    const later = inside.filter(e => Math.abs(spanSeconds(r, e.beat - b.from)) >= 0.25).map(e => `at ${r1(spanSeconds(r, e.beat)).toFixed(1)} s ${e.text}`);
    const text = [b.text + (atStart.length ? ` as ${atStart.join(" and ")}` : "") + (b.lock ? `, ${b.lock}` : ""), ...later].join("; ");
    const on = hitAt(r, b.from, opts.bands);
    return { from: r1(spanSeconds(r, b.from)), to: r1(spanSeconds(r, b.to)), ...(on ? { on } : {}), text };
  }).filter(l => l.to > l.from);
  if (lines.length <= MAX_TIMED_LINES) return lines;
  // Past the cap, the last line carries every block left, each with its own start: nothing is dropped.
  const last = lines.slice(MAX_TIMED_LINES - 1);
  return [...lines.slice(0, MAX_TIMED_LINES - 1), { ...last[0], to: last[last.length - 1].to,
    text: [last[0].text, ...last.slice(1).map(l => `from ${l.from.toFixed(1)} s${l.on ? `, ${HIT_WORDS[l.on]},` : ""} ${l.text}`)].join("; then ") }];
}

const trim = (x: number) => String(r1(x));
const HIT_WORDS: Record<HitLabel, string> = { kick: "on the kick", snare: "on the snare", hat: "on the hi-hat", downbeat: "on the downbeat", beat: "on the beat" };

/** One line in a style: `0.0–2.5 s, on the snare: …` (plain) or `[2.5-8s] on the snare: …` (brackets). */
export function formatLine(l: TimedLine, style: TimedStyle = "plain"): string {
  const on = l.on ? HIT_WORDS[l.on] : "";
  return style === "brackets"
    ? `[${trim(l.from)}-${trim(l.to)}s] ${on ? `${on}: ` : ""}${l.text}`
    : `${l.from.toFixed(1)}–${l.to.toFixed(1)} s${on ? `, ${on}` : ""}: ${l.text}`;
}

/** The timed prompt: the lines in the style, one per line. */
export const timedPrompt = (r: Recipe, opts: TimedOptions = {}): string => timedLines(r, opts).map(l => formatLine(l, opts.style)).join("\n");

/** Whether a text line is one the timed prompt writes (either style): used to tell an edited text from a generated one. */
export const isTimedLine = (line: string): boolean => /^\s*(\d+(\.\d+)?–\d+(\.\d+)? s[,:]|\[\d+(\.\d+)?-\d+(\.\d+)?s\])/.test(line);
