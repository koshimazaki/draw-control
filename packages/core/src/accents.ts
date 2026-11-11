/**
 * Accent moves: short gestures fired on a hit (an onset or a downbeat). Each is a few
 * keyed poses at beat offsets from the hit, with the key at offset 0 reached exactly on
 * the hit, a fade in before and a fade out after, and optional root motion (a ballistic
 * jump that lands on the hit, or a spin that completes on it).
 *
 * The set is data, so other sets (a ninja combo, skateboard tricks) are just more entries.
 */
import { POSES, mixPoses, type Pose, type PoseName } from "./poses";

export type AccentEase = "inOut" | "in" | "out";
export type AccentMove = {
  name: string;
  /** Poses at beat offsets from the hit, increasing; one key sits at 0 (the hit). */
  keys: { at: number; pose: PoseName; ease?: AccentEase }[];
  /** Beat offsets where the overlay weight rises from 0 to 1, and falls from 1 to 0. */
  fadeIn: [number, number];
  fadeOut: [number, number];
  /** Ballistic jump: airborne from `from` beats before the hit, landing on it. */
  jump?: { from: number; height: number };
  /** Turns around the vertical axis, between `from` and the hit. */
  spin?: { from: number; turns: number };
};

export const ACCENT_MOVES = {
  hit: { name: "Hit", keys: [{ at: -0.5, pose: "ready" }, { at: 0, pose: "hitPose", ease: "in" }], fadeIn: [-0.7, -0.4], fadeOut: [0.35, 0.95] },
  point: { name: "Point", keys: [{ at: -0.5, pose: "pointDownLeft" }, { at: 0, pose: "pointUpRight", ease: "in" }], fadeIn: [-0.7, -0.4], fadeOut: [0.35, 0.95] },
  strike: { name: "Strike", keys: [{ at: -0.45, pose: "strikeChamber" }, { at: 0, pose: "strikeHit", ease: "in" }], fadeIn: [-0.75, -0.45], fadeOut: [0.3, 0.9] },
  kick: { name: "Kick", keys: [{ at: -0.45, pose: "crouch" }, { at: 0, pose: "kickRight", ease: "in" }], fadeIn: [-0.75, -0.45], fadeOut: [0.25, 0.85] },
  jump: {
    name: "Jump",
    keys: [{ at: -1.15, pose: "crouch" }, { at: -0.9, pose: "crouch" }, { at: -0.45, pose: "jumpTuck" }, { at: 0, pose: "jumpLand", ease: "in" }],
    fadeIn: [-1.4, -1.1], fadeOut: [0.35, 1.0], jump: { from: -0.9, height: 0.28 },
  },
  spin: {
    name: "Spin",
    keys: [{ at: -0.8, pose: "ready" }, { at: -0.4, pose: "spinTuck" }, { at: 0, pose: "hitPose", ease: "out" }],
    fadeIn: [-1.0, -0.75], fadeOut: [0.3, 0.9], spin: { from: -0.8, turns: 1 },
  },
} satisfies Record<string, AccentMove>;
/** Accents that exist only as clips of the rigged mannequin (clip-library.ts). */
export const CLIP_ONLY_ACCENTS = ["jab", "cross", "sword", "roll"] as const;
export type ProceduralAccentKey = keyof typeof ACCENT_MOVES;
export type AccentKey = ProceduralAccentKey | (typeof CLIP_ONLY_ACCENTS)[number];
export const ACCENT_KEYS = [...Object.keys(ACCENT_MOVES), ...CLIP_ONLY_ACCENTS] as AccentKey[];
export const isAccentKey = (x: unknown): x is AccentKey => typeof x === "string" && (ACCENT_KEYS as string[]).includes(x);
/** The procedural accent for a key, if the procedural figures have one. */
export const proceduralAccent = (key: AccentKey): AccentMove | undefined => (ACCENT_MOVES as Record<string, AccentMove>)[key];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const EASES: Record<AccentEase, (t: number) => number> = {
  inOut: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
  in: t => 1 - Math.cos(Math.PI * t / 2),
  out: t => Math.sin(Math.PI * t / 2),
};
const smooth = (t: number) => EASES.inOut(clamp01(t));
/** Earliest and latest beat offsets an accent touches. */
export const accentSpan = (a: AccentMove): [number, number] => [Math.min(a.fadeIn[0], a.keys[0].at, a.jump?.from ?? 0, a.spin?.from ?? 0), a.fadeOut[1]];

export type AccentSample = { pose: Pose; weight: number; lift: number; spinRadians: number };

/** The accent at `u` beats from its hit (negative before it). Null outside its span. */
export function evaluateAccent(a: AccentMove, u: number): AccentSample | null {
  const [lo, hi] = accentSpan(a);
  if (u <= lo || u >= hi) return null;
  const weight = u < a.fadeIn[1] ? smooth((u - a.fadeIn[0]) / (a.fadeIn[1] - a.fadeIn[0]))
    : u > a.fadeOut[0] ? 1 - smooth((u - a.fadeOut[0]) / (a.fadeOut[1] - a.fadeOut[0])) : 1;
  const keys = a.keys;
  let pose: Pose = POSES[keys[keys.length - 1].pose];
  if (u <= keys[0].at) pose = POSES[keys[0].pose];
  else for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i].at) {
      const t = clamp01((u - keys[i - 1].at) / (keys[i].at - keys[i - 1].at));
      pose = mixPoses(POSES[keys[i - 1].pose], POSES[keys[i].pose], EASES[keys[i].ease ?? "inOut"](t));
      break;
    }
  }
  let lift = 0;
  if (a.jump && u > a.jump.from && u < 0) { const p = (u - a.jump.from) / -a.jump.from; lift = 4 * a.jump.height * p * (1 - p); }
  let spinRadians = 0;
  if (a.spin && u > a.spin.from) spinRadians = 2 * Math.PI * a.spin.turns * smooth((u - a.spin.from) / -a.spin.from);
  if (a.spin && u >= 0) spinRadians = 2 * Math.PI * a.spin.turns;
  return { pose, weight, lift, spinRadians };
}
