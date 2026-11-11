/**
 * Sequence panel: Save, Save as, Load and Delete in the browser library, the committed
 * sequences in examples/recipes/, and download / upload of the recipe .json. Loading is
 * an ordinary edit, so it can be undone.
 */
import type { Recipe } from "@motion-studio/core/internal";
import { download } from "./export/button";
import { browserStore, cleanName, deleteSequence, fileNameFor, parseSequenceFile, readLibrary, saveSequence } from "./sequence-library";
import { $ } from "./ui";

export const SEQUENCE_LAYOUT = `
    <section>
      <h2>Sequence</h2>
      <div class="row"><input id="seqName" type="text" maxlength="60" placeholder="untitled" aria-label="Sequence name" />
        <button id="seqSave" type="button">Save</button><button id="seqSaveAs" type="button">Save as…</button></div>
      <div class="row"><select id="seqLibrary" aria-label="Sequence library"></select>
        <button id="seqLoad" type="button">Load</button><button id="seqDelete" type="button">Delete</button></div>
      <div class="row"><button id="seqDownload" type="button">Download .json</button>
        <label class="file">Upload .json <input id="seqUpload" type="file" accept=".json,application/json" /></label></div>
      <p id="seqStatus" class="muted"></p>
    </section>`;

/** Committed sequences (examples/recipes/*.json), bundled at build time. */
const COMMITTED = import.meta.glob("../../../examples/recipes/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const committed = () => Object.entries(COMMITTED).map(([path, recipe]) => ({ name: path.split("/").pop()!.replace(/\.json$/, ""), recipe }))
  .sort((a, b) => a.name.localeCompare(b.name));

export type SequenceHost = { recipe(): Recipe; load(r: Recipe): void };

export function bindSequencePanel(host: SequenceHost) {
  const store = browserStore();
  const say = (t: string) => { $("seqStatus").textContent = t; };
  const nameInput = $<HTMLInputElement>("seqName"), select = $<HTMLSelectElement>("seqLibrary");

  function fill(selected?: string) {
    select.replaceChildren();
    const group = (label: string, items: { value: string; text: string }[]) => {
      if (!items.length) return;
      const g = document.createElement("optgroup");
      g.label = label;
      for (const it of items) g.appendChild(Object.assign(document.createElement("option"), { value: it.value, textContent: it.text }));
      select.appendChild(g);
    };
    group("Saved in this browser", readLibrary(store).map(e => ({ value: `lib:${e.name}`, text: `${e.name} · ${e.savedAt.slice(0, 16).replace("T", " ")}` })));
    group("Examples (examples/recipes)", committed().map(c => ({ value: `ex:${c.name}`, text: c.name })));
    if (selected) select.value = selected;
  }

  function save(name: string) {
    if (!store) { say("This browser blocks local storage: use Download .json instead."); return; }
    try {
      const e = saveSequence(store, name, host.recipe());
      nameInput.value = e.name;
      fill(`lib:${e.name}`);
      say(`Saved "${e.name}" in this browser.`);
    } catch (err) { say((err as Error).message); }
  }

  $("seqSave").onclick = () => save(nameInput.value || "untitled");
  $("seqSaveAs").onclick = () => {
    const name = window.prompt("Save the sequence as", nameInput.value ? `${nameInput.value} copy` : "untitled");
    if (name !== null) save(name);
  };
  $("seqLoad").onclick = () => {
    const v = select.value;
    try {
      if (v.startsWith("lib:")) {
        const e = readLibrary(store).find(x => x.name === v.slice(4));
        if (!e) throw new Error("That sequence is no longer saved.");
        host.load(e.recipe); nameInput.value = e.name; say(`Loaded "${e.name}".`);
      } else if (v.startsWith("ex:")) {
        const c = committed().find(x => x.name === v.slice(3));
        if (!c) throw new Error("Unknown example.");
        host.load(parseSequenceFile(JSON.stringify(c.recipe))); nameInput.value = c.name; say(`Loaded the example "${c.name}".`);
      }
    } catch (err) { say((err as Error).message); }
  };
  $("seqDelete").onclick = () => {
    const v = select.value;
    if (!v.startsWith("lib:") || !store) { say("Only sequences saved in this browser can be deleted here."); return; }
    deleteSequence(store, v.slice(4));
    fill();
    say(`Deleted "${v.slice(4)}" from this browser.`);
  };
  $("seqDownload").onclick = () => {
    const name = cleanName(nameInput.value) ?? "sequence";
    download(JSON.stringify(host.recipe(), null, 2) + "\n", fileNameFor(name), "application/json");
  };
  $<HTMLInputElement>("seqUpload").onchange = async () => {
    const input = $<HTMLInputElement>("seqUpload"), f = input.files?.[0];
    input.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { say("Keep recipe files below 8 MB."); return; }
    try {
      host.load(parseSequenceFile(await f.text()));
      nameInput.value = cleanName(f.name.replace(/(\.recipe)?\.json$/i, "")) ?? "";
      say(`Loaded ${f.name}. Save it to keep it in the library.`);
    } catch (err) { say(`Could not load ${f.name}: ${(err as Error).message}`); }
  };
  fill();
}
