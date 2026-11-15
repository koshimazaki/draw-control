/**
 * Where the camera looks: the subject's floor position and heading at a beat. The
 * dancing character follows the recipe root path; the glider reports its smoothed heading
 * (glide-heading.ts), the one frameAt gives it, so a camera following behind or beside it
 * turns through a corner instead of stepping at each point of the path.
 */
import { rootAt } from "./root-travel";
import type { Recipe } from "./recipe";
import type { AudioDrive } from "./audio-drive";
import { frozenBeat } from "./freeze";
import { glideHeadingAt } from "./glide-heading";

export type Subject = { x: number; z: number; /** facing, radians (0 = +Z) */ heading: number };

export function subjectAt(recipe: Recipe, beat: number, drive?: AudioDrive): Subject {
  const p = rootAt(recipe, frozenBeat(recipe, beat), drive);
  const yaw = recipe.character.kind === "glider" ? glideHeadingAt(recipe, beat, drive) : p.yaw;
  return { x: p.x, z: p.z, heading: yaw * Math.PI / 180 };
}
