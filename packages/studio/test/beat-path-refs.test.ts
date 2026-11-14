/**
 * The reference store (round 10): set, replace and clear a Character or Environment image per
 * example; each image's object URL is released when it is replaced or cleared; the source label;
 * the blobs the generator reads; a generated image (part 2) as a source.
 */
import { describe, expect, it } from "vitest";
import { RefStore, sourceLabel } from "../src/beat-path/ref-store";
import { dragHasImage, isImageFile } from "../src/beat-path/page-refs";

function store() {
  const live = new Set<string>(), revoked: string[] = [];
  let n = 0;
  const s = new RefStore({ create: () => { const u = `blob:test/${n++}`; live.add(u); return u; }, revoke: u => { live.delete(u); revoked.push(u); } });
  return { s, live, revoked };
}
const img = (text: string) => new Blob([text], { type: "image/png" });

describe("reference store", () => {
  it("sets, replaces (releasing the old URL) and clears per example", () => {
    const { s, live, revoked } = store();
    const changes: string[] = [];
    s.onChange((slot, kind) => changes.push(`${slot}:${kind}`));
    const a = s.set("0", "character", img("a"), { kind: "upload", name: "hero.png" });
    expect(s.get("0", "character")?.url).toBe(a.url);
    const b = s.set("0", "character", img("b"), { kind: "gallery", label: "Example 2, character" });
    expect(revoked).toEqual([a.url]);
    expect(live.has(b.url)).toBe(true);
    s.set("1", "environment", img("c"), { kind: "frame", of: "preview", seconds: 3.24 });
    expect(Object.keys(s.blobs("0"))).toEqual(["character"]);
    expect(Object.keys(s.blobs("1"))).toEqual(["environment"]);
    s.clear("0", "character");
    expect(s.get("0", "character")).toBeUndefined();
    expect(revoked).toEqual([a.url, b.url]);
    expect(live.size).toBe(1);
    s.clear("0", "character");   // nothing to clear: no change
    expect(changes).toEqual(["0:character", "0:character", "1:environment", "0:character"]);
  });
  it("says where an image came from", () => {
    expect(sourceLabel({ kind: "upload", name: "hero.png" })).toBe("uploaded: hero.png");
    expect(sourceLabel({ kind: "gallery", label: "Example 2, character" })).toBe("from the gallery: Example 2, character");
    expect(sourceLabel({ kind: "frame", of: "preview", seconds: 3.24 })).toBe("frame of the preview at 3.2 s");
    expect(sourceLabel({ kind: "frame", of: "result", seconds: 1 })).toBe("frame of the result at 1.0 s");
    expect(sourceLabel({ kind: "generated", model: "FLUX", prompt: "a red car" })).toBe("generated with FLUX: a red car");
  });
});

describe("Images dropped from the desktop", () => {
  const file = (name: string, type: string) => new File(["x"], name, { type });
  it("reads an image by its type, or by its name when the desktop sends no type; HEIC and non-images are refused", () => {
    expect(isImageFile(file("hero.png", "image/png"))).toBe(true);
    expect(isImageFile(file("street.webp", ""))).toBe(true);
    expect(isImageFile(file("photo.JPEG", ""))).toBe(true);
    expect(isImageFile(file("IMG_0001.HEIC", "image/heic"))).toBe(false);
    expect(isImageFile(file("IMG_0001.heic", ""))).toBe(false);
    expect(isImageFile(file("beat.wav", "audio/wav"))).toBe(false);
    expect(isImageFile(file("notes.txt", ""))).toBe(false);
  });
  it("a drag carrying an image file lights the reference drops; a track or a page drag does not", () => {
    const dt = (items: { kind: string; type: string }[]) => ({ items }) as unknown as DataTransfer;
    expect(dragHasImage(dt([{ kind: "file", type: "image/png" }]))).toBe(true);
    expect(dragHasImage(dt([{ kind: "file", type: "audio/wav" }]))).toBe(false);
    expect(dragHasImage(dt([{ kind: "string", type: "application/x-beat-path-ref" }]))).toBe(false);
    expect(dragHasImage(null)).toBe(false);
  });
});
