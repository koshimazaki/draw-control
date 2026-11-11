/**
 * Where the camera looks: the subject's floor position and heading at a beat. The
 * dancing character follows the recipe root path.
 */
import { rootAt } from "./root-travel";
import type { Recipe } from "./recipe";
import type { AudioDrive } from "./audio-drive";

export type Subject = { x: number; z: number; /** facing, radians (0 = +Z) */ heading: number };

export function subjectAt(recipe: Recipe, beat: number, drive?: AudioDrive): Subject {
  const p = rootAt(recipe, beat, drive);
  return { x: p.x, z: p.z, heading: p.yaw * Math.PI / 180 };
}
