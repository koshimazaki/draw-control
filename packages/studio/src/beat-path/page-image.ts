/**
 * "Generate" beside the Character and Environment drops: a popover with a prompt (a character
 * sheet or an environment view, from the shot), the image model in two steps (family, then
 * model), its size rule and price in plain words, reference images for the image model (the
 * other drop, or any image through "Use as reference", which gains a third target while the
 * panel is open), and Generate / Stop. It calls the embed's generateImage() with the page's key
 * and cost dialog; a token-priced model runs only after the reader has agreed to the no-bound
 * notice. The image lands in its drop and in the gallery's "Your runs". Escape closes it.
 * Built with DOM nodes (text set as text): model names come from the embed's catalogue.
 */
import { textSpinner } from "./ui/spinner";
import { icon } from "./ui/icons";
import { blocker, chooseFamily, composeInput, imageCostText, initialState, modelOf, needsUnpriced, sizeFor, suggestPrompt, unpricedNotice, IMAGE_MAX_PRICE, type PanelState } from "./image-panel";
import { sourceLabel, type RefKind, type RefSource, type RefStore } from "./ref-store";
import type { ArenaKeyElement, ArenaModule, CostQuestion, ImageFamilyInfo } from "./arena";
import type { Run } from "./gallery";
import { runErrorText, type RunError } from "./generate";
import { results } from "./result-fetch";

type Deps = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  slot(): string; shot(): { subject: string; environment: string };
  arena(): ArenaModule | null; key(): ArenaKeyElement | null; fake: boolean;
  /** The page's cost dialog (cost-dialog.ts): one question at a time; `signal` ends a waiting or shown question as false. */
  ask(title: string, text: string, ok?: string, signal?: AbortSignal): Promise<boolean>;
  store: RefStore; runs: Run[]; renderGallery(): void;
  fakeFetch(image: () => string): unknown;
  /** The fetch for a run, wrapped so the run log keeps its task id (the fake one in the local preview). */
  logged(inner: unknown, model: string, local: boolean): unknown;
  setExtra(f: () => { label: string; take(got: { blob: Blob | string; source: RefSource }): void } | null): void;
  say(text: string): void;
};

/** A local stand-in for a generated still (no key, ?fake=1): a grey card saying what it stands for. */
function placeholder(kind: RefKind, model: string): Promise<string> {
  const c = Object.assign(document.createElement("canvas"), { width: 768, height: 768 }), g = c.getContext("2d")!;
  g.fillStyle = "#3a3d42"; g.fillRect(0, 0, 768, 768);
  g.fillStyle = "#d9d9d9"; g.font = "600 34px system-ui, sans-serif"; g.textAlign = "center";
  g.fillText(kind === "character" ? "Character sheet" : "Environment", 384, 360); g.font = "24px system-ui, sans-serif";
  g.fillText(`local preview · ${model}`, 384, 410);
  return new Promise(r => c.toBlob(b => r(URL.createObjectURL(b!)), "image/png"));
}

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const option = (value: string, text: string) => Object.assign(document.createElement("option"), { value, textContent: text });

export function bindImages(d: Deps) {
  const pop = node("div", "image-pop panel");
  pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Generate a reference image");
  const title = node("strong", "ip-title"), prompt = node("textarea", "field ip-prompt"), family = node("select", "ip-family"), model = node("select", "ip-model");
  const facts = node("p", "ip-facts muted"), list = node("div", "ip-ref-list"), note = node("p", "ip-note muted");
  // Under the prompt: "Rewrite for this model" once the reader has typed, the model's tips, its prompting guide.
  const rewrite = node("button", "link-act ip-rewrite", "Rewrite for this model"), tips = node("ul", "ip-tips muted"), guide = node("p", "ip-guide muted");
  rewrite.type = "button"; rewrite.hidden = true;
  // GPT-Image-2.6: quality (auto by default), with what it does to the cost.
  const quality = node("div", "seg ip-quality"), qualityNote = node("p", "ip-quality-note muted", "Quality and size set the cost.");
  quality.setAttribute("role", "radiogroup"); quality.setAttribute("aria-label", "Quality");
  for (const [v, label] of [["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]]) {
    const b = node("button", v === "auto" ? "on" : "", label); b.type = "button"; b.dataset.value = v; b.setAttribute("role", "radio"); quality.append(b);
  }
  const qualityRow = node("div", "ip-quality-row"); qualityRow.append(quality, qualityNote);
  const otherBox = node("label", "toggle ip-other"), otherInput = node("input"), otherLabel = node("span");
  const cancel = node("button", "btn ip-cancel", "Close"), run = node("button", "btn primary ip-run"), runLabel = node("span", "btn-label", "Generate");
  prompt.rows = 4; prompt.setAttribute("aria-label", "Prompt"); family.setAttribute("aria-label", "Model family"); model.setAttribute("aria-label", "Model");
  otherInput.type = "checkbox"; otherBox.append(otherInput, node("span", "knob"), otherLabel);
  note.setAttribute("aria-live", "polite"); cancel.type = "button"; run.type = "button";
  run.innerHTML = icon("sparkles"); run.append(runLabel);
  const row = (...kids: HTMLElement[]) => { const r = node("div", "ip-row"); r.append(...kids); return r; };
  const refs = node("div", "ip-refs"); refs.append(node("span", "lab", "References"), list, otherBox);
  const foot = row(cancel, run); foot.classList.add("end");
  const spin = textSpinner(), noteRow = node("div", "note-row");
  noteRow.append(spin.el, note);
  pop.append(title, prompt, rewrite, tips, guide, row(family, model), facts, qualityRow, refs, noteRow, foot);
  document.body.append(pop);
  let state: PanelState | null = null, families: ImageFamilyInfo[] = [], running: AbortController | null = null, anchor: HTMLElement | null = null;
  /** The text the reader typed, per drop: kept through Escape and reopening; while set, the prompt is not rewritten. */
  const edited = new Map<RefKind, string>();
  let qualityValue = "auto";

  function open(kind: RefKind, from: HTMLElement) {
    families = d.arena()?.imageFamilies?.() ?? [];
    if (!families.length) { d.say("Image generation needs the Model Arena embed with image models (npm run vendor:arena)"); return; }
    state = initialState(kind, d.shot(), families);
    anchor = from; pop.hidden = false;
    title.textContent = kind === "character" ? "Generate a character image" : "Generate an environment image";
    family.replaceChildren(...families.map(f => option(f.family, f.family)));
    otherInput.checked = false;
    compose(); render(); place();
    prompt.focus();
    // While open, "Use as reference" can add an image to this panel's references.
    d.setExtra(() => (pop.hidden || !state ? null : { label: "Image references (for Generate)", take: got => { state!.refs.push({ image: got.blob, source: got.source, label: sourceLabel(got.source) }); compose(); render(); d.say("Added to the image's references"); } }));
  }
  function close() { if (running) return; pop.hidden = true; state = null; d.setExtra(() => null); anchor?.focus(); }
  /** The references' roles for the prompt, in the order they are sent (the other drop first). */
  function roles(): { role: "character" | "environment" | "other"; note?: string }[] {
    const out: { role: "character" | "environment" | "other"; note?: string }[] = state!.refs.map(r => ({ role: "other" as const, note: r.label }));
    if (d.store.get(d.slot(), other()) && otherInput.checked) out.unshift({ role: other() });
    return out;
  }
  /** Write the prompt the way the chosen model's guide asks, unless the reader has typed their own. */
  function compose() {
    if (!state) return;
    const typed = edited.get(state.kind), m = modelOf(families, state.model), arena = d.arena();
    const text = typed ?? (arena?.composeImagePrompt ? arena.composeImagePrompt(composeInput(state, d.shot(), roles(), m)).prompt : suggestPrompt(state.kind, d.shot()));
    state = { ...state, prompt: text };
    if (prompt.value !== text) prompt.value = text;
    rewrite.hidden = typed === undefined;
  }
  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth || 360, h = pop.offsetHeight || 380;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
    pop.style.top = `${Math.max(8, r.top - h - 8)}px`;
  }
  const other = (): RefKind => (state!.kind === "character" ? "environment" : "character");
  /** The references the image model gets: the other drop (when ticked) and the ones added here. */
  function refList(): (Blob | string)[] {
    const out = state!.refs.map(r => r.image), o = d.store.get(d.slot(), other());
    if (o && otherInput.checked) out.unshift(o.blob ?? o.url);
    return out;
  }
  function render() {
    if (!state) return;
    const m = modelOf(families, state.model), fam = families.find(f => f.family === state!.family);
    family.value = state.family;
    model.replaceChildren(...(fam?.models ?? []).map(x => option(x.key, x.name)));
    model.value = state.model;
    const max = m?.accepts.referenceImages.max ?? 0;
    tips.replaceChildren(...(m?.tips ?? []).slice(0, 4).map(t => node("li", "", t)));
    // The model's prompting guide, or the embed's words where none is published.
    guide.replaceChildren();
    if (m?.guide?.url) { const a = node("a", "link-act", "Prompting guide"); a.href = m.guide.url; a.target = "_blank"; a.rel = "noopener noreferrer"; guide.append(a); }
    else if (m?.guide) guide.textContent = `${m.name}: ${m.guide.note ?? "no model guide published"}.`;
    qualityRow.hidden = !m?.accepts.quality;
    quality.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.classList.toggle("on", b.dataset.value === qualityValue); b.setAttribute("aria-checked", String(b.dataset.value === qualityValue)); });
    facts.textContent = m ? `${m.size.summary} · ${m.pricing.summary} · ${max ? `up to ${max} reference image${max === 1 ? "" : "s"}` : "no reference images"}` : "";
    otherBox.hidden = !d.store.get(d.slot(), other());
    otherLabel.textContent = `Use the ${other()} image`;
    list.replaceChildren(...state.refs.map((r, i) => {
      const chip = node("span", "badge tag ip-chip", r.label.slice(0, 32)), x = node("button", "ip-chip-x");
      chip.title = r.label; x.type = "button"; x.setAttribute("aria-label", `Remove ${r.label}`); x.innerHTML = icon("x");
      x.onclick = () => { state!.refs.splice(i, 1); compose(); render(); };
      chip.append(x); return chip;
    }));
    const blocked = blocker({ ...state, refs: refList().map(image => ({ image, source: { kind: "upload", name: "" }, label: "" })) }, m, !!d.key()?.connected, d.fake);
    run.disabled = !running && !!blocked;
    requestAnimationFrame(place);   // the panel's height follows the model (tips, quality): keep it above its button
    if (!running) note.textContent = blocked ?? (needsUnpriced(m) ? "No published upper price: you will be asked before anything is sent." : d.fake && !d.key()?.connected ? "Local preview: nothing is sent and nothing is charged." : "");
  }
  family.onchange = () => { state = chooseFamily(state!, families, family.value); compose(); render(); };
  model.onchange = () => { state = { ...state!, model: model.value }; compose(); render(); };
  // Typing makes the prompt the reader's own: it is kept for this drop and no longer rewritten.
  prompt.oninput = () => { state = { ...state!, prompt: prompt.value }; edited.set(state.kind, prompt.value); rewrite.hidden = false; render(); };
  rewrite.onclick = () => { edited.delete(state!.kind); compose(); render(); prompt.focus(); };
  quality.addEventListener("click", e => { const v = (e.target as HTMLElement).closest("button")?.dataset.value; if (v) { qualityValue = v; render(); } });
  otherInput.onchange = () => { compose(); render(); };
  cancel.onclick = () => close();
  pop.addEventListener("keydown", e => { if (e.key === "Escape" && !running) { e.preventDefault(); e.stopPropagation(); close(); } });

  run.onclick = async () => {
    if (running) { running.abort(); d.say("Stopping…"); return; }
    const arena = d.arena(), s = state!, m = modelOf(families, s.model);
    if (!arena?.generateImage || !m) return;
    // A token-priced model has no published bound: ask first, in plain words, and only then allow the unpriced run.
    if (needsUnpriced(m) && !(await d.ask("No published price limit", unpricedNotice(m), "Continue"))) { d.say("Nothing sent"); return; }
    const local = !d.key()?.connected && d.fake, slot = d.slot(), kind = s.kind, words = s.prompt.trim();
    running = new AbortController();
    const signal = running.signal;
    runLabel.textContent = "Stop"; note.textContent = "Starting…"; spin.start();
    try {
      const fakeImage = local ? await placeholder(kind, m.name) : "";
      const r = await arena.generateImage({
        model: m.key, prompt: words, references: refList(), maxPrice: IMAGE_MAX_PRICE, signal,
        ...(sizeFor(m).size ? { size: sizeFor(m).size } : {}),
        ...(m.accepts.quality ? { quality: qualityValue } : {}),
        ...(needsUnpriced(m) ? { allowUnpriced: true } : {}),
        key: d.key()?.connected ? d.key() : "local-preview-key-0000000000000000",
        confirm: (cq: CostQuestion) => d.ask("Generate this image?", imageCostText(cq, local ? " Local preview: nothing is sent and nothing is charged." : ""), "Generate", signal),
        onProgress: (g: { message: string }) => { note.textContent = g.message; },
        fetch: d.logged(local ? d.fakeFetch(() => fakeImage) : null, m.name, local),
        ...(local ? { poll: { initialDelayMs: 100, intervalMs: 100, maxIntervalMs: 200 } } : {}),
      });
      // The image as a Blob for the store; if the browser may not fetch it (CORS), keep its URL: an image model takes
      // a URL reference, a video model (Blobs only) then does not get it, and the status line says so.
      let image: Blob | string = r.imageURL;
      // The same download as the run log's kept copy (result-fetch.ts).
      try { image = await results.get(r.imageURL); } catch { /* remote and not readable here: keep the URL */ }
      d.store.set(slot, kind, image, { kind: "generated", model: m.name, prompt: words });
      d.runs.push({ slot, model: m.key, modelName: m.name, url: typeof image === "string" ? image : URL.createObjectURL(image), prompt: words, kind: "image", costUsd: r.costUsd, for: kind, blob: typeof image === "string" ? null : image });
      d.renderGallery();
      d.say(`${m.name}: ${kind} image ready${r.costUsd != null ? `, ${r.costUsd.toFixed(3)} USD` : ""}${local ? " (local preview)" : ""}${typeof image === "string" ? " · the browser cannot read this image, so it goes to image models as a link and not to the video model" : ""}`);
      if (d.key()?.connected) void d.key()!.refreshBalance?.();
      running = null; spin.stop(); close();
    } catch (e) {
      // Stopped or timed out after the task was submitted: it may still be billed and lands in Runs (generate.ts).
      note.textContent = runErrorText(e as RunError, { "over-price": `The estimate is above the ${IMAGE_MAX_PRICE.toFixed(2)} USD limit for an image, so nothing was sent.` });
      d.say(note.textContent);
    } finally {
      running = null; runLabel.textContent = "Generate"; spin.stop(); render();
    }
  };
  for (const [id, kind] of [["genCharacter", "character"], ["genEnvironment", "environment"]] as const) d.$(id).onclick = () => (pop.hidden || state?.kind !== kind ? open(kind, d.$(id)) : close());
  window.addEventListener("pointerdown", e => { if (!pop.hidden && !running && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest(".gen-ref, #menu, .ref-use, #costDialog")) close(); });
  window.addEventListener("resize", () => { if (!pop.hidden) place(); });
  return { open, close, get isOpen() { return !pop.hidden; } };
}
