/**
 * The Character and Camera lanes: blocks on the beat grid. Click a block (or Enter) for its
 * menu of words; drag the edge between two blocks to move the cut, snapped to half beats
 * by the core's `snapBeat` (the studio timeline's snap), every block at least one beat.
 */
import type { Block } from "./script";

export const MIN_BEATS = 1;

export type MenuItem = { label: string; on?: boolean; disabled?: boolean; run(): void } | "-";
/** A one-line text field at the top of a menu: Enter applies it; a refusal shows inline. */
export type MenuField = { value: string; placeholder: string; label: string; apply(text: string): string | null };

export type LaneHost<W extends string> = {
  blocks(): Block<W>[];
  total(): number;
  label(word: W): string;
  snap(beat: number): number;
  /** The lane changed; `final` when a drag ended. */
  commit(blocks: Block<W>[], final: boolean): void;
  open(anchor: HTMLElement, index: number, beat: number): void;
};

const el = (tag: string, className = "", text = "") => { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; };

export class LaneView<W extends string> {
  constructor(readonly root: HTMLElement, private host: LaneHost<W>) {}

  private beatAt(clientX: number) {
    const r = this.root.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * this.host.total();
  }

  render(openIndex = -1) {
    const blocks = this.host.blocks(), total = this.host.total();
    this.root.replaceChildren(...blocks.map((b, i) => {
      const d = el("div", `block w-${b.word}${i === openIndex ? " open" : ""}`);
      d.style.left = `calc(${b.from / total * 100}% + 1px)`;
      d.style.width = `calc(${(b.to - b.from) / total * 100}% - 2px)`;
      d.tabIndex = 0;
      d.setAttribute("role", "listitem");
      const text = b.phrase ?? this.host.label(b.word);
      d.setAttribute("aria-label", `${text}, beats ${b.from} to ${b.to}`);
      if (b.phrase) d.title = b.phrase;
      d.append(el("i"), el("span", "", text));
      d.addEventListener("click", e => { if (!(e.target as HTMLElement).classList.contains("edge")) this.host.open(d, i, this.beatAt(e.clientX)); });
      d.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.host.open(d, i, (b.from + b.to) / 2); } });
      if (i < blocks.length - 1) {
        const edge = el("div", "edge");
        edge.addEventListener("pointerdown", e => this.dragEdge(e, edge, i));
        edge.addEventListener("click", e => e.stopPropagation());
        d.appendChild(edge);
      }
      return d;
    }));
  }

  private dragEdge(e: PointerEvent, edge: HTMLElement, i: number) {
    e.preventDefault(); e.stopPropagation();
    edge.setPointerCapture(e.pointerId);
    edge.classList.add("dragging");
    const start = this.host.blocks().map(b => ({ ...b }));
    let last = start;
    const move = (ev: PointerEvent) => {
      const lo = start[i].from + MIN_BEATS, hi = start[i + 1].to - MIN_BEATS;
      const cut = Math.max(lo, Math.min(hi, this.host.snap(this.beatAt(ev.clientX))));
      if (cut === last[i].to) return;
      last = start.map((b, k) => (k === i ? { ...b, to: cut } : k === i + 1 ? { ...b, from: cut } : b));
      this.host.commit(last, false);
    };
    const up = () => {
      edge.removeEventListener("pointermove", move); edge.removeEventListener("pointerup", up); edge.removeEventListener("pointercancel", up);
      this.host.commit(last, true);
    };
    edge.addEventListener("pointermove", move);
    edge.addEventListener("pointerup", up);
    edge.addEventListener("pointercancel", up);
  }
}

/** Split block `i` at `beat` (both halves at least a beat), or null when it is too short. */
export function splitAt<W extends string>(blocks: Block<W>[], i: number, beat: number): Block<W>[] | null {
  const b = blocks[i], cut = Math.max(b.from + MIN_BEATS, Math.min(b.to - MIN_BEATS, Math.round(beat * 2) / 2));
  if (b.to - b.from < 2 * MIN_BEATS) return null;
  return [...blocks.slice(0, i), { ...b, to: cut }, { ...b, from: cut }, ...blocks.slice(i + 1)];
}

/** Remove block `i`: its neighbour (before it, or after it for the first) takes its beats. */
export function removeAt<W extends string>(blocks: Block<W>[], i: number): Block<W>[] | null {
  if (blocks.length < 2) return null;
  const out = blocks.map(b => ({ ...b }));
  if (i > 0) out[i - 1].to = out[i].to; else out[1].from = 0;
  out.splice(i, 1);
  return out;
}

/** A menu at an element: keyboard (arrows, Enter, Escape) and click outside to close. */
export class Menu {
  private close: (() => void) | null = null;
  constructor(private root: HTMLElement) {}
  get open() { return !!this.close; }
  hide() { this.close?.(); }
  show(anchor: HTMLElement, title: string, items: MenuItem[], onClose: () => void = () => {}, field?: MenuField, note?: string) {
    this.hide();
    this.root.replaceChildren(el("div", "menu-title", title));
    if (note) this.root.appendChild(el("p", "menu-note", note));
    let input: HTMLInputElement | null = null;
    if (field) {
      const wrap = el("label", "menu-field"), err = el("p", "menu-error");
      input = el("input") as HTMLInputElement;
      input.type = "text"; input.value = field.value; input.placeholder = field.placeholder; input.spellcheck = false;
      input.setAttribute("aria-label", field.label);
      input.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const refusal = field.apply(input!.value.trim());
        if (refusal) { err.textContent = refusal; err.hidden = false; } else this.hide();
      });
      err.hidden = true;
      wrap.append(el("span", "", field.label), input);
      this.root.append(wrap, err, el("hr"));
    }
    for (const it of items) {
      if (it === "-") { this.root.appendChild(el("hr")); continue; }
      const b = el("button", it.on ? "on" : "", it.label) as HTMLButtonElement;
      b.type = "button"; b.setAttribute("role", "menuitemradio"); b.disabled = !!it.disabled;
      b.onclick = () => { this.hide(); it.run(); };
      this.root.appendChild(b);
    }
    this.root.hidden = false;
    const r = anchor.getBoundingClientRect(), m = this.root.getBoundingClientRect();
    const top = r.top - m.height - 6 > 8 ? r.top - m.height - 6 : r.bottom + 6;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left))}px`;
    this.root.style.top = `${top}px`;
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (input) input.focus(); else (buttons.find(b => b.classList.contains("on")) ?? buttons[0])?.focus();
    const key = (e: KeyboardEvent) => {
      const k = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.hide(); anchor.focus(); }
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && document.activeElement !== input) { e.preventDefault(); buttons[(k + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    };
    const outside = (e: PointerEvent) => { if (!this.root.contains(e.target as Node) && !anchor.contains(e.target as Node)) this.hide(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    this.close = () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
      if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      this.root.hidden = true;
      this.close = null;
      onClose();
    };
  }
}
