/**
 * Audio-reactive animation layer, stored in the recipe as `reactive`. It sits on top of
 * the time-stretch path (the moves still sit on the beat grid) and adds:
 * - tempo by energy: per bar, quiet bars settle to idle, soft bars play half time and
 *   loud bars double time (only where the move's cycle allows it), cross-faded at the bar;
 * - amplitude by energy: strides and gestures grow with loudness, continuously;
 * - accents: accent moves fired on onsets and/or downbeats, their key pose landing on the hit;
 * - humanise: overlapping action and follow-through (spine, head and arms lag the hips by
 *   a few frames), and small seeded variation so repeats differ.
 * `planReactive` precomputes the bar levels and the hits; perform.ts evaluates frames.
 */
import { ACCENT_MOVES, accentSpan, type AccentKey } from "./accents";
import { energyAtFrame, type AudioDrive } from "./audio-drive";
import { beatAtSeconds, secondsAtBeat } from "./beats";
import { activeMoveIndex } from "./engine";
import { makeMove } from "./moves";
import { hash32 } from "./rng";
import { moveBeats, type Recipe } from "./recipe";
import type { ReactiveConfig } from "./reactive-config";

/** Tempo level of a bar: 0 = idle, otherwise a rate on the move's phases. */
export type BarLevel = 0 | 0.5 | 1 | 2;
export type Hit = { seconds: number; beat: number; key: AccentKey; source: "downbeat" | "onset" };
export type ReactivePlan = {
  config: ReactiveConfig;
  barEnergy: number[];
  levels: BarLevel[];
  hits: Hit[];
  /** A one-move recipe holding the idle move, for quiet bars. */
  idle: Recipe;
  drive?: AudioDrive;
};

function barLevel(recipe: Recipe, cfg: ReactiveConfig, bar: number, energy: number): BarLevel {
  if (cfg.idleBelow > 0 && energy < cfg.idleBelow) return 0;
  if (cfg.speed <= 0 || recipe.moves.length === 0) return 1;
  const move = recipe.moves[activeMoveIndex(recipe, bar * recipe.beatGrid.beatsPerBar + 0.5)];
  if (move.clip) return 1;
  const cycle = moveBeats(move, recipe);
  if (energy > 1 - 0.3 * cfg.speed && cycle >= 2) return 2;
  if (energy < cfg.idleBelow + 0.3 * cfg.speed && cycle <= 2) return 0.5;
  return 1;
}

export function planReactive(recipe: Recipe, drive?: AudioDrive): ReactivePlan {
  const cfg = recipe.reactive;
  if (!cfg) throw new Error("planReactive: the recipe has no reactive layer");
  const g = recipe.beatGrid, fps = recipe.fps;
  const bars = Math.ceil(recipe.durationBeats / g.beatsPerBar) + 1;
  const barEnergy: number[] = [], levels: BarLevel[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor(secondsAtBeat(g, b * g.beatsPerBar) * fps), to = Math.max(from + 1, Math.floor(secondsAtBeat(g, (b + 1) * g.beatsPerBar) * fps));
    let sum = 0;
    for (let n = from; n < to; n++) sum += energyAtFrame(drive, n);
    barEnergy.push(sum / (to - from));
    levels.push(barLevel(recipe, cfg, b, barEnergy[b]));
  }

  // Hits: downbeats and/or strong onsets, at least the gap apart, never in an idle bar,
  // and only where the whole accent (anticipation included) fits inside the recipe.
  const candidates: Omit<Hit, "key">[] = [];
  if (cfg.accentOn !== "onsets") for (let b = 0; b < recipe.durationBeats; b += g.beatsPerBar) candidates.push({ seconds: secondsAtBeat(g, b), beat: b, source: "downbeat" });
  if (cfg.accentOn !== "downbeats") for (const o of drive?.onsets ?? []) {
    if (o.strength < cfg.onsetThreshold) continue;
    const beat = beatAtSeconds(g, o.seconds);
    // An onset within a frame of a downbeat is that downbeat.
    if (candidates.some(c => c.source === "downbeat" && Math.abs(c.seconds - o.seconds) <= 1 / fps)) continue;
    candidates.push({ seconds: o.seconds, beat, source: "onset" });
  }
  candidates.sort((a, b) => a.seconds - b.seconds);
  const hits: Hit[] = [];
  if (cfg.accents.length) {
    let last = -Infinity, lastKey: AccentKey | null = null;
    for (const c of candidates) {
      if (c.beat - last < cfg.accentGapBeats) continue;
      const bar = Math.floor(c.beat / g.beatsPerBar);
      if (levels[bar] === 0) continue;
      let key = cfg.accents[hash32(cfg.seed, 7, hits.length) % cfg.accents.length];
      if (key === lastKey && cfg.accents.length > 1) key = cfg.accents[(cfg.accents.indexOf(key) + 1) % cfg.accents.length];
      const [lo, hi] = accentSpan(ACCENT_MOVES[key]);
      if (c.beat + lo < 0 || c.beat + hi > recipe.durationBeats) continue;
      hits.push({ ...c, key });
      last = c.beat;
      lastKey = key;
    }
  }
  const idle: Recipe = { ...recipe, moves: [makeMove("idle", 0, { id: "reactive-idle" })] };
  return { config: cfg, barEnergy, levels, hits, idle, drive };
}
