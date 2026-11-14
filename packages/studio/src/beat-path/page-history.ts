/**
 * Runs: the header button beside the key and its list of this browser's generations (the run
 * log, run-log.ts), newest first: when, which model, which example, the state, the cost, and
 * the task id. A done video shows in the output again (Show) or opens in a tab; an image opens.
 * A run still processing after a reload is asked for again every 15 s while the key is
 * connected (up to an hour after it was sent), and Check asks at once. Split from page-generate.ts.
 */
import { checkRun, type RunEntry, type RunLog } from "./run-log";

type Deps = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  log: RunLog;
  /** The key, when connected. */
  key(): string | null;
  /** Show a video result in the output pane of its example. */
  show(entry: RunEntry): void;
  say(text: string): void;
  /** A run this page is polling itself right now (the embed's own poll fills it in): not asked for twice. */
  live(entry: RunEntry): boolean;
};

const RESUME_MS = 15_000, RESUME_FOR_MS = 60 * 60_000;
const exampleName = (slot: string) => (slot === "own" ? "Your own" : `Example ${Number(slot) + 1}`);
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const stateWord = (e: RunEntry) => e.status === "done" ? "done" : e.status === "failed" ? "failed" : e.local ? "local" : "processing";

export function bindHistory(d: Deps) {
  const button = d.$("runsButton"), pop = d.$("runsPop"), list = d.$("runsList"), count = d.$("runsCount");
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  async function check(e: RunEntry, quiet = false) {
    const key = d.key();
    if (!key) { if (!quiet) d.say("Connect your Runware key to ask about this run"); return; }
    try {
      const was = e.status, now = await checkRun(d.log, e.taskUUID, key);
      if (!quiet) d.say(now?.status === "processing" ? `${e.model}: still processing` : now?.status === "done" ? `${e.model}: ready` : `${e.model}: ${now?.error ?? "failed"}`);
      else if (was === "processing" && now?.status === "done") d.say(`${e.model} (${exampleName(e.slot)}): the run from before is ready · open Runs`);
    } catch (err) { if (!quiet) d.say(`Could not reach Runware: ${(err as Error).message}`); }
  }

  function render() {
    const runs = d.log.list(), pending = runs.filter(r => r.status === "processing" && !r.local).length;
    count.textContent = pending ? String(pending) : runs.length ? String(runs.length) : "";
    count.classList.toggle("busy", pending > 0);
    if (pop.hidden) return;
    if (!runs.length) { list.replaceChildren(el("p", "muted runs-empty", "No runs yet. Each generation is listed here, kept in this browser, so a reload never loses one.")); return; }
    list.replaceChildren(...runs.map(r => {
      const row = el("div", `run-row ${r.status}`);
      const head = el("div", "run-head");
      head.append(el("span", "run-time mono", time(r.at)), el("span", "run-model", `${r.model} · ${r.kind}`), el("span", "run-where muted", exampleName(r.slot)), el("span", `run-state ${stateWord(r)}`, stateWord(r)));
      const foot = el("div", "run-foot");
      const id = el("button", "link-act run-id mono", r.taskUUID.slice(0, 8));
      id.type = "button"; id.title = `Task ${r.taskUUID} · click to copy`;
      id.onclick = () => void navigator.clipboard?.writeText(r.taskUUID).then(() => d.say("Task id copied"), () => d.say(r.taskUUID));
      foot.append(id);
      if (typeof r.cost === "number") foot.append(el("span", "muted mono", `${r.cost.toFixed(2)} USD`));
      if (r.error) foot.append(el("span", "run-error", r.error));
      // A local preview's result is an in-page link: gone after a reload, so only offered in the page that made it.
      const reachable = !!r.url && (!r.url.startsWith("blob:") || r.at >= performance.timeOrigin);
      if (r.status === "done" && reachable) {
        if (r.kind === "video") { const show = el("button", "link-act", "Show"); show.type = "button"; show.onclick = () => { d.show(r); pop.hidden = true; }; foot.append(show); }
        const open = el("a", "link-act", "Open ↗") as HTMLAnchorElement;
        open.href = r.url!; open.target = "_blank"; open.rel = "noopener";
        foot.append(open);
      }
      if (r.status === "processing" && !r.local) { const c = el("button", "link-act", "Check"); c.type = "button"; c.onclick = () => void check(r); foot.append(c); }
      row.append(head, foot);
      return row;
    }));
  }

  button.onclick = () => { pop.hidden = !pop.hidden; render(); };
  window.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target as Node) && !button.contains(e.target as Node)) pop.hidden = true; });
  window.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; });
  d.log.onChange(render);
  render();

  // Runs left processing (a reload, a closed tab): asked for again while the key is connected.
  setInterval(() => {
    for (const r of d.log.pending()) if (!d.live(r) && Date.now() - r.at < RESUME_FOR_MS) void check(r, true);
  }, RESUME_MS);
  return { render };
}
