/**
 * The programmed part of the camera rig, per frame: shot presets, moves with an amount, and
 * beat locks on camera ranges. `planCamera` (camera-rig.ts) layers the energy-driven motion
 * and the beat accents on top of these channels.
 *
 * Rules, range by range in order (a gap holds the values the range before it ended on; the
 * first range starts from the rig numbers):
 * - a `shot` sets distance, height and fov to its preset, eased in over the first beat of the
 *   range (or half the range, if shorter); `cut` switches on the range's first frame instead;
 *   a range without a shot keeps the values it started with, so nothing jumps;
 * - an amount moves from there, eased in and out over the whole range, the same for every
 *   track and every frame rate: pushIn/pullOut `amount` metres closer or further (or `to` an
 *   end distance), rise `amount` metres up or down (or `from`/`to` heights), orbit `amount`
 *   degrees, truck `amount` metres sideways. A programmed move ignores the energy, so an
 *   orbit of 360 over 4 beats ends exactly 360° on;
 * - a lock re-times the programmed move so it arrives at evenly spaced stations on each
 *   locked hit with a short hold (`onHit: hold`, the default; an energy-driven move is gated
 *   to a near stop instead), or adds a punch-in of `punch` metres on each hit (`onHit: punch`).
 *   The range still ends on its exact amount.
 */
import type { BandAnalysis } from "./audio-bands";
import { beatAtSeconds } from "./beats";
import { DEFAULT_PUNCH, SHOT_PRESETS, type CameraConfig, type CameraSegment } from "./camera";
import { DEFAULT_LOCK_STRENGTH, holdGate, lockHits, punchPulse, stationProgress } from "./lock";
import type { BeatGrid } from "./recipe";

export type ProgrammedCamera = {
  /** Base distance, height (metres) and fov (degrees) before the energy-driven motion. */
  distance: Float64Array; height: Float64Array; fov: Float64Array;
  /** Aim height, metres (1 without shots; a close shot aims at the chest). */
  aim: Float64Array;
  /** Programmed orbit (radians) and truck (metres, + right) since frame 0. */
  orbit: Float64Array; truck: Float64Array;
  /** Punch-in on locked hits, metres closer. */
  punch: Float64Array;
  /** 0–1: how much a locked hold stops the energy-driven rates. */
  gate: Float64Array;
  /** 1 where a programmed move owns the channel (energy drive and beat accents stay off it). */
  owns: { orbit: Uint8Array; dolly: Uint8Array; crane: Uint8Array };
  /** Locked hits per range, in beats (the stations; drawn on the paths). */
  hits: number[][];
};

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
const DEG = Math.PI / 180;

const isDolly = (s: CameraSegment) => (s.modes.includes("pushIn") || s.modes.includes("pullOut")) && (s.amount !== undefined || s.to !== undefined);
const isCrane = (s: CameraSegment) => s.modes.includes("rise") && (s.amount !== undefined || s.to !== undefined || s.from !== undefined);
const isOrbit = (s: CameraSegment) => s.modes.includes("orbit") && s.amount !== undefined;
const isTruck = (s: CameraSegment) => s.modes.includes("truck") && s.amount !== undefined;

type Values = { d: number; h: number; f: number; a: number; orbit: number; truck: number };

/** The progress 0–1 of a programmed move through its range (eased, re-timed by a lock). */
function progressOf(s: CameraSegment, hits: number[], beat: number): number {
  const u = (beat - s.fromBeat) / (s.toBeat - s.fromBeat);
  // Pace: fast arrives early (on the first locked hit when it falls in the block's first part), slow late.
  if (s.pace === "fast") {
    const first = s.lock && hits.length ? (hits[0] - s.fromBeat) / (s.toBeat - s.fromBeat) : 0;
    return ease(u / (first >= 0.15 && first <= 0.7 ? first : 0.45));
  }
  if (s.pace === "slow") return ease(Math.pow(Math.max(0, u), 1.6));
  const base = ease(u);
  if (!s.lock || s.onHit === "punch" || !hits.length) return base;
  const k = s.strength ?? DEFAULT_LOCK_STRENGTH;
  return base + (stationProgress(beat, s.fromBeat, s.toBeat, hits, 1) - base) * k;
}

/** The programmed values inside range `s` at `beat`, starting from `v`. */
function valuesIn(s: CameraSegment, v: Values, hits: number[], beat: number): Values {
  const len = s.toBeat - s.fromBeat, t = s.pace === "fast" ? Math.min(0.5, len / 3) : s.pace === "slow" ? Math.min(2.5, len * 0.8) : Math.min(1, len / 2);
  const w = s.cut ? 1 : ease((beat - s.fromBeat) / t);
  const preset = s.shot ? SHOT_PRESETS[s.shot] : null;
  const p = progressOf(s, hits, beat);
  // A follow offset sets the distance and height the way a shot does (and wins over the shot's).
  const td = s.follow?.distance ?? preset?.distance, th = s.follow?.height ?? preset?.height;
  let d = td !== undefined ? v.d + (td - v.d) * w : v.d;
  let h = th !== undefined ? v.h + (th - v.h) * w : v.h;
  const tf = s.fov ?? preset?.fov;
  const f = tf !== undefined ? v.f + (tf - v.f) * w : v.f;
  const a = preset ? v.a + (preset.aim - v.a) * w : v.a;
  if (isDolly(s)) {
    if (s.to !== undefined) d = v.d + (s.to - v.d) * p;
    else d += (s.modes.includes("pushIn") ? -1 : 1) * s.amount! * p;
  }
  if (isCrane(s)) {
    if (s.from !== undefined) {
      const path = s.from + ((s.to ?? s.from) - s.from) * p;
      h = s.cut ? path : v.h + (path - v.h) * w;
    } else if (s.to !== undefined) h = v.h + (s.to - v.h) * p;
    else h += s.amount! * p;
  }
  return {
    d: Math.max(0.3, d), h: Math.max(0.05, h), f, a,
    orbit: v.orbit + (isOrbit(s) ? s.amount! * DEG * p : 0),
    truck: v.truck + (isTruck(s) ? s.amount! * p : 0),
  };
}

export function programCamera(config: CameraConfig, grid: BeatGrid, bands: BandAnalysis | undefined, total: number, fps: number): ProgrammedCamera {
  const arr = () => new Float64Array(total), bytes = () => new Uint8Array(total);
  const out: ProgrammedCamera = {
    distance: arr(), height: arr(), fov: arr(), aim: arr(), orbit: arr(), truck: arr(), punch: arr(), gate: arr(),
    owns: { orbit: bytes(), dolly: bytes(), crane: bytes() }, hits: [],
  };
  const segs = config.segments;
  out.hits = segs.map(s => (s.lock ? lockHits(grid, bands, s.lock, s.fromBeat, s.toBeat) : []));
  // Values at the start of each range, carried from the end of the one before.
  const starts: Values[] = [];
  let v: Values = { d: config.distance, h: config.height, f: config.fov, a: 1, orbit: 0, truck: 0 };
  segs.forEach((s, i) => { starts.push(v); v = valuesIn(s, v, out.hits[i], s.toBeat); });
  for (let n = 0; n < total; n++) {
    const beat = beatAtSeconds(grid, n / fps);
    let i = -1;
    for (let k = 0; k < segs.length && segs[k].fromBeat <= beat; k++) i = k;
    const s = segs[i];
    let val: Values;
    if (!s) val = starts[0] ?? v;
    else if (beat < s.toBeat) val = valuesIn(s, starts[i], out.hits[i], beat);
    else val = i + 1 < starts.length ? starts[i + 1] : v;
    out.distance[n] = val.d; out.height[n] = val.h; out.fov[n] = val.f; out.aim[n] = val.a; out.orbit[n] = val.orbit; out.truck[n] = val.truck;
    // Ownership includes the range's end frame, so an accent on the last beat cannot nudge the end value.
    for (let k = 0; k < segs.length; k++) {
      const q = segs[k];
      if (beat < q.fromBeat - 1e-9 || beat > q.toBeat + 1e-9) continue;
      if (isOrbit(q)) out.owns.orbit[n] = 1;
      if (isDolly(q)) out.owns.dolly[n] = 1;
      if (isCrane(q)) out.owns.crane[n] = 1;
    }
    if (s && beat < s.toBeat && s.lock) {
      const k = s.strength ?? DEFAULT_LOCK_STRENGTH, hits = out.hits[i];
      if (s.onHit === "punch") out.punch[n] = (s.punch ?? DEFAULT_PUNCH) * k * punchPulse(beat, hits);
      else out.gate[n] = holdGate(beat, hits, k);
    }
  }
  return out;
}
