/**
 * The page's own cost dialog, shared by the video run, the image panel and the no-bound notice.
 * One question at a time: a second question waits until the first is answered and then shows
 * with its own title and text (a queue, so neither run is cancelled behind the reader's back
 * and OK always answers the question on screen). A question whose run is stopped resolves
 * false, whether it is on screen or still waiting, so Stop always ends the run.
 * The OK button keeps the focus, but neither a held key (key-repeat, or a key already down when
 * the question appeared) nor any click within CONFIRM_GUARD_MS of it appearing confirms a spend:
 * a held Enter cannot run through two dialogs back to back. Split from page-generate.ts.
 */
export const CONFIRM_GUARD_MS = 300;

export type Question = { title: string; text: string; ok: string };

/** Whether an activation of OK counts: never within the guard, and from the keyboard only for a key pressed after the question appeared. */
export function acceptConfirm(a: { sinceOpenMs: number; keyboard: boolean; freshKey: boolean }): boolean {
  if (a.sinceOpenMs < CONFIRM_GUARD_MS) return false;
  return !a.keyboard || a.freshKey;
}

type Item = { q: Question; resolve(v: boolean): void; off?: () => void };

/** The questions in order: one shown, the rest waiting. `view` draws the shown one (or hides the dialog). */
export class QuestionQueue {
  private waiting: Item[] = [];
  private current: Item | null = null;
  constructor(private view: { show(q: Question): void; hide(): void }) {}

  ask(q: Question, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const item: Item = { q, resolve };
      if (signal) {
        const stop = () => this.drop(item);
        signal.addEventListener("abort", stop, { once: true });
        item.off = () => signal.removeEventListener("abort", stop);
      }
      this.waiting.push(item);
      if (!this.current) this.next();
    });
  }
  /** The reader's answer to the question on screen; the next one (if any) shows at once. */
  answer(v: boolean) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.off?.();
    c.resolve(v);
    this.next();
  }
  get shown(): Question | null { return this.current?.q ?? null; }
  get size() { return this.waiting.length + (this.current ? 1 : 0); }

  private drop(item: Item) {
    if (this.current === item) { this.answer(false); return; }
    const i = this.waiting.indexOf(item);
    if (i >= 0) { this.waiting.splice(i, 1); item.off?.(); item.resolve(false); }
  }
  private next() {
    const n = this.waiting.shift();
    if (!n) { this.view.hide(); return; }
    this.current = n;
    this.view.show(n.q);
  }
}

/** The dialog in the page (#costDialog): `ask` resolves true only on OK, false on Cancel, Escape or the run's Stop. */
export function bindCostDialog($: (id: string) => HTMLElement) {
  const dialog = $("costDialog"), okButton = $("costOk");
  let openedAt = 0, freshKey = false, shownCount = 0;
  const queue = new QuestionQueue({
    show(q) {
      $("costTitle").textContent = q.title; $("costText").textContent = q.text; okButton.lastChild!.textContent = q.ok;
      dialog.hidden = false;
      openedAt = performance.now(); freshKey = false;
      // Not yet confirmable: said to assistive tech (and to a test driver, which waits for it).
      const n = ++shownCount;
      okButton.setAttribute("aria-disabled", "true");
      setTimeout(() => { if (n === shownCount) okButton.removeAttribute("aria-disabled"); }, CONFIRM_GUARD_MS);
      okButton.focus();
    },
    hide() { dialog.hidden = true; shownCount++; okButton.removeAttribute("aria-disabled"); },
  });
  window.addEventListener("keydown", e => {
    if (dialog.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); queue.answer(false); return; }
    // A held key repeats: it never activates OK. A new press after the question appeared may.
    if (e.repeat) { if (e.key === "Enter" || e.key === " ") e.preventDefault(); return; }
    freshKey = true;
  }, true);
  okButton.addEventListener("click", e => {
    if (!queue.shown) return;
    if (!acceptConfirm({ sinceOpenMs: performance.now() - openedAt, keyboard: e.detail === 0, freshKey })) { e.preventDefault(); return; }
    queue.answer(true);
  });
  $("costCancel").addEventListener("click", () => queue.answer(false));
  return (title: string, text: string, ok = "Generate", signal?: AbortSignal) => queue.ask({ title, text, ok }, signal);
}
