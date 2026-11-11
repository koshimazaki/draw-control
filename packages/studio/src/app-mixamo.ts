/**
 * Mixamo clips in the studio: "Add Mixamo clips" (file picker), drag and drop of an
 * animation-only FBX or GLB, and in dev "Load local Mixamo clips" (assets-local/mixamo/).
 * Each clip is retargeted onto the rigged mannequin and shows up in its palette and the
 * move lane brush as "mixamo/<name>", played at its natural speed.
 */
import { makeClipMove, type Recipe } from "@motion-studio/core";
import { fetchLocalMixamo, importMixamo, importedClip, importedClips, localMixamoFiles, parseAnimation, MIXAMO_PREFIX } from "./characters/mixamo-import";
import type { RiggedCharacter } from "./characters/rigged";
import { $ } from "./ui";

export type MixamoHost = {
  ensureRigged(): Promise<RiggedCharacter>;
  /** Called after clips were added (refresh the palette and brush). */
  changed(): void;
};

/** A move playing an imported clip at its natural speed. */
export function importedMove(clip: string, atBeat: number, recipe: Recipe): Recipe["moves"][number] | null {
  const c = importedClip(clip);
  if (!c) return null;
  const cycle = Math.max(0.25, Math.min(64, Math.round(c.seconds * recipe.beatGrid.bpm / 60 * 10000) / 10000));
  return makeClipMove(clip, atBeat, cycle, { id: `${clip.slice(MIXAMO_PREFIX.length).replace(/[^\w-]/g, "_")}-${atBeat}`.slice(0, 40) });
}

export function bindMixamo(host: MixamoHost) {
  const say = (t: string) => { $("mixamoStatus").textContent = t; };

  async function add(files: { name: string; bytes: () => Promise<ArrayBuffer> }[]) {
    const rigged = await host.ensureRigged();
    const done: string[] = [], failed: string[] = [];
    for (const f of files) {
      try {
        say(`Retargeting ${f.name}…`);
        const parsed = await parseAnimation(await f.bytes(), f.name);
        const c = await importMixamo(parsed, f.name, rigged);
        done.push(`${c.name.slice(MIXAMO_PREFIX.length)} (${c.seconds.toFixed(1)} s, ${c.report.mapped} bones)`);
      } catch (e) { failed.push(`${f.name}: ${(e as Error).message}`); }
    }
    say([done.length ? `Added ${done.join(", ")}. Pick them in the clip palette or the move brush.` : "", ...failed].filter(Boolean).join(" "));
    host.changed();
  }

  /** Handle a dropped .fbx/.glb if it is an animation-only Mixamo file; false leaves it to the character loader. */
  async function tryDrop(file: File): Promise<boolean> {
    try {
      const bytes = await file.arrayBuffer();
      const parsed = await parseAnimation(bytes, file.name);
      if (parsed.skinned || parsed.mixamoBones < 10) return false;
      await add([{ name: file.name, bytes: async () => bytes }]);
      return true;
    } catch { return false; }
  }

  const picker = $<HTMLInputElement>("mixamoFiles");
  picker.onchange = () => {
    const files = [...(picker.files ?? [])];
    picker.value = "";
    void add(files.map(f => ({ name: f.name, bytes: () => f.arrayBuffer() })));
  };
  void localMixamoFiles().then(list => {
    const b = $<HTMLButtonElement>("mixamoLocal");
    b.hidden = !list.length;
    b.textContent = `Load local Mixamo clips (${list.length})`;
    b.onclick = () => void add(list.map(name => ({ name, bytes: () => fetchLocalMixamo(name) })));
  });

  return { tryDrop, names: () => importedClips().map(c => c.name), clips: importedClips };
}
