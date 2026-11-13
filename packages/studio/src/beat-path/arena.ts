/**
 * The Model Arena embed (vendor/model-arena/, `npm run vendor:arena`), loaded by a relative
 * URL so it works from any static folder: the key panel, the models and their composed
 * prompts, generateFromGuide(), the result player and the gallery. Without it the page still
 * works (the key slot shows a placeholder, Generate says what is missing).
 *
 * A local fake provider (on in dev, or `?fake=1`) answers the API's three task types with
 * the guide itself as the "result", so the layout can be judged with no key and no paid call.
 */
export type ArenaModel = { key: string; name: string; line: string };
export type ArenaResult = { videoURL: string; costUsd: number | null; modelRan: string | null; notes: string[]; record: unknown; estimate?: { usd?: number } };
/** An image model from the embed's catalogue (imageFamilies()): plain data for a picker. */
export type ImageModelInfo = {
  key: string; name: string; family: string;
  accepts: { referenceImages: { max: number }; quality?: { values: string[]; default: string } | null };
  prompt: { min: number; max: number };
  size: { summary: string; default: [number, number] };
  estimate: { usd: number | null };
  pricing: { kind: "per-image" | "token" | "compute-time"; summary: string };
  /** The Runware prompting guide this model's prompts follow (url null: none published, `note` says so), and short tips. */
  guide?: { url: string | null; note?: string };
  tips?: string[];
};
/** composeImagePrompt's input (the embed's image-compose.ts). */
export type ComposeImageInput = {
  model: string; kind: "character" | "environment" | "free"; subject: string; style?: string; light?: string; camera?: string;
  references?: { role: "character" | "environment" | "other"; note?: string }[]; orientation?: "landscape" | "portrait" | "square";
};
export type ImageFamilyInfo = { family: string; models: ImageModelInfo[] };
/** What the embed asks before a run (generateFromGuide and generateImage): images may be "unpriced" (no published bound). */
export type CostQuestion = { model: string; modelName: string; usd: number; basis?: string; maxPrice: number; inputs: unknown[]; prompt: string; priced?: "bound" | "estimate" | "unpriced"; rates?: string; examples?: string };
export type ImageResult = { imageURL: string; costUsd: number | null; modelRan: string; notes: string[]; taskUUID: string };
export type ArenaModule = {
  generateFromGuide(o: Record<string, unknown>): Promise<ArenaResult>;
  imageFamilies?(): ImageFamilyInfo[];
  generateImage?(o: Record<string, unknown>): Promise<ImageResult>;
  composeImagePrompt?(o: ComposeImageInput): { prompt: string; notes: string[] };
  offeredModels(): ArenaModel[];
  composePrompt(shot: Record<string, string>, model: string, references?: { character?: unknown; environment?: unknown }, guide?: { seconds?: number; hasAudio?: boolean }): { prompt: string; notes: string[] };
};
export type ArenaKeyElement = HTMLElement & { connected: boolean; getKey(): string | undefined; balance?: number | null; refreshBalance?(): Promise<number | null> };

let loading: Promise<ArenaModule | null> | null = null;
/** The embed module, or null when it is not installed. */
export function loadArena(): Promise<ArenaModule | null> {
  loading ??= import(/* @vite-ignore */ new URL("vendor/model-arena/model-arena-embed.js", document.baseURI).href)
    .then(m => m as ArenaModule).catch(() => null);
  return loading;
}

/** The fake provider: mediaStorage, videoInference, imageInference and getResponse answered locally; `result` is the clip it "returns", `image` the still. Never touches the network. */
export function fakeFetch(result: () => string, image: () => string = result) {
  let n = 0, polls = 0;
  const kinds = new Map<string, string>();
  return async (url: string, init: { body: string }) => {
    if (new URL(url).host !== "api.runware.ai") throw new Error("the fake provider only answers api.runware.ai");
    const tasks = JSON.parse(init.body) as { taskType: string; taskUUID: string }[];
    // What the page would have sent, kept for the smoke checks (local only; nothing leaves the page).
    ((globalThis as { __fakeTasks?: unknown[] }).__fakeTasks ??= []).push(...tasks.filter(t => t.taskType !== "getResponse"));
    const data = tasks.map(t => {
      if (t.taskType === "mediaStorage") return { taskType: "mediaStorage", taskUUID: t.taskUUID, mediaUUID: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
      if (t.taskType === "videoInference" || t.taskType === "imageInference") { kinds.set(t.taskUUID, t.taskType); return { taskType: t.taskType, taskUUID: t.taskUUID }; }
      if (t.taskType === "getResponse") {
        if (++polls % 2) return { taskUUID: t.taskUUID, status: "processing", progress: 50 };
        return kinds.get(t.taskUUID) === "imageInference"
          ? { taskType: "imageInference", taskUUID: t.taskUUID, status: "success", imageURL: image(), cost: 0 }
          : { taskType: "videoInference", taskUUID: t.taskUUID, status: "success", videoURL: result(), cost: 0 };
      }
      return { taskUUID: t.taskUUID };
    });
    await new Promise(r => setTimeout(r, 60));
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
}

/** The embed's tokens from the page's (both themes). */
export const ARENA_THEME = `arena-key, arena-player, arena-gallery {
  --ma-bg: var(--surface-sunk); --ma-card: var(--surface); --ma-fg: var(--text); --ma-muted: var(--text-muted); --ma-line: var(--border);
  --ma-input: var(--surface-2); --ma-chip: var(--surface-hover); --ma-accent: var(--text); --ma-accent-fg: var(--bg);
  --ma-warn: var(--danger); --ma-ok: var(--rail-fill); --ma-radius: var(--radius-md); --ma-radius-lg: var(--radius-lg); --ma-gap: 8px;
  --ma-font: var(--font-sans); --ma-mono: var(--font-mono);
}`;
