import type { CostEstimate, LanePlan, LaneRequest } from "../types.ts";
import { type RunwareModel } from "./models.ts";
export declare const uploadPlaceholder: (n: number, name: string) => string;
export declare class PlanError extends Error {
    constructor(message: string);
}
export declare function estimateCost(m: RunwareModel, opts: {
    resolution?: string;
    seconds: number | "auto";
    videoInput: boolean;
    inputVideoSeconds?: number;
    images?: number;
    maxPrice?: number;
}): CostEstimate;
export declare function planTask(req: LaneRequest, taskUUID?: string): LanePlan;
/** The task with every upload placeholder replaced by its media UUID. */
export declare function fillUploads(task: Record<string, unknown>, ids: Map<string, string>): Record<string, unknown>;
