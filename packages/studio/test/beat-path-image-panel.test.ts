/**
 * The image panel's state (round 10, part 2): the suggested prompts, the two-step model choice,
 * what blocks Generate, the no-bound notice for token-priced models, the cost dialog's words; and
 * the reference store holding an image the browser could not fetch (a URL, no Blob).
 */
import { describe, expect, it } from "vitest";
import type { ImageFamilyInfo, ImageModelInfo } from "../src/beat-path/arena";
import { IMAGE_MAX_PRICE, blocker, chooseFamily, imageCostText, initialState, modelOf, needsUnpriced, suggestPrompt, unpricedNotice } from "../src/beat-path/image-panel";
import { RefStore } from "../src/beat-path/ref-store";

const model = (key: string, family: string, kind: ImageModelInfo["pricing"]["kind"], refs = 4): ImageModelInfo => ({
  key, name: key.toUpperCase(), family, accepts: { referenceImages: { max: refs } }, prompt: { min: 2, max: 3000 },
  size: { summary: "256-2048 px", default: [1024, 1024] }, estimate: { usd: kind === "token" ? null : 0.02 }, pricing: { kind, summary: kind === "token" ? "$5 per 1M input tokens, $40 per 1M output tokens" : "$0.02 per image" },
});
const FAMILIES: ImageFamilyInfo[] = [
  { family: "FLUX", models: [model("klein", "FLUX", "compute-time"), model("flux-3", "FLUX", "per-image")] },
  { family: "OpenAI GPT Image", models: [model("flare", "OpenAI GPT Image", "token", 16)] },
  { family: "Kling IMAGE", models: [model("kling", "Kling IMAGE", "per-image", 1)] },
];
const SHOT = { subject: "a courier in a yellow raincoat", environment: "a rainy market street at dusk" };

describe("image panel state", () => {
  it("suggests a character sheet from the subject, a view from the environment", () => {
    expect(suggestPrompt("character", SHOT)).toMatch(/^A character sheet of a courier in a yellow raincoat: front, side and back views/);
    expect(suggestPrompt("environment", SHOT)).toMatch(/^A rainy market street at dusk, an empty wide view/);
    expect(suggestPrompt("character", { subject: "", environment: "" })).toMatch(/the character/);
  });
  it("opens on a per-image model; a family picks its first model", () => {
    const s = initialState("character", SHOT, FAMILIES);
    expect([s.family, s.model]).toEqual(["FLUX", "flux-3"]);
    expect(chooseFamily(s, FAMILIES, "OpenAI GPT Image").model).toBe("flare");
    expect(chooseFamily(s, FAMILIES, "nope")).toBe(s);
  });
  it("blocks Generate on a bad prompt, too many references or no key", () => {
    const s = initialState("character", SHOT, FAMILIES), kling = modelOf(FAMILIES, "kling");
    expect(blocker(s, modelOf(FAMILIES, "flux-3"), true, false)).toBeNull();
    expect(blocker({ ...s, prompt: "a" }, kling, true, false)).toMatch(/2–3000 characters/);
    expect(blocker({ ...s, refs: [{ image: "x", source: { kind: "upload", name: "a" }, label: "a" }, { image: "y", source: { kind: "upload", name: "b" }, label: "b" }] }, kling, true, false)).toMatch(/up to 1 reference image$/);
    expect(blocker(s, kling, false, false)).toMatch(/key/);
    expect(blocker(s, kling, false, true)).toBeNull();
  });
  it("says plainly that a token-priced model has no published bound", () => {
    const flare = modelOf(FAMILIES, "flare")!;
    expect(needsUnpriced(flare)).toBe(true);
    expect(needsUnpriced(modelOf(FAMILIES, "flux-3"))).toBe(false);
    expect(unpricedNotice(flare)).toMatch(/no upper price.*cannot cap it at 0\.50 USD.*Rates: \$5 per 1M input tokens/);
    expect(imageCostText({ usd: 0.21, modelName: "FLARE", inputs: [{ role: "reference" }], priced: "unpriced", rates: "$40 per 1M output tokens", examples: "1024² ≈ $0.21" }, ""))
      .toBe("No published upper price on FLARE. Runware's highest published example: 0.210 USD (not a cap). Rates: $40 per 1M output tokens. Examples: 1024² ≈ $0.21. It sends the prompt and 1 reference image.");
    expect(imageCostText({ usd: 0.02, modelName: "SEEDREAM", inputs: [] }, " Local preview.")).toBe(`Up to 0.020 USD on SEEDREAM (limit ${IMAGE_MAX_PRICE.toFixed(2)} USD). It sends the prompt. Local preview.`);
  });
});

describe("reference store: an image the browser could not fetch", () => {
  it("keeps the URL, gives no Blob to the video model, and never revokes a URL it did not make", () => {
    const revoked: string[] = [];
    const s = new RefStore({ create: () => "blob:x", revoke: u => revoked.push(u) });
    s.set("0", "character", "https://im.runware.ai/image/abc.png", { kind: "generated", model: "SEEDREAM", prompt: "p" });
    expect(s.get("0", "character")).toMatchObject({ blob: null, url: "https://im.runware.ai/image/abc.png" });
    expect(s.blobs("0")).toEqual({});
    s.set("0", "character", new Blob(["a"], { type: "image/png" }), { kind: "upload", name: "a.png" });
    s.clear("0", "character");
    expect(revoked).toEqual(["blob:x"]);
  });
});

describe("round 11: size, estimate and the compose request", () => {
  const h3 = { ...model("h3-image", "MiniMax H3", "token", 16), estimate: { usd: 0.03 } };
  it("always sends MiniMax H3 a size; the prompt's orientation follows the size sent", async () => {
    const { sizeFor } = await import("../src/beat-path/image-panel");
    expect(sizeFor(h3)).toEqual({ size: { width: 1280, height: 720 }, orientation: "landscape" });
    expect(sizeFor(model("flux-3", "FLUX", "per-image"))).toEqual({ orientation: "square" });
    expect(sizeFor({ ...model("tall", "X", "per-image"), size: { summary: "", default: [768, 1344] } }).orientation).toBe("portrait");
  });
  it("H3 with an estimate runs under the cap; GPT without one needs the no-bound notice", () => {
    expect(needsUnpriced(h3)).toBe(false);
    expect(needsUnpriced(modelOf(FAMILIES, "flare"))).toBe(true);
  });
  it("shows the embed's estimate words as they are", () => {
    expect(imageCostText({ usd: 0.031, modelName: "H3", basis: "about $0.031: an estimate, not a strict bound", inputs: [], priced: "estimate" }, ""))
      .toBe("H3: about $0.031: an estimate, not a strict bound. Limit 0.50 USD. It sends the prompt.");
  });
  it("asks composeImagePrompt for the drop's kind, the shot's words and the references' roles", async () => {
    const { composeInput } = await import("../src/beat-path/image-panel");
    const s = initialState("environment", SHOT, FAMILIES);
    expect(composeInput(s, SHOT, [{ role: "character" }], modelOf(FAMILIES, s.model)))
      .toEqual({ model: "flux-3", kind: "environment", subject: "a rainy market street at dusk", references: [{ role: "character" }], orientation: "square" });
  });
});
