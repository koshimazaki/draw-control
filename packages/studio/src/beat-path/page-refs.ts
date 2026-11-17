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

/** An image file the page can read: by its type, or by its name when the desktop sends none (HEIC is left out: browsers cannot draw it). */
export const isImageFile = (f: File) => f.type ? f.type.startsWith("image/") && !/hei[cf]/.test(f.type) : /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name);
/** During a drag from the desktop only the items' types can be read: does it carry an image? */
export const dragHasImage = (dt: DataTransfer | null) => [...(dt?.items ?? [])].some(i => i.kind === "file" && i.type.startsWith("image/"));
const HEIC = (files: File[]) => files.some(f => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name));

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
/**
 * A frame of a clip on another origin at `seconds` (a published clip in the Gallery), read from a second copy of it
 * opened in CORS mode: the clip on show plays without CORS, so a host without it still plays it. Null when the host
 * does not allow cross-site reads (the copy fails to load) or the frame does not arrive in time.
 */
export async function corsVideoFrame(src: string, seconds: number): Promise<Blob | null> {
  const v = Object.assign(document.createElement("video"), { crossOrigin: "anonymous", muted: true, playsInline: true, preload: "auto" });
  const settle = (ok: string, ms: number) => new Promise<boolean>(r => {
    const t = setTimeout(() => r(false), ms);
    v.addEventListener(ok, () => { clearTimeout(t); r(true); }, { once: true });
    v.addEventListener("error", () => { clearTimeout(t); r(false); }, { once: true });
  });
  try {
    const loaded = settle("loadeddata", 10_000);
    v.src = src;
    if (!(await loaded)) return null;
    if (seconds > 0 && Number.isFinite(v.duration)) { const seeked = settle("seeked", 5_000); v.currentTime = Math.min(seconds, v.duration); if (!(await seeked)) return null; }
    return await videoFrame(v);
  } catch { return null; }
  finally { v.removeAttribute("src"); v.load(); }
}

export function bindRefs(p: Page, store: RefStore, changed: () => void) {
  const { $ } = p;
  let extra: () => { label: string; take(got: { blob: Blob | string; source: RefSource }): void } | null = () => null;
  const getters = new Map<string, RefGetter>(), controls = new Map<HTMLElement, HTMLButtonElement>(), hosts = new Map<string, HTMLElement>();
  let nextId = 0, sweeping = false;
  /**
   * A gallery render replaces its rows (and their boxes) in one go: once it is done, the boxes no
   * longer in the page are forgotten, so their getters do not keep the old rows and videos alive.
   */
  const forgetGone = () => {
    if (sweeping) return;
    sweeping = true;
    setTimeout(() => {
      sweeping = false;
      for (const [id, h] of hosts) if (!h.isConnected) { hosts.delete(id); getters.delete(id); controls.delete(h); }
    }, 0);
  };

  async function use(kind: RefKind, get: RefGetter) {
    const got = await get();
    if (!got) { p.say("That image cannot be read here"); return; }
    store.set(p.slot, kind, got.blob, got.source);
    p.say(`${kind === "character" ? "Character" : "Environment"}: ${sourceLabel(got.source)}`);
  }

  /** Give an element (an image's box) the "Use as reference" control and make it draggable onto a drop. */
  function attach(host: HTMLElement, get: RefGetter, what = "this image") {
    const id = `r${nextId++}`;
    getters.set(id, get); hosts.set(id, host);
    forgetGone();
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

  const take = (k: (typeof KINDS)[number], file: File) => { store.set(p.slot, k.kind, file, { kind: "upload", name: file.name }); p.say(`${k.label}: ${file.name}`); };
  const unreadable = (files: File[]) => p.say(HEIC(files) ? "HEIC images cannot be read in the browser: export it as JPEG or PNG first" : "That file is not an image the page can read (PNG, JPEG, WebP, GIF, AVIF)");
  for (const k of KINDS) {
    const drop = $(k.drop), input = $<HTMLInputElement>(k.input);
    input.onchange = () => {
      const files = [...(input.files ?? [])], file = files.find(isImageFile);
      input.value = "";
      if (file) take(k, file); else if (files.length) unreadable(files);
    };
    // A drop takes an image dragged from the page or a file from the desktop; it lights up while anything is dragged over it.
    drop.addEventListener("dragover", e => {
      const types = [...(e.dataTransfer?.types ?? [])];
      if (!types.includes(DRAG_TYPE) && !types.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      drop.classList.add("target");
    });
    // Moving over the drop's own thumbnail or label is not leaving it.
    drop.addEventListener("dragleave", e => { if (!drop.contains(e.relatedTarget as Node | null)) drop.classList.remove("target"); });
    drop.addEventListener("drop", e => {
      drop.classList.remove("target");
      const id = e.dataTransfer?.getData(DRAG_TYPE), files = [...(e.dataTransfer?.files ?? [])], file = files.find(isImageFile);
      if (!id && !files.length) return;
      e.preventDefault(); e.stopPropagation();
      document.body.classList.remove("ref-dragging");
      if (id && getters.has(id)) void use(k.kind, getters.get(id)!);
      else if (file) take(k, file);
      else unreadable(files);
    });
    $(k.clear).addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); store.clear(p.slot, k.kind); p.say(`${k.label} reference cleared`); });
    // A filled drop's own image drags onto the other drop.
    attachDrag($(k.thumb), async () => { const r = store.get(p.slot, k.kind); return r ? { blob: r.blob ?? r.url, source: r.source } : null; });
  }
  // An image from the desktop lights both drops while it is over the page; dropped anywhere else, a menu asks which one it is.
  window.addEventListener("dragover", e => { if (dragHasImage(e.dataTransfer)) document.body.classList.add("ref-dragging"); });
  window.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("ref-dragging"); });
  window.addEventListener("dragend", () => document.body.classList.remove("ref-dragging"));
  window.addEventListener("drop", e => {
    document.body.classList.remove("ref-dragging");
    const files = [...(e.dataTransfer?.files ?? [])], file = files.find(isImageFile);
    if (!file) { if (HEIC(files)) unreadable(files); return; }
    e.preventDefault();
    p.menu.show($(KINDS[0].drop), `Use ${file.name} as`, KINDS.map(k => ({ label: k.label, run: () => take(k, file) })));
  });
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
      drop.dataset.tip = r ? `${k.label}: ${sourceLabel(r.source)}` : `${k.label === "Character" ? "A character sheet" : "An environment image"} the model follows · drop an image here or anywhere on the page, or use one from the page`;
    }
  }
  store.onChange(slot => { if (slot === p.slot) sync(); changed(); });
  /** Show or hide an image's control (a result that cannot be read has none). */
  const showControl = (host: HTMLElement, on: boolean) => { const b = controls.get(host); if (b) b.hidden = !on; host.draggable = on; };
  return { attach, sync, use, showControl, setExtra: (f: typeof extra) => { extra = f; } };
}
