/**
 * Export settings: size (presets or custom), the section of the recipe to export, and an
 * inline warning when the result falls outside the target model's limits. The warning
 * never blocks the export.
 */
import { constraintWarnings, resolveExportRange, type ExportRange, type RangeRequest, type RangeUnit, type Recipe } from "@motion-studio/core";
import { $ } from "../ui";

const input = (id: string) => $<HTMLInputElement>(id);
/** H.264 needs even sides. */
const even = (x: number) => Math.max(16, Math.min(8192, Math.round((Number.isFinite(x) ? x : 16) / 2) * 2));

export function exportSize(): { width: number; height: number } {
  const v = $<HTMLSelectElement>("resolution").value;
  if (v === "custom") return { width: even(Number(input("customW").value)), height: even(Number(input("customH").value)) };
  const [width, height] = v.split("x").map(Number);
  return { width, height };
}

export function rangeRequest(): RangeRequest {
  const num = (id: string) => (input(id).value.trim() === "" ? undefined : Number(input(id).value));
  return { unit: $<HTMLSelectElement>("rangeUnit").value as RangeUnit, start: num("rangeStart"), length: num("rangeLength") };
}

/** The resolved range, or the reason it cannot be resolved. */
export function currentRange(recipe: Recipe): ExportRange | Error {
  try { return resolveExportRange(recipe, rangeRequest()); } catch (e) { return e as Error; }
}

/** Refresh the range readout and the constraint warning. */
export function updateExportPanel(recipe: Recipe) {
  $("customSize").hidden = $<HTMLSelectElement>("resolution").value !== "custom";
  const { width, height } = exportSize();
  const range = currentRange(recipe);
  const warn = $("exportWarning");
  if (range instanceof Error) {
    $("rangeInfo").textContent = "";
    warn.textContent = range.message.replace(/^Recipe: /, "");
    warn.hidden = false;
    return;
  }
  const end = range.startFrame + range.frames - 1;
  $("rangeInfo").textContent = `${width}×${height} · frames ${range.startFrame}–${end} · ${range.frames} frames · ${range.seconds.toFixed(2)} s`;
  const problems = constraintWarnings({ width, height, fps: recipe.fps, seconds: range.seconds });
  warn.hidden = problems.length === 0;
  warn.textContent = problems.length ? `Outside the target model's limits (export still allowed): ${problems.join("; ")}.` : "";
}
