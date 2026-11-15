/**
 * The Generate data: the models offered, the price limit, the plain message for each of the
 * embed's error codes, the references (a character sheet and an environment image, kept per
 * example on the page, never in the recipe or the script), and the fallback prompt from the
 * shot description. What a model receives is only the guide video, the reference images and
 * the shot description: nothing from the script (coordinates, lock words, amounts).
 */
/**
 * The models offered (the embed's model keys); names come from the embed's offeredModels() when it is installed.
 * `seconds`: the whole-second lengths each takes (the embed's spec: duration and its guide-video cap).
 */
/**
 * `promptMax`: the longest prompt each takes, characters (Runware's schema; Seedance's own guide says 10,000, below
 * its schema's 50,000, so the guide's is used). `timed`: the time syntax its prompting guide documents (docs/models.md).
 */
export const MODELS = [
  { id: "kling-4", label: "Kling 4.0", seconds: { min: 3, max: 30 }, promptMax: 26_000, timed: "plain" },
  { id: "seedance-2.5", label: "Seedance 2.5", seconds: { min: 4, max: 30 }, promptMax: 10_000, timed: "brackets" },
  { id: "h3", label: "MiniMax H3", seconds: { min: 4, max: 15 }, promptMax: 7_000, timed: "plain" },
] as const;

/** A warning when the composed prompt is longer than `model` takes (shown in the cost dialog), else null. */
export function promptWarning(model: ModelId, prompt: string): string | null {
  const m = MODELS.find(x => x.id === model)!;
  return prompt.length > m.promptMax ? `The prompt is ${prompt.length} characters; ${m.label} takes up to ${m.promptMax}, so it may be refused or cut: shorten the shot fields.` : null;
}
export type ModelId = (typeof MODELS)[number]["id"];

/** Why `model` cannot take a clip of `clip` seconds (with the models that can), or null when it can. */
export function clipRefusal(model: ModelId, clip: number): string | null {
  const m = MODELS.find(x => x.id === model)!, { min, max } = m.seconds;
  if (clip >= min && clip <= max) return null;
  const others = MODELS.filter(x => x.id !== model && clip >= x.seconds.min && clip <= x.seconds.max).map(x => x.label);
  return `${m.label} takes ${min} to ${max} s; this clip is ${clip} s. Set the clip to ${clip > max ? max : min} s in Settings${others.length ? `, or pick ${others.join(" or ")}` : ""}.`;
}

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
  aborted: "Stopped. Nothing was submitted.",
  provider: "Runware reported a problem with this request",
};

/** What the embed throws (its GenerateError): a code, its own message, and the task id once the task was submitted. */
export type RunError = { code?: string; message: string; taskUUID?: string };

/**
 * The words for a failed or stopped run. Once a task was submitted (the error carries its id) a
 * Stop or a timeout does not end it on Runware's side: it may still finish and be billed, and it
 * shows up in Runs when it does, so the reader is told so and not to send it again.
 * `plain` overrides the message for a code (the image panel's own price-limit wording).
 */
export function runErrorText(err: RunError, plain: Partial<Record<string, string>> = {}): string {
  const id = err.taskUUID ? String(err.taskUUID) : "";
  const submitted = id ? ` It was already submitted (task ${id.slice(0, 8)}), so it may still finish and be billed; it will appear in Runs. Do not generate again unless you want a second run.` : "";
  if (err.code === "aborted") return id ? `Stopped watching.${submitted}` : "Stopped. Nothing was submitted.";
  if (err.code === "timeout") return id ? `The model is taking long.${submitted}` : ERROR_MESSAGES.timeout;
  const text = err.code ? plain[err.code] ?? ERROR_MESSAGES[err.code] ?? err.message : err.message;
  return err.code === "refused" || err.code === "provider" ? `${text}: ${err.message}` : text;
}

export type References = { character?: Blob; environment?: Blob };

/** The prompt from the shot description (used until the embed is installed): subject, environment, action, legend. */
export function composePrompt(shot: { subject: string; environment: string; action: string }, legend: string): string {
  const parts = [shot.subject, shot.environment, shot.action].map(s => s.trim()).filter(Boolean);
  return `${parts.join(". ")}${parts.length ? ". " : ""}${legend}.`;
}
