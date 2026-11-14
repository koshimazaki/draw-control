/**
 * Cutting a lane on the beat: split a block at the playhead (snapped like an edge drag, by the
 * page), at every hit inside it, or every
 * 1, 2 or 4 beats; and "Moves on hits", which cuts the whole Camera lane at each hit and gives
 * the blocks a sequence of moves in order, cycling. Blocks stay at least MIN_BEATS long. Pure:
 * page-actions.ts wires the menus and the S key.
 */
import { MIN_BEATS } from "./lanes";
import { CAMERA_WORDS, type Block, type CameraWord } from "./script";

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Cut points inside a block, at least MIN_BEATS from its edges and from each other (earliest first). */
function usable(from: number, to: number, cuts: readonly number[]): number[] {
  const out: number[] = [];
  for (const c of [...cuts].sort((a, b) => a - b)) {
    const last = out.length ? out[out.length - 1] : from;
    if (c - last >= MIN_BEATS - 1e-9 && to - c >= MIN_BEATS - 1e-9) out.push(r3(c));
  }
  return out;
}

/** Block `i` cut at each of `cuts` that fits (each part keeps the block's word and settings), or null when none fits. */
export function splitBlockAt<W extends string>(blocks: Block<W>[], i: number, cuts: readonly number[]): Block<W>[] | null {
  const b = blocks[i], edges = usable(b.from, b.to, cuts);
  if (!edges.length) return null;
  const all = [b.from, ...edges, b.to];
  return [...blocks.slice(0, i), ...all.slice(0, -1).map((from, k) => ({ ...b, from, to: all[k + 1] })), ...blocks.slice(i + 1)];
}

/** The beats every `step` beats inside a block. */
export function everyBeats(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let b = from + step; b < to - 1e-9; b += step) out.push(b);
  return out;
}

/** The block containing `beat` (the last one at the clip's end), or -1. */
export function blockAt(blocks: readonly { from: number; to: number }[], beat: number): number {
  const i = blocks.findIndex(b => beat >= b.from - 1e-9 && beat < b.to - 1e-9);
  return i >= 0 ? i : blocks.length && beat >= blocks[blocks.length - 1].to - 1e-9 ? blocks.length - 1 : -1;
}

/** The whole Camera lane cut at each hit, the moves given out in order, cycling. */
export function movesOnHits(total: number, hits: readonly number[], words: readonly CameraWord[]): Block<CameraWord>[] {
  if (!words.length) return [{ from: 0, to: total, word: "behind" }];
  const all = [0, ...usable(0, total, hits), total];
  return all.slice(0, -1).map((from, k) => ({ from, to: all[k + 1], word: words[k % words.length] }));
}

/** Plain names for the camera words, as typed in "Moves on hits". */
const ALIASES: Record<string, CameraWord> = {
  behind: "behind", "follow behind": "behind", follow: "behind", chase: "behind",
  side: "side", "follow side": "side", orbit: "orbit", top: "top", above: "top",
  path: "path", "my path": "path", push: "push", "push in": "push", dolly: "push",
};
/** "orbit, top, push in, my path" to camera words, or the first word that is not one. */
export function parseMoves(text: string): { words: CameraWord[] } | { error: string } {
  const parts = text.toLowerCase().split(/[,→>\n]+|\bthen\b/).map(s => s.trim()).filter(Boolean);
  const words: CameraWord[] = [];
  for (const p of parts) {
    const w = ALIASES[p] ?? (CAMERA_WORDS as readonly string[]).find(x => x === p) as CameraWord | undefined;
    if (!w) return { error: `"${p}" is not a camera move: use follow behind, follow side, orbit, top, push in or my path` };
    words.push(w);
  }
  return words.length ? { words } : { error: "List at least one move, e.g. orbit, top, push in, my path" };
}
