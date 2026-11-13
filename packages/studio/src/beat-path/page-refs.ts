/**
 * Any image in the page can become a reference: the Character and Environment drops (a file
 * from the desktop, or an image dragged from the page), a small "Use as reference" control on
 * gallery images, the guide, the preview and a result (a frame at the current time), and a
 * clear button on a filled drop. The images live in a RefStore per example; the drop's tooltip
 * says where its image came from. Split from page-generate.ts.
 */
import { icon } from "./ui/icons";
import { RefStore, sourceLabel, type RefKind, type RefSource } from "./ref-store";
import type { MenuItem } from "./lanes";

type Page = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  slot: string;
  menu: { show(anchor: HTMLElement, title: string, items: MenuItem[]): void };
  say(text: string): void;
};
/** What a "Use as reference" control or a drag hands over: the image and where it came from. */
export type RefGetter = () => Promise<{ blob: Blob | string; source: RefSource } | null>;

const DRAG_TYPE = "application/x-beat-path-ref";
const KINDS: { kind: RefKind; drop: string; thumb: string; input: string; clear: string; label: string }[] = [
  { kind: "character", drop: "dropCharacter", thumb: "thumbCharacter", input: "refCharacter", clear: "clearCharacter", label: "Character" },
  { kind: "environment", drop: "dropEnvironment", thumb: "thumbEnvironment", input: "refEnvironment", clear: "clearEnvironment", label: "Environment" },
];

/** A still of a playing or paused video at its current time (null if the browser cannot read it). */
export async function videoFrame(video: HTMLVideoElement): Promise<Blob | null> {
  // A video not drawn yet (below the fold, just re-rendered) gets up to three seconds to load its first frame.
  if (!video.videoWidth || video.readyState < 2) {
    if (video.preload === "none") video.preload = "auto";
    await new Promise<void>(r => { const t = setTimeout(r, 3000); video.addEventListener("loadeddata", () => { clearTimeout(t); r(); }, { once: true }); video.load?.(); });
  }
  if (!video.videoWidth) return null;
  const c = Object.assign(document.createElement("canvas"), { width: video.videoWidth, height: video.videoHeight });
  c.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise(r => c.toBlob(b => r(b), "image/png"));
}
/** A video the page may read frames from: its own blob URLs and same-origin files. A remote result (another origin, no CORS) would taint the canvas. */
export const readableVideo = (src: string) => src.startsWith("blob:") || new URL(src, location.href).origin === location.origin;

export function bindRefs(p: Page, store: RefStore, changed: () => void) {
  const { $ } = p;
  let extra: () => { label: string; take(got: { blob: Blob | string; source: RefSource }): void } | null = () => null;
  const getters = new Map<string, RefGetter>(), controls = new Map<HTMLElement, HTMLButtonElement>();
  let nextId = 0;

  async function use(kind: RefKind, get: RefGetter) {
    const got = await get();
    if (!got) { p.say("That image cannot be read here"); return; }
    store.set(p.slot, kind, got.blob, got.source);
    p.say(`${kind === "character" ? "Character" : "Environment"}: ${sourceLabel(got.source)}`);
  }

  /** Give an element (an image's box) the "Use as reference" control and make it draggable onto a drop. */
  function attach(host: HTMLElement, get: RefGetter, what = "this image") {
    const id = `r${nextId++}`;
    getters.set(id, get);
    host.classList.add("ref-host");
    const b = document.createElement("button");
    b.type = "button"; b.className = "ref-use tip-end";
    b.setAttribute("aria-label", `Use ${what} as a reference`); b.dataset.tip = `Use ${what} as a reference`;
    b.innerHTML = icon("image-plus");
    b.addEventListener("click", e => {
      e.stopPropagation(); e.preventDefault();
      // While the image panel is open, a third target: its own references.
      const more = extra(), items: MenuItem[] = KINDS.map(k => ({ label: k.label, run: () => void use(k.kind, get) }));
      if (more) items.push({ label: more.label, run: () => void get().then(g => { if (g) more.take(g); else p.say("That image cannot be read here"); }) });
      p.menu.show(b, "Use as reference", items);
    });
    b.addEventListener("pointerdown", e => e.stopPropagation());
    host.append(b);
    host.draggable = true;
    controls.set(host, b);
    host.addEventListener("dragstart", e => {
      e.dataTransfer?.setData(DRAG_TYPE, id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      document.body.classList.add("ref-dragging");
    });
    host.addEventListener("dragend", () => document.body.classList.remove("ref-dragging"));
  }

  for (const k of KINDS) {
    const drop = $(k.drop), input = $<HTMLInputElement>(k.input);
    input.onchange = () => {
      const file = input.files?.[0];
      input.value = "";
      if (file && file.type.startsWith("image/")) { store.set(p.slot, k.kind, file, { kind: "upload", name: file.name }); p.say(`${k.label}: ${file.name}`); }
    };
    // A drop takes an image dragged from the page or a file from the desktop; it lights up while anything is dragged over it.
    drop.addEventListener("dragover", e => {
      const types = [...(e.dataTransfer?.types ?? [])];
      if (!types.includes(DRAG_TYPE) && !types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      drop.classList.add("target");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("target"));
    drop.addEventListener("drop", e => {
      drop.classList.remove("target");
      const id = e.dataTransfer?.getData(DRAG_TYPE), file = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith("image/"));
      if (!id && !file) return;
      e.preventDefault(); e.stopPropagation();
      document.body.classList.remove("ref-dragging");
      if (id && getters.has(id)) void use(k.kind, getters.get(id)!);
      else if (file) { store.set(p.slot, k.kind, file, { kind: "upload", name: file.name }); p.say(`${k.label}: ${file.name}`); }
    });
    $(k.clear).addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); store.clear(p.slot, k.kind); p.say(`${k.label} reference cleared`); });
    // A filled drop's own image drags onto the other drop.
    attachDrag($(k.thumb), async () => { const r = store.get(p.slot, k.kind); return r ? { blob: r.blob ?? r.url, source: r.source } : null; });
  }
  function attachDrag(el: HTMLElement, get: RefGetter) {
    const id = `r${nextId++}`;
    getters.set(id, get);
    el.draggable = true;
    el.addEventListener("dragstart", e => { e.dataTransfer?.setData(DRAG_TYPE, id); document.body.classList.add("ref-dragging"); });
    el.addEventListener("dragend", () => document.body.classList.remove("ref-dragging"));
  }

  /** Show the current example's references in the drops: thumbnail, clear button, where it came from. */
  function sync() {
    for (const k of KINDS) {
      const r = store.get(p.slot, k.kind), thumb = $(k.thumb), drop = $(k.drop);
      thumb.style.backgroundImage = r ? `url(${r.url})` : "";
      thumb.classList.toggle("set", !!r);
      $(k.clear).hidden = !r;
      drop.dataset.tip = r ? `${k.label}: ${sourceLabel(r.source)}` : `${k.label === "Character" ? "A character sheet" : "An environment image"} the model follows · drop an image or use one from the page`;
    }
  }
  store.onChange(slot => { if (slot === p.slot) sync(); changed(); });
  /** Show or hide an image's control (a result that cannot be read has none). */
  const showControl = (host: HTMLElement, on: boolean) => { const b = controls.get(host); if (b) b.hidden = !on; host.draggable = on; };
  return { attach, sync, use, showControl, setExtra: (f: typeof extra) => { extra = f; } };
}
