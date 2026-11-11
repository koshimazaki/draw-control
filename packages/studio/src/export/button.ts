/** The Export button: renders the bundle frame by frame and downloads the zip. Split from app.ts. */
import type { AudioDrive, Recipe } from "@motion-studio/core/internal";
import type { Track } from "../audio";
import { $ } from "../ui";
import type { Viewport } from "../viewport";
import { exportBundle } from "./bundle";
import { currentRange, exportSize } from "./panel";

export type ExportHost = {
  recipe(): Recipe;
  viewport: Viewport;
  track(): Track | null;
  drive(): AudioDrive;
  say(id: string, text: string): void;
  render(): void;
  setExporting(on: boolean): void;
};

export function bindExport(host: ExportHost) {
  let exporting = false;
  $("export").onclick = async () => {
    if (exporting) return;
    exporting = true;
    host.setExporting(true);
    const recipe = host.recipe(), track = host.track();
    const { width, height } = exportSize();
    const range = currentRange(recipe);
    const done = () => { exporting = false; host.setExporting(false); };
    if (range instanceof Error) { host.say("exportStatus", `Export range: ${range.message}`); done(); return; }
    const bar = $<HTMLProgressElement>("exportProgress");
    bar.hidden = false;
    host.say("exportStatus", "Rendering frame by frame…");
    try {
      const result = await exportBundle({ recipe, range, viewport: host.viewport, width, height, audio: track?.buffer ?? null, drive: host.drive(),
        onProgress: (d, t) => { bar.value = d / t; } });
      download(result.zip, "guide-bundle.zip", "application/zip");
      host.say("exportStatus", `Exported ${result.frames} frames from frame ${range.startFrame} (${(result.frames / recipe.fps).toFixed(2)} s, ${result.codec}), ` +
        `${(result.zip.length / 1e6).toFixed(1)} MB zip. Audio ${track ? (result.audioInVideo ? "muxed into the MP4 and" : "not muxed (no AAC encoder);") + " saved as audio.wav" : "none"}.`);
    } catch (e) { host.say("exportStatus", `Export failed: ${(e as Error).message}`); }
    finally { done(); bar.hidden = true; host.render(); }
  };
}

export function download(bytes: Uint8Array | string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
