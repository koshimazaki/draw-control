/**
 * Shared helpers for the strict, bounded validators (recipe, camera rig, reactive layer,
 * blocking figures). Unknown keys, URLs and markup are refused.
 */
export class RecipeError extends Error {
  constructor(message: string) { super(`Recipe: ${message}`); this.name = "RecipeError"; }
}
export const fail = (message: string): never => { throw new RecipeError(message); };
export const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export const only = (x: Record<string, unknown>, keys: readonly string[], where: string) => {
  const extra = Object.keys(x).filter(k => !keys.includes(k));
  if (extra.length) fail(`${where}: unknown field(s) ${extra.join(", ")}`);
};
const SAFE_TEXT = /^[^<>{}\\]*$/;
export const text = (x: unknown, max: number, where: string): string => {
  if (typeof x !== "string" || x.length > max || !SAFE_TEXT.test(x)) fail(`${where} must be text up to ${max} characters`);
  if (/https?:|data:|javascript:/i.test(x as string)) fail(`${where} must not contain a URL`);
  return x as string;
};
/** Text on one line: each run of line breaks (and the spaces around it) becomes a single space, and the ends are trimmed (only whitespace: ""). */
export const oneLine = (s: string): string => s.replace(/[^\S\r\n]*[\r\n]+\s*/g, " ").trim();
/** A number in a range, with a readable error. */
export const num = (x: unknown, min: number, max: number, where: string): number => {
  if (!finite(x, min, max)) fail(`${where} must be ${min}–${max}`);
  return x as number;
};
