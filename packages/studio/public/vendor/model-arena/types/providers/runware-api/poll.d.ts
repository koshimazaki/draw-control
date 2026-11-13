/**
 * Async video results: poll `getResponse` by taskUUID with backoff until the
 * task succeeds or fails (docs: models-api/task-polling). Never resubmits;
 * sending the task again would start, and bill, a second generation.
 */
import { RunwareApiError, type RunwareClient } from "./client.ts";
export interface PollOptions {
    initialDelayMs?: number;
    intervalMs?: number;
    maxIntervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (status: string, progress?: number) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** The response field that carries the result URL: `videoURL` (default) or `imageURL`. */
    urlField?: "videoURL" | "imageURL";
}
export interface VideoResult {
    taskUUID: string;
    videoURL: string;
    videoUUID?: string;
    cost: number | null;
    seed?: number;
    /** Present only if the API ever returns it; not in the published response schema. */
    model?: string;
}
/** Cost as a finite non-negative number, or null when absent or malformed. */
export declare function parseCost(v: unknown): number | null;
/** Reads one response for our task: a result, a failure, or still running. */
export declare function readVideoRow(taskUUID: string, data: Record<string, unknown>[], errors: {
    code: string;
    message: string;
    taskUUID?: string;
}[], urlField?: "videoURL" | "imageURL"): {
    state: "success";
    result: VideoResult;
} | {
    state: "processing";
    progress?: number;
} | {
    state: "error";
    error: RunwareApiError;
} | {
    state: "absent";
};
export declare function pollVideo(client: RunwareClient, taskUUID: string, opts?: PollOptions): Promise<VideoResult>;
export interface ImageResult {
    taskUUID: string;
    imageURL: string;
    cost: number | null;
    seed?: number;
}
/** Polls an async `imageInference` task; same rules as video: never resubmit. */
export declare function pollImage(client: RunwareClient, taskUUID: string, opts?: PollOptions): Promise<ImageResult>;
