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
export type ArenaModule = {
  generateFromGuide(o: Record<string, unknown>): Promise<ArenaResult>;
  offeredModels(): ArenaModel[];
  composePrompt(shot: Record<string, string>, model: string, references?: { character?: unknown; environment?: unknown }, guide?: { seconds?: number; hasAudio?: boolean }): { prompt: string; notes: string[] };
};
export type ArenaKeyElement = HTMLElement & { connected: boolean; getKey(): string | undefined };

let loading: Promise<ArenaModule | null> | null = null;
/** The embed module, or null when it is not installed. */
export function loadArena(): Promise<ArenaModule | null> {
  loading ??= import(/* @vite-ignore */ new URL("vendor/model-arena/model-arena-embed.js", document.baseURI).href)
    .then(m => m as ArenaModule).catch(() => null);
  return loading;
}

/** The fake provider: mediaStorage, videoInference and getResponse answered locally; `result` is the clip it "returns". Never touches the network. */
export function fakeFetch(result: () => string) {
  let n = 0, polls = 0;
  return async (url: string, init: { body: string }) => {
    if (new URL(url).host !== "api.runware.ai") throw new Error("the fake provider only answers api.runware.ai");
    const tasks = JSON.parse(init.body) as { taskType: string; taskUUID: string }[];
    const data = tasks.map(t => {
      if (t.taskType === "mediaStorage") return { taskType: "mediaStorage", taskUUID: t.taskUUID, mediaUUID: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
      if (t.taskType === "videoInference") return { taskType: "videoInference", taskUUID: t.taskUUID };
      if (t.taskType === "getResponse") return ++polls % 2 ? { taskUUID: t.taskUUID, status: "processing", progress: 50 } : { taskType: "videoInference", taskUUID: t.taskUUID, status: "success", videoURL: result(), cost: 0 };
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
