/**
 * What a lane received and how its camera was steered, read from the record
 * (what was sent) and the spec database (what the model can take). Pure
 * functions, so the views stay thin and the rules are testable without a DOM.
 */
import type { Lane } from "../../core/src/record.ts";
import type { ModelSpec } from "../../core/src/specs/types.ts";
/** The spec for a lane's model, matched by AIR id or spec id; undefined for the guide or the router. */
export declare function laneSpec(lane: Lane): ModelSpec | undefined;
/** The camera parameter a lane was sent, from the task's `settings` block. */
export declare function cameraParam(lane: Lane): string | undefined;
export type Steering = "parameter" | "guide-video" | "prompt";
export declare const STEERING: {
    id: Steering;
    title: string;
    text: string;
}[];
export declare function steering(lane: Lane): Steering;
export type SlotState = "sent" | "not-sent" | "cannot";
export interface StripSlot {
    key: "firstFrame" | "guideVideo" | "audio" | "cameraParam" | "prompt";
    label: string;
    state: SlotState;
    detail: string;
}
/** The five things a model may receive, each sent, not sent, or not takeable. */
export declare function inputsStrip(lane: Lane, spec?: ModelSpec | undefined): StripSlot[];
/**
 * The list price of one clip from the spec's cheapest matching rate: a lower
 * bound, labelled as such, for lanes that have not run.
 */
export declare function listPrice(lane: Lane, spec?: ModelSpec | undefined): {
    usd: number;
    excludes?: string;
} | null;
