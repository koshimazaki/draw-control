/**
 * Settings › Setup: save the whole page as a JSON file, and load one back from a `.json`, a guide
 * `.zip` (its setup.json) or an unzipped guide's folder. The format is setup-file.ts; finding the
 * file and the music to bring is setup-source.ts; page.ts loads it (one undo step).
 */
import { strToU8 } from "fflate";
import { download } from "../shared/download";
import type { Page } from "./page";
import { SETUP_DOWNLOAD, SETUP_FILE, readSetup, setupJson } from "./setup-file";
import { fromZip, musicKind, pickFromFolder, tooBig, type SetupSource } from "./setup-source";

/** The setup as a file for the guide zip. */
export const setupFiles = (p: Page) => ({ [SETUP_FILE]: strToU8(setupJson(p.state, p.info)) });

/**
 * Export and Generate refuse a shot whose recipe did not build (`p.unbuilt`: page.ts keeps the last
 * recipe on screen then, so a guide would be the old shot with this one's clip, prompt and audio).
 */
export function notBuilt(unbuilt: string | null, advance: boolean): string | null {
  if (!unbuilt) return null;
  // The engine's words without its plumbing (the command and script line, the CLI's hint).
  const why = unbuilt.replace(/^.*?script line \d+: /, "").replace(/\s*\(analyse a track first: --analysis\)/, "").replace(/\.$/, "");
  return `The shot is not built yet: ${why}. ${advance ? "Load its track, or turn off Next move on each hit (Settings, Camera…)." : "Undo, or change what that names."}`;
}
export const shotRefusal = (p: Pick<Page, "unbuilt" | "state">) => notBuilt(p.unbuilt, p.state.camLock.advance);

export function bindSetup(p: Page) {
  const $ = p.$, input = (id: string) => $<HTMLInputElement>(id);
  const BUSY = "The guide is rendering: load the setup when it is done";

  $("saveSetup").onclick = () => {
    download(setupJson(p.state, p.info), SETUP_DOWNLOAD, "application/json");
    const own = musicKind(p.state, p.info) === "own";
    p.say(`Saved ${SETUP_DOWNLOAD}${own ? `: your track "${p.info!.name}" is not in it, keep the file to load with it` : ""}`);
  };

  async function load(source: SetupSource, from: string) {
    if ("error" in source) { p.say(`Not loaded: ${source.error}`); return; }
    // Read without any track's hits: a wait for its own track's hits never refuses the file (setup-file.ts).
    const read = readSetup(source.text);
    if (!read.ok) { p.say(`Not loaded: ${read.error}`); return; }
    if (p.busy) { p.say(BUSY); return; }
    // Saved on Example 3 or 4, which left the page: it loads into Your own, its state and its groove as saved.
    if (read.retired && p.slot !== "own") { await p.switchSlot("own"); if (p.slot !== "own") return; }
    const done = await p.loadSetup(read.state, read.music, source.audio);
    if (!done) return;
    const retired = read.retired ? [`it was made on ${read.retired}, no longer on the page: loaded as Your own, as it was saved`] : [];
    const notes = [...retired, ...(done.note ? [done.note] : []), ...read.notes, ...(done.music ? ["Undo puts back the page, not the music"] : [])];
    // A shot that does not build (the music loaded lacks the hits it anchors on) is said first, never hidden behind "Loaded".
    const refusal = shotRefusal(p);
    p.say(`${refusal ? `${refusal} · the preview shows the last shot that built · ` : ""}Loaded the setup from ${from}${notes.length ? ` · ${notes.join(" · ")}` : ""}`);
  }
  const fail = (e: unknown) => p.say(`Not loaded: ${(e as Error).message}`);

  // One file: a setup .json, or a guide .zip.
  const file = input("setupFile");
  file.onchange = () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    if (p.busy) { p.say(BUSY); return; }
    const zip = /\.zip$/i.test(f.name) || f.type === "application/zip", big = tooBig(f.size, zip);
    if (big) { p.say(`Not loaded: ${big}`); return; }
    const read = zip ? f.arrayBuffer().then(b => fromZip(new Uint8Array(b))) : f.text().then(text => ({ text }));
    read.then(s => load(s, f.name)).catch(fail);
  };
  // A folder: an unzipped guide (setup.json, and audio.wav beside it).
  const folder = input("setupFolder");
  folder.onchange = () => {
    const files = [...(folder.files ?? [])].map(f => ({ file: f, path: f.webkitRelativePath || f.name, size: f.size }));
    folder.value = "";
    if (!files.length) return;
    if (p.busy) { p.say(BUSY); return; }
    const picked = pickFromFolder(files);
    if ("error" in picked) { p.say(`Not loaded: ${picked.error}`); return; }
    const name = picked.setup.path.split("/")[0] || "the folder";
    Promise.all([picked.setup.file.text(), picked.audio?.file.arrayBuffer()])
      .then(([text, audio]) => load({ text, ...(audio ? { audio: new Uint8Array(audio) } : {}) }, name)).catch(fail);
  };
}
