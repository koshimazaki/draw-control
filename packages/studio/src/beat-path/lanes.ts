/**
 * The Character and Camera lanes: blocks on the beat grid. Click a block (or Enter) for its
 * menu of words; drag the edge between two blocks to move the cut, snapped to half beats
 * by the core's `snapBeat` (the studio timeline's snap), every block at least one beat. Drag a
 * block's body to move it along the lane (it keeps its length; the blocks it passes change places
 * with it), or Alt+Left/Right with it focused; Escape during the drag puts it back. A drag ends as
 * one undo step or puts the lane back with none (`cancel`); both listen on the window, as the lane
 * re-renders (and replaces its elements) on every step.
 */
import { dropIndex, moveBlock } from "./lane-cuts";
import type { Block } from "./script";

export const MIN_BEATS = 1;
/** How far a press on a block travels before it is a drag (a move) rather than a click (the menu). */
const DRAG_PX = 4;
/** Fired on the window when a block drag starts; an open menu closes on it. */
const LANE_DRAG = "lanedragstart";

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
  /** A drag ended with no change (Escape, a drop where it began, refused, aborted): the lane as it was, no undo step. */
  cancel(): void;
  open(anchor: HTMLElement, index: number, beat: number): void;
  /** Block `from` was moved to place `to` (a selection by index follows it). */
  moved?(from: number, to: number): void;
};

const el = (tag: string, className = "", text = "") => { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; };
/** The click that follows a drag's release is the drag's, not a request for the menu. */
function eatNextClick() {
  const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener("click", eat, true);
  setTimeout(() => window.removeEventListener("click", eat, true), 0);
}

export class LaneView<W extends string> {
  constructor(readonly root: HTMLElement, private host: LaneHost<W>) {}

  private beatAt(clientX: number) {
    const r = this.root.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * this.host.total();
  }

  render(openIndex = -1) {
    const blocks = this.host.blocks(), total = this.host.total(), drag = this.moving;
    const pct = (beats: number) => `${beats / total * 100}%`;
    this.root.replaceChildren(...blocks.map((b, i) => {
      const d = el("div", `block w-${b.word}${i === openIndex ? " open" : ""}${drag?.at === i ? " moving" : ""}`);
      // The block being moved rides under the pointer; the others sit in their new places.
      d.style.left = `calc(${pct(drag?.at === i ? drag.left : b.from)} + 1px)`;
      d.style.width = `calc(${pct(b.to - b.from)} - 2px)`;
      d.tabIndex = 0;
      d.setAttribute("role", "listitem");
      const text = b.phrase ?? this.host.label(b.word);
      d.setAttribute("aria-label", `${text}, beats ${b.from} to ${b.to}${blocks.length > 1 ? ". Alt+Left or Alt+Right moves it" : ""}`);
      d.title = blocks.length > 1 ? `${text} · drag to move` : text;   // the full words when the block is too short to show them
      d.append(el("i"), el("span", "", text));
      d.addEventListener("click", e => { if (!(e.target as HTMLElement).classList.contains("edge")) this.host.open(d, i, this.beatAt(e.clientX)); });
      d.addEventListener("pointerdown", e => this.press(e, i));
      d.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.host.open(d, i, (b.from + b.to) / 2); }
        else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault(); e.stopPropagation();
          this.place(i, i + (e.key === "ArrowLeft" ? -1 : 1));
          (this.root.children[Math.max(0, Math.min(blocks.length - 1, i + (e.key === "ArrowLeft" ? -1 : 1)))] as HTMLElement | undefined)?.focus();
        }
      });
      if (i < blocks.length - 1) {
        const edge = el("div", `edge${this.edging === i ? " dragging" : ""}`);
        edge.addEventListener("pointerdown", e => this.dragEdge(e, i));
        edge.addEventListener("click", e => e.stopPropagation());
        d.appendChild(edge);
      }
      return d;
    }));
    // Where the moved block lands when released: a dashed slot under it.
    if (drag && blocks[drag.at]) {
      const slot = el("div", "lane-slot"), b = blocks[drag.at];
      slot.style.left = `calc(${pct(b.from)} + 1px)`;
      slot.style.width = `calc(${pct(b.to - b.from)} - 2px)`;
      this.root.prepend(slot);
    }
  }

  /** The block being dragged by its body: where it sits now, its left edge under the pointer (beats). */
  private moving: { at: number; left: number } | null = null;
  /** The edge being dragged (its index), or -1. */
  private edging = -1;
  /** Ends the drag in progress, putting the lane back (set while a press or an edge drag is held). */
  private stop: (() => void) | null = null;
  get dragging() { return !!this.stop; }
  /** End a held drag now, the lane put back with no undo step (the page is about to render a guide, undo or switch). */
  abort() { this.stop?.(); }

  /** Move block `i` to place `to` as one undo step (Alt+Left/Right); false when it cannot move. */
  place(i: number, to: number): boolean {
    const next = moveBlock(this.host.blocks(), i, to);
    if (!next) return false;
    this.host.commit(next, true);
    this.host.moved?.(i, to);
    return true;
  }

  /**
   * A press on a block's body: a click unless it travels more than a few pixels, then a drag that
   * moves the block along the lane. The others change places live; Escape puts everything back.
   * Listens on the window, so the lane re-rendering under the drag never drops it.
   */
  private press(e: PointerEvent, i: number) {
    if (e.button !== 0 || (e.target as HTMLElement).classList.contains("edge")) return;
    const start = this.host.blocks().map(b => ({ ...b }));
    if (start.length < 2) return;   // one block: nothing to move, the press stays a click
    const x0 = e.clientX, id = e.pointerId, len = start[i].to - start[i].from, total = this.host.total();
    let at = i, dragging = false;
    const end = (keep: boolean) => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true); window.removeEventListener("keydown", key, true);
      this.stop = null;
      if (!dragging) return;
      eatNextClick();
      this.moving = null;
      // A move commits as one undo step; anything else (Escape, back on its own place, refused) puts the lane back with none.
      const next = keep ? moveBlock(start, i, at) : null;
      if (next) this.host.commit(next, true);
      if (next && this.host.blocks() === next) this.host.moved?.(i, at);
      else this.host.cancel();
      this.render();
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!dragging) {
        if (Math.abs(ev.clientX - x0) < DRAG_PX) return;
        dragging = true;
        window.dispatchEvent(new Event(LANE_DRAG));   // an open block menu closes: its block is on the move
      }
      ev.preventDefault();
      const left = Math.max(0, Math.min(total - len, start[i].from + (ev.clientX - x0) / this.root.getBoundingClientRect().width * total));
      const to = dropIndex(start, i, left);
      this.moving = { at: to, left };
      if (to !== at) {
        const next = moveBlock(start, i, to) ?? start;
        this.host.commit(next, false);
        if (this.host.blocks() !== next) { end(false); return; }   // the page refused it (busy): back as it was
        at = to;
        this.render();
      } else {
        const d = this.root.querySelector<HTMLElement>(".block.moving");
        if (d) d.style.left = `calc(${left / total * 100}% + 1px)`;
        else this.render();
      }
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === id) end(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) end(false); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape" && dragging) { ev.preventDefault(); ev.stopImmediatePropagation(); end(false); } };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    this.stop = () => end(false);
  }

  /**
   * The edge between blocks `i` and `i + 1` dragged: the cut follows the pointer (snapped), one undo
   * step on release, none when it ends where it began. On the window, not a pointer capture on the
   * edge: the lane re-renders on every step and the captured edge was replaced, which lost the drag.
   */
  private dragEdge(e: PointerEvent, i: number) {
    e.preventDefault(); e.stopPropagation();
    this.abort();
    const start = this.host.blocks().map(b => ({ ...b })), id = e.pointerId;
    let last = start;
    this.edging = i;
    this.root.querySelectorAll(".edge")[i]?.classList.add("dragging");
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      ev.preventDefault();
      const lo = start[i].from + MIN_BEATS, hi = start[i + 1].to - MIN_BEATS;
      const cut = Math.max(lo, Math.min(hi, this.host.snap(this.beatAt(ev.clientX))));
      if (cut === last[i].to) return;
      const next = start.map((b, k) => (k === i ? { ...b, to: cut } : k === i + 1 ? { ...b, from: cut } : b));
      this.host.commit(next, false);
      if (this.host.blocks() !== next) { end(false); return; }   // the page refused it (busy)
      last = next;
    };
    const end = (keep: boolean) => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", cancel, true);
      this.stop = null; this.edging = -1;
      const moved = last[i].to !== start[i].to;
      if (moved) eatNextClick();
      if (keep && moved) this.host.commit(last, true);
      if (!(keep && moved && this.host.blocks() === last)) this.host.cancel();
      this.render();
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === id) end(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) end(false); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    this.stop = () => end(false);
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
    anchor.setAttribute("aria-expanded", "true");   // the open lock chip or block reads as selected
    const r = anchor.getBoundingClientRect(), m = this.root.getBoundingClientRect();
    const top = r.top - m.height - 6 > 8 ? r.top - m.height - 6 : r.bottom + 6;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left))}px`;
    this.root.style.top = `${Math.max(8, Math.min(window.innerHeight - m.height - 8, top))}px`;   // always inside the viewport
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (input) input.focus(); else (buttons.find(b => b.classList.contains("on")) ?? buttons[0])?.focus();
    const key = (e: KeyboardEvent) => {
      const k = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.hide(); anchor.focus(); }
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && document.activeElement !== input) { e.preventDefault(); buttons[(k + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    };
    const outside = (e: PointerEvent) => { if (!this.root.contains(e.target as Node) && !anchor.contains(e.target as Node)) this.hide(); };
    const drag = () => this.hide();
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener(LANE_DRAG, drag);
    this.close = () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener(LANE_DRAG, drag);
      if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      this.root.hidden = true;
      anchor.setAttribute("aria-expanded", "false");
      this.close = null;
      onClose();
    };
  }
}
