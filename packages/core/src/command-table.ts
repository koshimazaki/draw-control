/**
 * The command table behind `applyMotionCommand` (commands.ts): every edit the studio makes,
 * by name, with its help line and its argument checks. The UI calls these through the same
 * entry point as the CLI and the MCP server, so anything a person does on the timeline an
 * agent can do from a script.
 */
import { isAccentKey, type AccentKey } from "./accents";
import { setAnticipation, setImpact } from "./accent-feel";
import type { CommandContext } from "./commands";
import { deleteMove, deletePhase, deleteStep, restorePhase, type GapMode } from "./delete-edits";
import { moveMoveTo, placeOnEvery, resizeMove, setMoveFields, snapMoveTo } from "./move-edits";
import { STEP_DIVISIONS, type StepDivision } from "./performance-config";
import {
  addMarker, clearEnergyCurve, clearSteps, moveMarker, paintEnergy, removeMarker, retimePhase, setMarkerAccent, setMoveAtBeat, setMoveBlend, setStepAmplitude,
} from "./performance-edits";
import { RecipeError, validateRecipe, type Recipe } from "./recipe";
import {
  ENVELOPE_SOURCES, clearEnvelope, drawEnvelope, envelopeFromAudio, paintEnvelope, removeEnvelopePoint, setEnvelopePoint, setEnvelopePoints, type EnvelopePoint, type EnvelopeSource,
} from "./envelope";

type Args = Record<string, unknown>;
export type TableCommand = { help: string; run: (r: Recipe, a: Args, ctx: CommandContext) => Recipe };

const bad = (key: string, what: string): never => { throw new RecipeError(`${key} must be ${what}`); };
const num = (a: Args, k: string) => (typeof a[k] === "number" && Number.isFinite(a[k]) ? a[k] as number : bad(k, "a number"));
const optNum = (a: Args, k: string) => (a[k] === undefined ? undefined : num(a, k));
const int = (a: Args, k: string) => (Number.isInteger(a[k]) ? a[k] as number : bad(k, "a whole number"));
const str = (a: Args, k: string) => (typeof a[k] === "string" && (a[k] as string).length <= 120 ? a[k] as string : bad(k, "text"));
const accent = (a: Args, k: string): AccentKey => (isAccentKey(a[k]) ? a[k] as AccentKey : bad(k, "an accent move (hit, point, strike, kick, jump, spin, …)"));
const gap = (a: Args): GapMode => (a.mode === undefined || a.mode === "close" ? "close" : a.mode === "hold" ? "hold" : bad("mode", "close or hold"));
const division = (a: Args): StepDivision => (STEP_DIVISIONS.includes(a.division as StepDivision) ? a.division as StepDivision : bad("division", "4, 8 or 16"));
const edge = (a: Args) => (a.edge === "start" || a.edge === "end" ? a.edge : bad("edge", "start or end"));

export const COMMAND_TABLE: Record<string, TableCommand> = {
  // Blocks on the move track.
  moveMoveTo: { help: "{ moveId, toBeat } move a block, keeping its length and speed", run: (r, a) => moveMoveTo(r, { moveId: str(a, "moveId"), toBeat: num(a, "toBeat") }) },
  resizeMove: { help: "{ moveId, edge: start|end, toBeat } drag an edge; longer plays slower, shorter faster", run: (r, a) => resizeMove(r, { moveId: str(a, "moveId"), edge: edge(a), toBeat: num(a, "toBeat") }) },
  setMoveFields: { help: "{ moveId, start?, length?, speed?, amplitude? } the selected block's fields", run: (r, a) => setMoveFields(r, { moveId: str(a, "moveId"), start: optNum(a, "start"), length: optNum(a, "length"), speed: optNum(a, "speed"), amplitude: optNum(a, "amplitude") }) },
  snapMoveTo: { help: "{ moveId, target: kick|snare|hat, index? } start a move on the nearest (or the index-th) kick or snare", run: (r, a, c) => snapMoveTo(r, { moveId: str(a, "moveId"), target: str(a, "target"), index: a.index === undefined ? undefined : int(a, "index") }, c.bands ?? c.drive?.bands) },
  placeOnEvery: {
    help: "{ move, target: kick|snare|hat, every?, offset?, fromBeat?, toBeat?, lengthBeats?, replace? } put a move (or an accent such as jump) on every Nth kick or snare",
    run: (r, a, c) => placeOnEvery(r, { move: str(a, "move"), target: str(a, "target"), every: a.every === undefined ? undefined : int(a, "every"), offset: a.offset === undefined ? undefined : int(a, "offset"),
      fromBeat: optNum(a, "fromBeat"), toBeat: optNum(a, "toBeat"), lengthBeats: optNum(a, "lengthBeats"), replace: a.replace === true }, c.bands ?? c.drive?.bands),
  },
  setMoveAtBeat: { help: "{ beat, clip|null } paint a rigged clip on a beat (null erases)", run: (r, a) => setMoveAtBeat(r, num(a, "beat"), a.clip === null ? null : str(a, "clip")) },
  setMoveBlend: { help: "{ moveId, frames } crossfade into a move, 6–24 frames", run: (r, a) => setMoveBlend(r, { moveId: str(a, "moveId"), frames: num(a, "frames") }) },
  deleteMove: { help: "{ moveId, mode?: close|hold } delete a move; close moves later ones earlier", run: (r, a) => deleteMove(r, { moveId: str(a, "moveId"), mode: gap(a) }) },
  // Amplitude per step and the energy curve.
  setStepAmplitude: { help: "{ division: 4|8|16, index, value } amplitude of one step, 0–1.5", run: (r, a, c) => setStepAmplitude(r, { division: division(a), index: int(a, "index"), value: num(a, "value"), drive: c.drive }) },
  clearSteps: { help: "{} back to amplitude from energy", run: r => clearSteps(r) },
  deleteStep: { help: "{ division, index, mode?: close|hold } delete a step", run: (r, a, c) => deleteStep(r, c.drive, { division: division(a), index: int(a, "index"), mode: gap(a) }) },
  paintEnergy: { help: "{ fromSeconds, toSeconds, from, to } draw the energy curve linearly between two times, 0–1", run: (r, a, c) => paintEnergy(r, c.drive, num(a, "fromSeconds"), num(a, "toSeconds"), num(a, "from"), num(a, "to")) },
  clearEnergyCurve: { help: "{} back to the analysed energy", run: r => clearEnergyCurve(r) },
  // The amplitude envelope (one value per frame, 0–3, scaling every move).
  paintEnvelope: { help: "{ fromFrame, toFrame, from, to } draw a straight segment of the amplitude envelope, values 0–3", run: (r, a) => validateRecipe(paintEnvelope(r, { fromFrame: num(a, "fromFrame"), toFrame: num(a, "toFrame"), from: num(a, "from"), to: num(a, "to") })) },
  drawEnvelope: { help: "{ startFrame, values: [..] } a freehand stroke, one value per frame (simplified to breakpoints)", run: (r, a) => validateRecipe(drawEnvelope(r, { startFrame: num(a, "startFrame"), values: a.values as number[] })) },
  setEnvelopePoints: { help: "{ points: [[frame, value], ..] } replace the envelope's breakpoints", run: (r, a) => validateRecipe(setEnvelopePoints(r, { points: Array.isArray(a.points) ? a.points as EnvelopePoint[] : bad("points", "a list of [frame, value]") })) },
  setEnvelopePoint: { help: "{ index?, frame, value } move a breakpoint (no index: add one)", run: (r, a) => validateRecipe(setEnvelopePoint(r, { index: a.index === undefined ? undefined : int(a, "index"), frame: num(a, "frame"), value: num(a, "value") })) },
  removeEnvelopePoint: { help: "{ index } remove a breakpoint", run: (r, a) => validateRecipe(removeEnvelopePoint(r, { index: int(a, "index") })) },
  envelopeFromAudio: {
    help: `{ source: ${ENVELOPE_SOURCES.join("|")}, min?, max?, decayBeats? } start the envelope from the loudness or from a band's onsets`,
    run: (r, a, c) => validateRecipe(envelopeFromAudio(r, { source: str(a, "source") as EnvelopeSource, min: optNum(a, "min"), max: optNum(a, "max"), decayBeats: optNum(a, "decayBeats") }, { drive: c.drive, bands: c.bands })),
  },
  clearEnvelope: { help: "{} remove the envelope (every frame at 1)", run: r => validateRecipe(clearEnvelope(r)) },
  // Hit markers (accents on the music).
  addMarker: { help: "{ seconds, accent } add a hit marker", run: (r, a, c) => addMarker(r, c.drive, num(a, "seconds"), accent(a, "accent")) },
  removeMarker: { help: "{ index } remove a hit marker", run: (r, a, c) => removeMarker(r, c.drive, int(a, "index")) },
  moveMarker: { help: "{ index, seconds } move a hit marker", run: (r, a, c) => moveMarker(r, c.drive, int(a, "index"), num(a, "seconds")) },
  setMarkerAccent: { help: "{ index, accent } pick a marker's accent move", run: (r, a, c) => setMarkerAccent(r, c.drive, int(a, "index"), accent(a, "accent")) },
  retimePhase: { help: "{ index, boundary, beatsFromHit } retime one phase boundary of a marker's accent", run: (r, a, c) => retimePhase(r, c.drive, int(a, "index"), int(a, "boundary"), num(a, "beatsFromHit")) },
  setImpact: { help: "{ index, value } hit harder, 0–1", run: (r, a, c) => setImpact(r, c.drive, int(a, "index"), num(a, "value")) },
  setAnticipation: { help: "{ index, beats } wind-up length of a marker's accent", run: (r, a, c) => setAnticipation(r, c.drive, int(a, "index"), num(a, "beats")) },
  deletePhase: { help: "{ marker, phase, mode?: close|hold } delete one phase of an accent", run: (r, a, c) => deletePhase(r, c.drive, { marker: int(a, "marker"), phase: int(a, "phase"), mode: gap(a) }) },
  restorePhase: { help: "{ marker, phase } bring a deleted phase back", run: (r, a, c) => restorePhase(r, c.drive, { marker: int(a, "marker"), phase: int(a, "phase") }) },
};

/** Register more commands (envelope, camera, path) from their own modules. */
export function registerCommands(more: Record<string, TableCommand>) { Object.assign(COMMAND_TABLE, more); }

export function runTableCommand(recipe: Recipe, type: string, args: Args, ctx: CommandContext): Recipe {
  return COMMAND_TABLE[type].run(recipe, args, ctx);
}
