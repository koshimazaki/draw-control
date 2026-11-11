/**
 * The sequence library: named recipes saved in this browser (localStorage), plus the
 * committed sequences in examples/recipes/. A sequence is the recipe JSON itself, so a
 * downloaded file loads anywhere the recipe validator runs. Everything read back goes
 * through `validateRecipe`, so a stale or edited entry is refused instead of half-loaded.
 */
import { validateRecipe, type Recipe } from "@motion-studio/core";

export const LIBRARY_KEY = "motion-studio.sequences.v1";
export type StoreLike = Pick<Storage, "getItem" | "setItem">;
export type LibraryEntry = { name: string; savedAt: string; recipe: Recipe };

const NAME = /^[\w .,()+-]{1,60}$/u;
/** Clean a sequence name: 1–60 letters, digits, spaces and simple punctuation. */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return NAME.test(name) ? name : null;
}

/** Entries saved in the store, newest first; unreadable entries are skipped. */
export function readLibrary(store: StoreLike | null): LibraryEntry[] {
  let raw: unknown;
  try { raw = JSON.parse(store?.getItem(LIBRARY_KEY) ?? "{}"); } catch { return []; }
  if (!raw || typeof raw !== "object") return [];
  const out: LibraryEntry[] = [];
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    try {
      const e = v as { savedAt?: unknown; recipe?: unknown };
      if (!cleanName(name) || typeof e.savedAt !== "string") continue;
      out.push({ name, savedAt: e.savedAt, recipe: validateRecipe(e.recipe) });
    } catch { /* skip an entry the validator refuses */ }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function writeLibrary(store: StoreLike, entries: LibraryEntry[]) {
  const obj: Record<string, { savedAt: string; recipe: Recipe }> = {};
  for (const e of entries) obj[e.name] = { savedAt: e.savedAt, recipe: e.recipe };
  store.setItem(LIBRARY_KEY, JSON.stringify(obj));
}

/** Save (or overwrite) a named sequence. Throws when the name is not allowed or storage is full. */
export function saveSequence(store: StoreLike, rawName: string, recipe: Recipe, now = new Date()): LibraryEntry {
  const name = cleanName(rawName);
  if (!name) throw new Error("Name the sequence with 1–60 letters, digits, spaces or . , ( ) + -");
  const entry = { name, savedAt: now.toISOString(), recipe: validateRecipe(recipe) };
  writeLibrary(store, [entry, ...readLibrary(store).filter(e => e.name !== name)]);
  return entry;
}

export function deleteSequence(store: StoreLike, name: string) {
  writeLibrary(store, readLibrary(store).filter(e => e.name !== name));
}

/** A recipe from an uploaded or pasted .json file (the bare recipe, or a library entry). */
export function parseSequenceFile(text: string): Recipe {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file is not JSON."); }
  const inner = raw && typeof raw === "object" && "recipe" in raw ? (raw as { recipe: unknown }).recipe : raw;
  return validateRecipe(inner);
}

/** A file name for a download. */
export const fileNameFor = (name: string) => `${(cleanName(name) ?? "sequence").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "sequence"}.recipe.json`;

/** localStorage, or null where the browser blocks it (private windows, previews). */
export function browserStore(): StoreLike | null {
  try { const s = window.localStorage; s.getItem(LIBRARY_KEY); return s; } catch { return null; }
}
