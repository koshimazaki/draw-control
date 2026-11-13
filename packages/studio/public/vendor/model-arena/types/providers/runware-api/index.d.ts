/**
 * The Runware API provider: plan a lane (pure), then run it — upload local
 * media through `mediaStorage`, submit the task, poll, and report cost,
 * seconds and the model that ran.
 */
import type { LanePlan, LaneResult, Provider, RunProgress } from "../types.ts";
import { RunwareClient, type FetchLike } from "./client.ts";
import { type PollOptions } from "./poll.ts";
export { MODELS, findModel } from "./models.ts";
export { planTask, estimateCost, PlanError } from "./task.ts";
export { RunwareClient, RUNWARE_ENDPOINT } from "./client.ts";
export { pollVideo, parseCost } from "./poll.ts";
export interface RunwareProviderOptions {
    getKey: () => string | undefined;
    fetch?: FetchLike;
    poll?: Omit<PollOptions, "signal" | "onProgress">;
}
export declare function runwareProvider(opts: RunwareProviderOptions): Provider & {
    client: RunwareClient;
    resume(plan: LanePlan, taskUUID: string, o?: {
        onProgress?: (p: RunProgress) => void;
        signal?: AbortSignal;
    }): Promise<LaneResult>;
};
