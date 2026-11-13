/**
 * The reference images per example: a Character and an Environment image, each a Blob with
 * one object URL for showing it, and where it came from (uploaded, a gallery image, a frame of
 * the guide or a result at a time, or, coming in part 2, an image generated with a model and a
 * prompt). Replacing or clearing a reference releases its URL. Never in the recipe or the script.
 */
export type RefKind = "character" | "environment";
export type RefSource =
  | { kind: "upload"; name: string }
  | { kind: "gallery"; label: string }
  | { kind: "frame"; of: "preview" | "result" | "guide"; seconds: number }
  | { kind: "generated"; model: string; prompt: string };
export type Ref = { blob: Blob; url: string; source: RefSource };

/** Where a reference came from, in words (its drop's tooltip). */
export function sourceLabel(s: RefSource): string {
  switch (s.kind) {
    case "upload": return `uploaded: ${s.name}`;
    case "gallery": return `from the gallery: ${s.label}`;
    case "frame": return `frame of the ${s.of === "preview" ? "preview" : s.of === "guide" ? "guide" : "result"} at ${s.seconds.toFixed(1)} s`;
    case "generated": return `generated with ${s.model}: ${s.prompt.length > 80 ? `${s.prompt.slice(0, 77)}…` : s.prompt}`;
  }
}

export class RefStore {
  private slots = new Map<string, Partial<Record<RefKind, Ref>>>();
  private listeners = new Set<(slot: string, kind: RefKind) => void>();
  constructor(private urls: { create(b: Blob): string; revoke(u: string): void } = { create: b => URL.createObjectURL(b), revoke: u => URL.revokeObjectURL(u) }) {}

  get(slot: string, kind: RefKind): Ref | undefined { return this.slots.get(slot)?.[kind]; }
  /** The blobs the generator and the prompt read (the same shape as before). */
  blobs(slot: string): { character?: Blob; environment?: Blob } {
    const s = this.slots.get(slot) ?? {};
    return { ...(s.character ? { character: s.character.blob } : {}), ...(s.environment ? { environment: s.environment.blob } : {}) };
  }
  set(slot: string, kind: RefKind, blob: Blob, source: RefSource): Ref {
    const s = this.slots.get(slot) ?? {}, old = s[kind];
    if (old) this.urls.revoke(old.url);
    const ref: Ref = { blob, url: this.urls.create(blob), source };
    this.slots.set(slot, { ...s, [kind]: ref });
    for (const f of this.listeners) f(slot, kind);
    return ref;
  }
  clear(slot: string, kind: RefKind) {
    const s = this.slots.get(slot), old = s?.[kind];
    if (!s || !old) return;
    this.urls.revoke(old.url);
    const next = { ...s };
    delete next[kind];
    this.slots.set(slot, next);
    for (const f of this.listeners) f(slot, kind);
  }
  onChange(f: (slot: string, kind: RefKind) => void) { this.listeners.add(f); return () => this.listeners.delete(f); }
}
