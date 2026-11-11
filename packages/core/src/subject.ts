/**
 * Where the camera looks: the subject's floor position and heading at a beat. The
 * dancing character follows the recipe root path.
 */
import { sampleRootPath } from "./engine";
import type { Recipe } from "./recipe";

export type Subject = { x: number; z: number; /** facing, radians (0 = +Z) */ heading: number };

export function subjectAt(recipe: Recipe, beat: number): Subject {
  const p = sampleRootPath(recipe.rootPath, beat);
  return { x: p.x, z: p.z, heading: p.yaw * Math.PI / 180 };
}
