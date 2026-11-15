/**
 * The Draw Control page's state to a recipe: the core's `beatPathBase` (grid, clip length,
 * glider, camera rig) with the page's shot script applied through `applyScript`, the same
 * command the CLI (`new --character glider --clip 8`, then `script`) and the MCP server
 * (`new_recipe`, then `apply_script`) run. An agent that writes the script gets the page's
 * recipe without the page.
 */
import { applyMotionCommand, beatPathBase, validateRecipe, type CommandContext, type Recipe } from "@motion-studio/core";
import { resolveExportRange } from "@motion-studio/core/internal";
import { toScript, type BeatPathState } from "./script";

export type TrackInfo = { name: string; licence: string; bpm: number; offsetSeconds: number; lengthSeconds: number };

export const baseFor = (clip: number, track: TrackInfo | null) =>
  beatPathBase({ seconds: clip, ...(track ? { bpm: track.bpm, offsetSeconds: track.offsetSeconds, audio: { name: track.name, licence: track.licence } } : {}) });

/** The page's recipe: its shot script applied to the base. `ctx` carries the analysed onsets. */
export function beatPathRecipe(state: BeatPathState, track: TrackInfo | null, ctx: CommandContext = {}): Recipe {
  // A hop or camera start with no hit of its band in its row starts on the row (applyScript), as in the CLI and MCP.
  let r = applyMotionCommand(baseFor(state.clip, track), { type: "applyScript", script: toScript(state) }, ctx);
  // Without a glide block the figure stands at the start of its path.
  if (!state.character.some(b => b.word === "glide") && state.subject.length) {
    const p = state.subject[0];
    r = validateRecipe({ ...r, rootPath: [{ beat: 0, x: p.x, z: p.z, yaw: 0, ...(p.y ? { y: p.y } : {}) }] });
  }
  return r;
}

/** The exported range: the clip from beat 0, 121 frames for 5 s, 193 for 8 s, 721 for 30 s. */
export const exportRange = (recipe: Recipe, clip: number) => resolveExportRange(recipe, { unit: "beats", start: 0, length: clip * recipe.beatGrid.bpm / 60 });
