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
import { beatPathRecipe } from "./recipe-map";

/** The setup as a file for the guide zip. */
export const setupFiles = (p: Page) => ({ [SETUP_FILE]: strToU8(setupJson(p.state, p.info)) });

/** The hits of the track loaded, as the page builds its recipe with them. */
const hitsOf = (p: Page) => (p.drive ? { drive: p.drive, bands: p.drive.bands } : {});
/** Does the page's state build now, with the music loaded (the camera's next move on each hit needs its hits)? */
const buildsNow = (p: Page) => { try { beatPathRecipe(p.state, p.info, hitsOf(p)); return true; } catch { return false; } };

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
    // Checked against the track loaded now; a wait for other hits never refuses the file (setup-file.ts).
    const read = readSetup(source.text, hitsOf(p));
    if (!read.ok) { p.say(`Not loaded: ${read.error}`); return; }
    if (p.busy) { p.say(BUSY); return; }
    const done = await p.loadSetup(read.state, read.music, source.audio);
    if (!done) return;
    const notes = [...(done.note ? [done.note] : []), ...read.notes,
      ...(read.waitsForHits && !buildsNow(p) ? ["the camera's next move on each hit lands once its track is loaded"] : []), ...(done.music ? ["Undo puts back the page, not the music"] : [])];
    p.say(`Loaded the setup from ${from}${notes.length ? ` · ${notes.join(" · ")}` : ""}`);
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
