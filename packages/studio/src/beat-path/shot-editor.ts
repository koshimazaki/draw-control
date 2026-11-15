/**
 * The prompt editor: the chevron beside the shot fields opens a larger editor over the screens
 * (the panel above the fields, exactly its size, so the page does not move). In it the three
 * fields run over several lines, and Timed writes the action as a timeline built from the shot
 * itself (core `timedPrompt`: one line per camera block, in seconds, with the hit each move
 * starts on), in the time syntax the chosen model's guide documents. The text stays the
 * person's to edit: pressing Timed again over edited text asks first. It closes on the chevron,
 * the close button, Escape or a click outside, and gives focus back to the chevron.
 */
import { timedPrompt } from "@motion-studio/core";
import type { Page } from "./page";
import { shotRefusal } from "./page-setup";
import { MODELS, type ModelId } from "./generate";

const FIELDS = [["subject", "edSubject"], ["environment", "edEnvironment"], ["action", "edAction"]] as const;
type Ask = (title: string, text: string, ok?: string) => Promise<boolean>;

/** The time syntax a model's guide documents (docs/models.md): Seedance's "[0-3s]" windows, else "0.0–3.0 s:" lines. */
export const timedStyleFor = (model: ModelId) => MODELS.find(m => m.id === model)!.timed;

/** Whether pressing Timed over `action` would lose text the person wrote: it is not empty and not what Timed last wrote. */
export const replacesEdited = (action: string, lastTimed: string | null) => action.trim() !== "" && action.trim() !== (lastTimed ?? "").trim();

export function bindShotEditor(p: Page, o: { ask: Ask; model: () => ModelId; changed: () => void }) {
  const { $ } = p;
  const editor = $("shotEditor"), expand = $<HTMLButtonElement>("shotExpand");
  const area = (id: string) => $<HTMLTextAreaElement>(id);
  let lastTimed: string | null = null, opener: HTMLElement = expand;

  const count = () => {
    const a = p.state.shot.action;
    $("shotCount").textContent = `action ${a.length} / ${area("edAction").maxLength} characters${a.includes("\n") ? ` · ${a.split("\n").length} lines` : ""}`;
  };
  /** The textareas from the state (a field being typed in keeps its caret). */
  const refresh = () => {
    for (const [k, id] of FIELDS) if (document.activeElement !== area(id)) area(id).value = p.state.shot[k];
    count();
  };
  const isOpen = () => !editor.hidden;
  function open(focus: "subject" | "environment" | "action" = "action", from: HTMLElement = expand) {
    opener = from;
    refresh();
    editor.hidden = false;
    expand.setAttribute("aria-expanded", "true");
    expand.setAttribute("aria-label", "Close the prompt editor");
    area(FIELDS.find(f => f[0] === focus)![1]).focus();
  }
  function close() {
    if (!isOpen()) return;
    editor.hidden = true;
    expand.setAttribute("aria-expanded", "false");
    expand.setAttribute("aria-label", "Open the prompt editor");
    (opener.isConnected ? opener : expand).focus();
  }
  expand.onclick = () => (isOpen() ? close() : open());
  $("shotCollapse").onclick = close;
  // Escape closes, unless the cost dialog (asking about Timed) is up: that Escape is its own.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !isOpen() || !$("costDialog").hidden) return;
    e.preventDefault(); close();
  });
  document.addEventListener("pointerdown", e => {
    const t = e.target as Node;
    if (isOpen() && !editor.contains(t) && !expand.contains(t) && $("costDialog").hidden) close();
  });

  for (const [k, id] of FIELDS) {
    const el = area(id);
    el.oninput = () => { p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, false); count(); o.changed(); };
    el.onchange = () => { p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, true); o.changed(); };
    // A one-line field holding several lines is read-only (page-actions.ts): a click opens it here.
    const inline = $<HTMLInputElement>(`shot${k[0].toUpperCase()}${k.slice(1)}`);
    inline.addEventListener("click", () => { if (inline.readOnly) open(k, inline); });
    inline.addEventListener("keydown", e => { if (inline.readOnly && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(k, inline); } });
  }

  $("shotTimed").onclick = async () => {
    if (p.busy) return;
    const unbuilt = shotRefusal(p);
    if (unbuilt) { p.say(unbuilt); return; }
    const timed = timedPrompt(p.recipe, { bands: p.drive?.bands, seconds: p.state.clip, style: timedStyleFor(o.model()) });
    if (!timed) { p.say("Nothing to time: the shot has no camera blocks yet."); return; }
    if (replacesEdited(p.state.shot.action, lastTimed)
      && !await o.ask("Replace the action?", "Timed writes the action again from the camera blocks and the hits; the text in the action field now is replaced (undo puts it back).", "Replace")) return;
    lastTimed = timed;
    p.update({ ...p.state, shot: { ...p.state.shot, action: timed } }, true);
    area("edAction").value = timed;
    count(); o.changed();
    p.say(`Timed: ${timed.split("\n").length} lines from the camera blocks. Edit them freely.`);
    if (isOpen()) area("edAction").focus();
  };
  return { open, close, refresh, isOpen };
}
