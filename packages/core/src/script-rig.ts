/**
 * The shot script's `rig:` settings line: the camera rig's start framing, `rig: distance 8m
 * height 5m fov 30 yaw 45` (every field optional, any order, `m` optional).
 * Frame 0 is the rig start. Each block starts where the block before it ended: a follow offset
 * (distance, height; it wins over a shot preset), a shot preset, a fov and the end of a
 * programmed dolly, push, pull or rise carry on into every later block until another block
 * changes them; a block that sets none of them keeps what it started with. The camera word top
 * (or above) is the exception: it lifts the camera overhead from those values without changing
 * them, so the block after it comes back to the distance and height from before it (a fov set
 * on it carries on). Pinned by test/camera-carry.test.ts. A script without the line leaves the rig
 * as it was. `printScript` prints the line only where the rig differs from its base (the Draw
 * Control base for the glider, the default camera otherwise): scripts at the base rig print
 * unchanged, a rig set earlier (startYaw -20 in examples/recipes/C.json) now prints as a rig line.
 */
import { BEAT_PATH_RIG } from "./beat-path";
import { DEFAULT_CAMERA, RIG_LIMITS } from "./camera";
import { RecipeError, type Recipe } from "./recipe";

/** The rig's start framing as a script sets it: camera.distance, height, fov, startYaw. */
export type ScriptRig = { distance?: number; height?: number; fov?: number; startYaw?: number };
/** Script word → camera field. */
const WORDS = { distance: "distance", height: "height", fov: "fov", yaw: "startYaw" } as const;
const UNITS = { distance: "m", height: "m", fov: "°", startYaw: "°" } as const;
const HELP = `rig reads "rig: distance 8m height 5m fov 30 yaw 45" (any of the four, in any order: distance ${RIG_LIMITS.distance.join("–")} m, height ${RIG_LIMITS.height.join("–")} m, fov ${RIG_LIMITS.fov.join("–")}°, yaw ${RIG_LIMITS.startYaw.join(" to ")}°)`;

/** Read the words after `rig:` (`line` is the script's 1-based line, for the message). */
export function parseRig(words: string, line: number): ScriptRig {
  const bad = (why?: string): never => { throw new RecipeError(`script line ${line}: ${why ? `${why}; ` : ""}${HELP}`); };
  const list = words.trim().split(/[\s,]+/).filter(Boolean);
  if (!list.length || list.length % 2) bad();
  const out: ScriptRig = {};
  for (let i = 0; i < list.length; i += 2) {
    const word = list[i].toLowerCase();
    if (!Object.hasOwn(WORDS, word)) bad(`${JSON.stringify(list[i])} is not a rig field`);
    const key = WORDS[word as keyof typeof WORDS];
    if (out[key] !== undefined) bad(`${word} is given twice`);
    const unit = key === "distance" || key === "height" ? /m$/i : /(°|deg)$/i;
    const value = list[i + 1].replace(unit, "");
    const v = value ? Number(value) : NaN;   // a bare unit ("yaw deg") is not 0
    const [lo, hi] = RIG_LIMITS[key];
    if (!Number.isFinite(v)) bad(`${word} must be a number (got ${JSON.stringify(list[i + 1])})`);
    if (v < lo || v > hi) bad(`${word} ${v} is outside ${lo} to ${hi}`);
    out[key] = v;
  }
  return out;
}

/** The rig a recipe is compared with when printing: the Draw Control base for the glider, the default camera otherwise. */
export const rigBase = (r: Recipe): Required<ScriptRig> => (r.character?.kind === "glider" ? BEAT_PATH_RIG : DEFAULT_CAMERA);

const fmt = (x: number) => String(Math.round(x * 1000) / 1000);

/** The `rig:` line for a recipe ("" when its rig is the base's, or it has no camera): only the fields that differ. */
export function rigLine(r: Recipe): string {
  if (!r.camera) return "";
  const base = rigBase(r), c = r.camera;
  const parts = (Object.entries(WORDS) as [keyof typeof WORDS, keyof ScriptRig][])
    .filter(([, k]) => Math.abs(c[k] - base[k]) > 1e-9)
    .map(([w, k]) => `${w} ${fmt(c[k])}${UNITS[k] === "m" ? "m" : ""}`);
  return parts.length ? `rig: ${parts.join(" ")}\n` : "";
}
