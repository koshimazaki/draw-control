/**
 * A ruler fader (after Genobi's TickFader): a native range input over a ruled scale, one tick
 * per step, taller ticks at the marks, and the marks labelled underneath as buttons that jump
 * there. A `reach` greys the scale past the most the current choice allows (a model's longest
 * clip) and flags the readout when the value is beyond it. The input keeps native keyboard
 * and pointer behaviour; `input` fires while dragging and `change` when the value settles.
 */
export type FaderSpec = { id: string; min: number; max: number; step?: number; marks: readonly number[]; label: string; unit?: string };

const pct = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`;

export function faderHTML(f: FaderSpec): string {
  const step = f.step ?? 1, unit = f.unit ?? "";
  const ticks: string[] = [];
  for (let v = f.min; v <= f.max + 1e-9; v += step)
    ticks.push(`<i${f.marks.includes(v) ? ' class="major"' : ""} style="left:${pct(v, f.min, f.max)}"></i>`);
  const marks = f.marks.map(v => `<button type="button" tabindex="-1" data-value="${v}" style="left:${pct(v, f.min, f.max)}" aria-label="${v}${unit ? ` ${unit}` : ""}">${v}</button>`).join("");
  return `<div class="fader" id="${f.id}Fader">`
    + `<input id="${f.id}" type="range" min="${f.min}" max="${f.max}" step="${step}" aria-label="${f.label}" />`
    + `<div class="fader-scale" aria-hidden="true"><span class="fader-reach"></span>${ticks.join("")}</div>`
    + `<div class="fader-marks">${marks}</div></div>`;
}

/** Show `value` and the reach (the largest value the current choice takes); an omitted reach keeps the last one set. */
export function setFader(root: HTMLElement, value: number, reach?: number) {
  const input = root.querySelector<HTMLInputElement>("input[type=range]")!;
  if (reach !== undefined) root.dataset.reach = String(reach);
  const min = Number(input.min), max = Number(input.max), r = Math.min(max, Number(root.dataset.reach ?? max));
  input.value = String(value);
  root.style.setProperty("--fill", pct(value, min, max));
  root.style.setProperty("--reach", pct(r, min, max));
  root.classList.toggle("over", value > r);
  root.querySelectorAll<HTMLButtonElement>(".fader-marks button").forEach(b => {
    const v = Number(b.dataset.value);
    b.classList.toggle("on", v === value); b.classList.toggle("out", v > r);
  });
}

/** Wire a fader: `preview` while dragging (cheap: readouts), `commit` when it settles or a mark is clicked. */
export function bindFader(root: HTMLElement, preview: (v: number) => void, commit: (v: number) => void) {
  const input = root.querySelector<HTMLInputElement>("input[type=range]")!;
  input.addEventListener("input", () => preview(input.valueAsNumber));
  input.addEventListener("change", () => commit(input.valueAsNumber));
  root.querySelector(".fader-marks")!.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value;
    if (v !== undefined) { input.value = v; commit(Number(v)); input.focus(); }
  });
}
