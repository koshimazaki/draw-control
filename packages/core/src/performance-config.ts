/**
 * Recipe fields that shape a clip performance on the audio clock:
 * - `steps`: an amplitude-per-step lane (a step-sequencer automation lane), one value per
 *   1/4, 1/8 or 1/16 note, setting how big the move is on that step;
 * - `energyCurve`: a hand-edited energy curve that replaces the analysed one for speed,
 *   amplitude and the camera.
 */
import { fail, isObject, num, only } from "./validate";

export const STEP_DIVISIONS = [4, 8, 16] as const;
export type StepDivision = (typeof STEP_DIVISIONS)[number];
export type StepLane = { division: StepDivision; amplitude: number[] };
export type EnergyCurve = { /** values per second */ rate: number; values: number[] };
export const STEP_AMPLITUDE_MAX = 1.5;

export function validateSteps(input: unknown, durationBeats: number): StepLane {
  if (!isObject(input)) return fail("steps must be an object");
  only(input, ["division", "amplitude"], "steps");
  if (!STEP_DIVISIONS.includes(input.division as StepDivision)) fail(`steps.division must be one of ${STEP_DIVISIONS.join(", ")}`);
  const division = input.division as StepDivision;
  const count = Math.ceil(durationBeats * division / 4);
  if (!Array.isArray(input.amplitude) || input.amplitude.length !== count) fail(`steps.amplitude needs ${count} values (one per step)`);
  return { division, amplitude: (input.amplitude as unknown[]).map((v, i) => num(v, 0, STEP_AMPLITUDE_MAX, `steps.amplitude[${i}]`)) };
}

export function validateEnergyCurve(input: unknown): EnergyCurve {
  if (!isObject(input)) return fail("energyCurve must be an object");
  only(input, ["rate", "values"], "energyCurve");
  const rate = num(input.rate, 1, 60, "energyCurve.rate");
  if (!Array.isArray(input.values) || input.values.length < 2 || input.values.length > 60 * 600) fail("energyCurve.values needs 2 or more values (up to ten minutes)");
  return { rate, values: (input.values as unknown[]).map((v, i) => num(v, 0, 1, `energyCurve.values[${i}]`)) };
}

/** Steps in a recipe for a division. */
export const stepCount = (durationBeats: number, division: StepDivision) => Math.ceil(durationBeats * division / 4);
