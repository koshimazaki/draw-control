/**
 * The shot script: the recipe's Action and Camera tracks as plain text, one row per block,
 * readable aloud. It is a view of the recipe, never stored: `printScript` renders it and
 * `applyScript` (script-apply.ts) turns it back into the recipe through the edit commands.
 * Grammar (docs/recipe.md#shot-script):
 *
 *   beats 0-8   | action: run on path lock kick 0.8 | camera: chase           | shot: wide
 *   beats 8-10  | action: jump @kick 2               | camera: orbit 360       | shot: medium
 *   beats 10-12 | action: rest                       | camera: rise 0.3m to 2m | shot: wide cut
 *   beats 12-16 | action: run                        | camera: chase lock snare punch 0.5m | shot: close
 *
 * A row is split wherever an action block or a camera block starts or ends; a block that
 * runs on over the next row is written `continue` there.
 */
import { ACCENT_KEYS } from "./accents";
import type { BandAnalysis } from "./audio-bands";
import { beatAtSeconds } from "./beats";
import { CAMERA_MODES, SHOTS, type CameraMode, type CameraSegment } from "./camera";
import { LOOP_CLIPS } from "./clip-library";
import { moveEndBeat } from "./engine";
import { LOCK_TARGETS } from "./lock";
import { MOVE_KEYS } from "./moves";
import { onsetBeats } from "./move-edits";
import type { Recipe } from "./recipe";
import { travelRange } from "./root-travel";

/** Spoken words for moves: [rigged clip, procedural library move]; exact clip and move names work too. */
export const ACTION_WORDS: Record<string, [rigged: string | null, procedural: string | null]> = {
  walk: ["Walk_Loop", "walk"], run: ["Jog_Fwd_Loop", "run"], jog: ["Jog_Fwd_Loop", "run"], sprint: ["Sprint_Loop", null],
  idle: ["Idle_Loop", "idle"], dance: ["Dance_Loop", "bounce"], crouch: ["Crouch_Idle_Loop", null], sneak: ["Crouch_Fwd_Loop", null],
  bounce: [null, "bounce"], clap: [null, "clap"], punches: [null, "punches"], disco: [null, "disco"],
};
/** Words with no move behind them. */
export const ACTION_SPECIAL = ["rest", "continue", "glide"] as const;
/** Camera words, each to a mode (amounts follow the word, see the grammar). */
export const CAMERA_WORDS: Record<string, CameraMode> = {
  static: "static", fixed: "fixed", path: "path", orbit: "orbit", chase: "chase", lead: "lead", side: "side", "three-quarter": "threeQuarter", top: "top",
  "follow behind": "chase", "follow front": "lead", "follow side": "side",
  "dolly in": "pushIn", "push in": "pushIn", "dolly out": "pullOut", "pull out": "pullOut",
  "truck left": "truck", "truck right": "truck", rise: "rise", "jib up": "rise", "jib down": "rise",
};

const isRigged = (r: Recipe) => r.character.kind === "rigged";
/** The moves the recipe's character can play, by word. */
export function actionVocabulary(r: Recipe): string[] {
  const words = Object.entries(ACTION_WORDS).filter(([, v]) => (isRigged(r) ? v[0] : v[1])).map(([k]) => k);
  return [...words, ...(isRigged(r) ? Object.keys(LOOP_CLIPS) : MOVE_KEYS)];
}
export const accentVocabulary = (): string[] => [...ACCENT_KEYS];
export const cameraVocabulary = (): string[] => [...Object.keys(CAMERA_WORDS), "continue"];

/** The word for a move: the first spoken word that maps to it, or its own name. */
export function wordForMove(r: Recipe, name: string): string {
  const hit = Object.entries(ACTION_WORDS).find(([, v]) => (isRigged(r) ? v[0] : v[1]) === name);
  return hit ? hit[0] : name;
}

export const fmt = (x: number) => String(Math.round(x * 1000) / 1000);
const metres = (x: number) => `${fmt(x)}m`;

/** A point list "(x,z)" or "(x,z,height)", the script's way to give a path. */
export const pointWords = (pts: readonly { x: number; z: number; y?: number }[]) => pts.map(p => `(${fmt(p.x)},${fmt(p.z)}${p.y !== undefined ? `,${fmt(p.y)}` : ""})`).join(" ");
/** Drawn walk paths longer than this print as "on path" without points (they keep their shape when re-applied). */
export const MAX_PRINTED_PATH_POINTS = 16;

/** One camera block as words; `path` prints the camera path's points after the path mode. */
export function cameraWords(s: CameraSegment, path?: readonly { x: number; y: number; z: number }[]): string {
  const part = (m: CameraMode): string => {
    switch (m) {
      case "orbit": return s.amount !== undefined ? `orbit ${fmt(s.amount)}` : "orbit";
      case "pushIn": return s.amount !== undefined ? `dolly in ${metres(s.amount)}` : s.to !== undefined ? `push in to ${metres(s.to)}` : "push in";
      case "pullOut": return s.amount !== undefined ? `dolly out ${metres(s.amount)}` : s.to !== undefined ? `pull out to ${metres(s.to)}` : "pull out";
      case "truck": return `truck ${(s.amount ?? 0) < 0 ? "left" : "right"} ${metres(Math.abs(s.amount ?? 0))}`;
      case "rise":
        if (s.from !== undefined) return `rise ${metres(s.from)} to ${metres(s.to ?? s.from)}`;
        if (s.to !== undefined) return `rise to ${metres(s.to)}`;
        if (s.amount !== undefined) return `jib ${s.amount < 0 ? "down" : "up"} ${metres(Math.abs(s.amount))}`;
        return "rise";
      case "threeQuarter": return "three-quarter";
      case "path": return path ? `path ${pointWords(path)}` : "path";
      default: return m;
    }
  };
  let out = s.modes.map(part).join(" + ");
  if (s.lock) {
    out += ` lock ${s.lock}${s.strength !== undefined ? ` ${fmt(s.strength)}` : ""}`;
    if (s.onHit === "punch") out += ` punch${s.punch !== undefined ? ` ${metres(s.punch)}` : ""}`;
    else if (s.onHit === "hold") out += " hold";
  }
  return out;
}

type Span = { from: number; to: number };
type ActionBlock = Span & { words: string };
type CameraBlock = Span & { words: string; shot: string };

/** The anchor of a hit inside a row: the Nth kick, snare or hat in the row, or a beat. */
function anchorFor(r: Recipe, bands: BandAnalysis | undefined, beat: number, row: Span): string {
  for (const band of ["kick", "snare", "hat"]) {
    const list = onsetBeats(r, bands, band).filter(b => b >= row.from - 1e-6 && b < row.to - 1e-6);
    const k = list.findIndex(b => Math.abs(b - beat) < 2e-3);
    if (k >= 0) return `@${band} ${k + 1}`;
  }
  return `@beat ${fmt(beat)}`;
}

function actionBlocks(r: Recipe): ActionBlock[] {
  const travel = travelRange(r.rootPath), lockWords = (l?: { lock?: string; strength?: number }) => (l?.lock ? ` lock ${l.lock}${l.strength !== undefined ? ` ${fmt(l.strength)}` : ""}` : "");
  const onPath = (s: Span) => !!travel && Math.abs(travel.from - s.from) < 1e-3 && Math.abs(travel.to - s.to) < 1e-3;
  const moving = travel ? r.rootPath.filter(p => p.beat >= travel.from - 1e-6) : [];
  const pts = moving.length && moving.length <= MAX_PRINTED_PATH_POINTS ? ` ${pointWords(moving)}` : "";
  const out: ActionBlock[] = [];
  let cursor = 0;
  const rest = (to: number) => { if (to > cursor + 1e-6) out.push({ from: cursor, to, words: onPath({ from: cursor, to }) ? `glide on path${pts}${lockWords(r.travelLock)}` : "rest" }); };
  r.moves.forEach((m, i) => {
    rest(m.atBeat);
    const span = { from: m.atBeat, to: moveEndBeat(r, i) };
    const path = onPath(span);
    out.push({ ...span, words: `${wordForMove(r, m.clip ?? nameOf(m))}${path ? ` on path${pts}` : ""}${lockWords(path && r.travelLock ? r.travelLock : m)}` });
    cursor = span.to;
  });
  rest(r.durationBeats);
  return out;
}
/** A library move's key from its display name (moves made by makeMove keep the key in the id). */
const nameOf = (m: Recipe["moves"][number]) => MOVE_KEYS.find(k => m.id === k || m.id.startsWith(`${k}-`)) ?? m.name;

function cameraBlocks(r: Recipe): CameraBlock[] {
  const out: CameraBlock[] = [];
  let cursor = 0;
  const gap = (to: number) => { if (to > cursor + 1e-6) out.push({ from: cursor, to, words: "static", shot: "-" }); };
  let pathPrinted = false;
  for (const s of r.camera?.segments ?? []) {
    gap(s.fromBeat);
    const withPath = !pathPrinted && s.modes.includes("path") ? r.camera!.path : undefined;
    if (withPath) pathPrinted = true;
    out.push({ from: s.fromBeat, to: s.toBeat, words: cameraWords(s, withPath), shot: s.shot ? `${s.shot}${s.cut ? " cut" : ""}` : "-" });
    cursor = s.toBeat;
  }
  if (r.camera) gap(r.durationBeats);
  return out;
}

/** The recipe as a shot script (rows cover beat 0 to the recipe's end). */
export function printScript(r: Recipe, bands?: BandAnalysis): string {
  const actions = actionBlocks(r), cams = cameraBlocks(r);
  const cuts = new Set<number>([0, r.durationBeats]);
  for (const b of [...actions, ...cams]) { cuts.add(Math.round(b.from * 1000) / 1000); cuts.add(Math.round(b.to * 1000) / 1000); }
  const edges = [...cuts].filter(b => b >= 0 && b <= r.durationBeats).sort((a, b) => a - b);
  const markers = r.reactive?.markers ?? [];
  const rows: string[][] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const row = { from: edges[i], to: edges[i + 1] };
    const a = actions.find(b => b.from < row.to - 1e-6 && b.to > row.from + 1e-6);
    const first = !!a && Math.abs(a.from - row.from) < 1e-3;
    const hits = markers.map(m => ({ m, beat: beatAtSeconds(r.beatGrid, m.seconds) })).filter(h => h.beat >= row.from - 1e-6 && h.beat < row.to - 1e-6)
      .map(h => `${h.m.accent} ${anchorFor(r, bands, h.beat, row)}`);
    // A rest that runs on reads "rest" again (the same thing as a new rest); other blocks read "continue".
    let action = !a ? "rest" : first || a.words === "rest" ? a.words : "continue";
    if (hits.length) action = action === "rest" ? hits.join(", ") : `${action}, ${hits.join(", ")}`;
    const cells = [`beats ${fmt(row.from)}-${fmt(row.to)}`, `action: ${action}`];
    if (r.camera) {
      const c = cams.find(b => b.from < row.to - 1e-6 && b.to > row.from + 1e-6);
      const cFirst = !!c && Math.abs(c.from - row.from) < 1e-3;
      cells.push(`camera: ${c && cFirst ? c.words : "continue"}`);
      if (c && cFirst) cells.push(`shot: ${c.shot}`);
    }
    rows.push(cells);
  }
  const widths = rows.reduce((w, cells) => cells.map((c, k) => Math.max(w[k] ?? 0, c.length)), [] as number[]);
  return rows.map(cells => cells.map((c, k) => (k < cells.length - 1 ? c.padEnd(widths[k]) : c)).join(" | ")).join("\n") + "\n";
}

export const SCRIPT_HELP = {
  shots: [...SHOTS], locks: [...LOCK_TARGETS], modes: [...CAMERA_MODES],
};
