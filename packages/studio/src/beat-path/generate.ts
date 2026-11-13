/**
 * The Generate data: the models offered, the price limit, the plain message for each of the
 * embed's error codes, the references (a character sheet and an environment image, kept per
 * example on the page, never in the recipe or the script), and the fallback prompt from the
 * shot description. What a model receives is only the guide video, the reference images and
 * the shot description: nothing from the script (coordinates, lock words, amounts).
 */
/** The models offered (the embed's model keys); names come from the embed's offeredModels() when it is installed. */
export const MODELS = [
  { id: "kling-4", label: "Kling 4.0" },
  { id: "seedance-2.5", label: "Seedance 2.5" },
  { id: "h3", label: "MiniMax H3" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

/** The most one generation may cost, USD: an estimate above it is refused before anything is sent. */
export const MAX_PRICE = 3;

/** A plain message for each of the embed's error codes. */
export const ERROR_MESSAGES: Record<string, string> = {
  "bad-bundle": "The guide bundle could not be read. Export it again and retry.",
  refused: "This model cannot take one of the inputs",
  "over-price": `The estimate is above the ${MAX_PRICE} USD limit, so nothing was sent.`,
  "no-estimate": "No price estimate came back, so nothing was sent.",
  "not-confirmed": "Cancelled: nothing was sent.",
  "invalid-key": "The Runware key was refused. Check it in the key panel.",
  timeout: "The model is taking long: the task is still running and may still finish (it was not sent twice).",
  aborted: "Stopped.",
  provider: "Runware reported a problem with this request",
};

export type References = { character?: Blob; environment?: Blob };

/** The prompt from the shot description (used until the embed is installed): subject, environment, action, legend. */
export function composePrompt(shot: { subject: string; environment: string; action: string }, legend: string): string {
  const parts = [shot.subject, shot.environment, shot.action].map(s => s.trim()).filter(Boolean);
  return `${parts.join(". ")}${parts.length ? ". " : ""}${legend}.`;
}
