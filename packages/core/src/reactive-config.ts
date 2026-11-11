/**
 * Config of the audio-reactive animation layer (`recipe.reactive`) and its validator.
 * Kept apart from the planner so the recipe validator imports no engine code.
 */
import { isAccentKey, type AccentKey } from "./accents";
import { fail, isObject, num, only } from "./validate";

export const ACCENT_TRIGGERS = ["downbeats", "onsets", "both"] as const;
export type AccentTrigger = (typeof ACCENT_TRIGGERS)[number];
export const MARKER_SOURCES = ["onset", "downbeat", "manual"] as const;
/**
 * A hit marker: a time where the character does something (an accent move, or a change
 * the generator should land). Markers are the editable form of the detected hits: when a
 * recipe carries them they replace detection, so a person or an agent can move, add or
 * delete hits and pick each accent. They are also the keyframe list a future in-between
 * generator (MotionBricks) fills motion between.
 */
export type HitMarker = {
  seconds: number; accent: AccentKey; source: (typeof MARKER_SOURCES)[number];
  /** Phase boundaries in beats from the hit (rigged clips): retimed phases, key frame at 0. */
  phases?: number[];
};
export type ReactiveConfig = {
  /** Whole number; the same seed gives the same performance. */
  seed: number;
  /** 0–1: how far energy changes the tempo of a move (0 = never). */
  speed: number;
  /** 0–1: how far energy scales amplitude. */
  amplitude: number;
  /** Accent moves to pick from on each hit (seeded); empty = no accents. */
  accents: AccentKey[];
  accentOn: AccentTrigger;
  /** Minimum beats between two accents. */
  accentGapBeats: number;
  /** Onsets weaker than this (0–1, relative to the strongest) are not hits. */
  onsetThreshold: number;
  /** Bars quieter than this (0–1 energy) settle to idle; 0 = never. */
  idleBelow: number;
  /** 0–1: overlapping action, follow-through and variation. */
  humanise: number;
  /** Edited hits; when present they replace onset and downbeat detection. */
  markers?: HitMarker[];
};

export const DEFAULT_REACTIVE: ReactiveConfig = {
  seed: 1, speed: 0.6, amplitude: 0.6, accents: ["hit", "point", "jump"], accentOn: "both",
  accentGapBeats: 2, onsetThreshold: 0.5, idleBelow: 0.12, humanise: 0.7,
};

export function validateReactive(input: unknown): ReactiveConfig {
  if (!isObject(input)) return fail("reactive must be an object");
  only(input, ["seed", "speed", "amplitude", "accents", "accentOn", "accentGapBeats", "onsetThreshold", "idleBelow", "humanise", "markers"], "reactive");
  if (!Number.isInteger(input.seed) || !num(input.seed, 0, 2147483647, "reactive.seed")) fail("reactive.seed must be a whole number 0–2147483647");
  if (!Array.isArray(input.accents) || input.accents.length > 8) fail("reactive.accents must be a list of up to 8 accent moves");
  for (const a of input.accents as unknown[]) if (!isAccentKey(a)) fail(`reactive.accents: ${String(a)} is not an accent move`);
  if (!ACCENT_TRIGGERS.includes(input.accentOn as AccentTrigger)) fail(`reactive.accentOn must be one of ${ACCENT_TRIGGERS.join(", ")}`);
  const out: ReactiveConfig = {
    seed: input.seed as number,
    speed: num(input.speed, 0, 1, "reactive.speed"),
    amplitude: num(input.amplitude, 0, 1, "reactive.amplitude"),
    accents: [...(input.accents as AccentKey[])],
    accentOn: input.accentOn as AccentTrigger,
    accentGapBeats: num(input.accentGapBeats, 0.5, 16, "reactive.accentGapBeats"),
    onsetThreshold: num(input.onsetThreshold, 0, 1, "reactive.onsetThreshold"),
    idleBelow: num(input.idleBelow, 0, 1, "reactive.idleBelow"),
    humanise: num(input.humanise, 0, 1, "reactive.humanise"),
  };
  if (input.markers !== undefined) {
    if (!Array.isArray(input.markers) || input.markers.length > 512) fail("reactive.markers must be a list of up to 512 markers");
    let last = -Infinity;
    out.markers = (input.markers as unknown[]).map((m, i) => {
      const where = `reactive.markers[${i}]`;
      if (!isObject(m)) return fail(`${where} must be an object`);
      only(m, ["seconds", "accent", "source", "phases"], where);
      const seconds = num(m.seconds, 0, 3600, `${where}.seconds`);
      if (seconds < last) fail(`${where}.seconds must not be before the marker before it`);
      last = seconds;
      if (!isAccentKey(m.accent)) fail(`${where}.accent is not an accent move`);
      if (!MARKER_SOURCES.includes(m.source as HitMarker["source"])) fail(`${where}.source must be one of ${MARKER_SOURCES.join(", ")}`);
      const marker: HitMarker = { seconds, accent: m.accent as AccentKey, source: m.source as HitMarker["source"] };
      if (m.phases !== undefined) {
        if (!Array.isArray(m.phases) || m.phases.length < 2 || m.phases.length > 16) fail(`${where}.phases needs 2–16 boundaries`);
        let prev = -Infinity;
        marker.phases = (m.phases as unknown[]).map((b, k) => {
          const v = num(b, -16, 16, `${where}.phases[${k}]`);
          if (v <= prev) fail(`${where}.phases must increase`);
          prev = v;
          return v;
        });
        if (!marker.phases.includes(0)) fail(`${where}.phases must keep the key frame at 0`);
      }
      return marker;
    });
  }
  return out;
}

