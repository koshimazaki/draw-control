/**
 * The image panel's state, kept apart from the DOM so it can be tested: the prompt suggested for
 * a Character or an Environment image, the two-step model choice (family, then model), the
 * references chosen for the image model, what blocks Generate, and the plain words for a
 * token-priced model with no published bound.
 */
import type { ImageFamilyInfo, ImageModelInfo } from "./arena";
import type { RefKind, RefSource } from "./ref-store";

/** Image runs refuse anything above this (USD), shown in the dialog. */
export const IMAGE_MAX_PRICE = 0.5;

/** The prompt a panel opens with: a character sheet from the shot's subject, or the shot's environment. */
export function suggestPrompt(kind: RefKind, shot: { subject: string; environment: string }): string {
  if (kind === "character") {
    const who = shot.subject.trim() || "the character";
    return `A character sheet of ${who}: front, side and back views, full body, neutral pose, plain light grey background, even studio light.`;
  }
  const where = shot.environment.trim() || "the place the shot happens";
  return `${where[0].toUpperCase()}${where.slice(1)}, an empty wide view with no people in front, natural light, detailed.`;
}

export type PanelRef = { image: Blob | string; source: RefSource; label: string };
export type PanelState = { kind: RefKind; prompt: string; family: string; model: string; refs: PanelRef[] };

/** A fresh panel: the first family's first per-image model (a bounded price), else the very first model. */
export function initialState(kind: RefKind, shot: { subject: string; environment: string }, families: ImageFamilyInfo[]): PanelState {
  const all = families.flatMap(f => f.models), pick = all.find(m => m.pricing.kind === "per-image") ?? all[0];
  return { kind, prompt: suggestPrompt(kind, shot), family: pick?.family ?? "", model: pick?.key ?? "", refs: [] };
}
/** Choosing a family picks its first model; a model keeps its family. */
export function chooseFamily(s: PanelState, families: ImageFamilyInfo[], family: string): PanelState {
  const f = families.find(x => x.family === family);
  return f ? { ...s, family, model: f.models[0].key } : s;
}
export const modelOf = (families: ImageFamilyInfo[], key: string): ImageModelInfo | undefined => families.flatMap(f => f.models).find(m => m.key === key);

/** Why Generate cannot run yet (null when it can). */
export function blocker(s: PanelState, m: ImageModelInfo | undefined, connected: boolean, fake: boolean): string | null {
  if (!m) return "Pick a model";
  const n = s.prompt.trim().length;
  if (n < m.prompt.min || n > m.prompt.max) return `${m.name} takes a prompt of ${m.prompt.min}–${m.prompt.max} characters`;
  if (s.refs.length > m.accepts.referenceImages.max) return `${m.name} takes ${m.accepts.referenceImages.max === 0 ? "no reference images" : `up to ${m.accepts.referenceImages.max} reference image${m.accepts.referenceImages.max === 1 ? "" : "s"}`}`;
  if (!connected && !fake) return "Add your Runware API key first (top right)";
  return null;
}
/** A token-priced model has no published upper price: it runs only after the reader agrees to this. */
export const needsUnpriced = (m: ImageModelInfo | undefined) => m?.pricing.kind === "token";
export function unpricedNotice(m: ImageModelInfo): string {
  return `${m.name} is priced per token, and Runware publishes no upper price for one image, so this page cannot cap it at ${IMAGE_MAX_PRICE.toFixed(2)} USD. `
    + `Rates: ${m.pricing.summary}. If you continue, the next step shows Runware's highest published example price, and the run is refused if that example is over ${IMAGE_MAX_PRICE.toFixed(2)} USD; what you pay is what Runware reports for the run.`;
}
/** The cost dialog's words for an image run (bounded, or the unpriced case with the embed's rates and example). */
export function imageCostText(q: { usd: number; modelName: string; inputs: unknown[]; priced?: "bound" | "unpriced"; rates?: string; examples?: string }, local: string): string {
  const n = ((q.inputs ?? []) as { role?: string }[]).filter(i => !/prompt|text/i.test(i.role ?? "")).length;
  const refs = n > 0 ? `the prompt and ${n} reference image${n === 1 ? "" : "s"}` : "the prompt";
  if (q.priced === "unpriced") return `No published upper price on ${q.modelName}. Runware's highest published example: ${q.usd.toFixed(3)} USD (not a cap). Rates: ${q.rates ?? "per token"}.${q.examples ? ` Examples: ${q.examples}.` : ""} It sends ${refs}.${local}`;
  return `Up to ${q.usd.toFixed(3)} USD on ${q.modelName} (limit ${IMAGE_MAX_PRICE.toFixed(2)} USD). It sends ${refs}.${local}`;
}
