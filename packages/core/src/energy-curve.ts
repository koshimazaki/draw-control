/**
 * The recipe's hand-edited energy curve (`energyCurve`) as an audio drive: it replaces the
 * analysed loudness for tempo, amplitude, accents and the camera (docs/recipe.md); the onsets,
 * the low band and the drum bands stay the track's, so every lock still lands on its hits.
 * Its own module so the camera rig and the clip performance can both read it.
 */
import type { AudioDrive } from "./audio-drive";
import type { Recipe } from "./recipe";

/** The drive with the recipe's hand-edited energy curve, when it has one. */
export function effectiveDrive(recipe: Recipe, drive?: AudioDrive): AudioDrive | undefined {
  const curve = recipe.energyCurve;
  if (!curve) return drive;
  const fps = recipe.fps, frames = Math.max(drive?.energy.length ?? 0, Math.ceil(curve.values.length / curve.rate * fps) + 1);
  const energy = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const x = Math.min(curve.values.length - 1, n / fps * curve.rate), i = Math.floor(x), f = x - i;
    energy[n] = curve.values[i] + ((curve.values[Math.min(curve.values.length - 1, i + 1)]) - curve.values[i]) * f;
  }
  const out: AudioDrive = { fps, energy, onsets: drive?.onsets ?? [], source: drive?.source ?? "flat" };
  if (drive?.low) out.low = drive.low;
  // The curve replaces the loudness only: the drum hits (move and camera locks) stay the track's.
  if (drive?.bands) out.bands = drive.bands;
  return out;
}
