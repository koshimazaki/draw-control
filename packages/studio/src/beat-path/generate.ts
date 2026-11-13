/**
 * The Generate view's data: the models offered, the references (a character sheet and an
 * environment image, kept per example on the page, never in the recipe or the script), and
 * the prompt composed from the shot description. What a model receives is only the guide
 * video, the reference images and the shot description: nothing from the script
 * (coordinates, lock words, amounts) is ever part of it.
 */
export const MODELS = [
  { id: "kling-4.0", label: "Kling 4.0" },
  { id: "seedance-2.5", label: "Seedance 2.5" },
  { id: "minimax-h3", label: "MiniMax H3" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export type References = { character?: Blob; environment?: Blob };

/** The prompt a model gets: subject, environment, action and the colour legend, nothing else. */
export function composePrompt(shot: { subject: string; environment: string; action: string }, legend: string): string {
  const parts = [shot.subject, shot.environment, shot.action].map(s => s.trim()).filter(Boolean);
  return `${parts.join(". ")}${parts.length ? ". " : ""}${legend}.`;
}
