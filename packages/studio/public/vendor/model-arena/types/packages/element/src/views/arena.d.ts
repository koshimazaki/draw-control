/**
 * layout="arena": the same shot from several models, on one clock. The reader
 * picks how many to compare (2-5) and a layout for that count, and each tile
 * has a model menu so one model can be swapped for another. Every tile shows
 * the model, its cost per clip and its seconds; play all, or play one alone.
 * A lane that has not run shows the list price as a lower bound and says so.
 */
import type { ClockState, SharedClock } from "../../../core/src/clock.ts";
import type { ArenaRecord, Lane } from "../../../core/src/record.ts";
export interface ViewContext {
    record: ArenaRecord;
    base: string;
    clock: () => SharedClock;
    error: (msg: string) => void;
}
export interface View {
    /** Controls for the panel head, beside the test tabs. */
    controls?: Node[];
    nodes: Node[];
    update(s: ClockState): void;
}
/** What the reader chose; kept by the element across test tabs. */
export interface ArenaState {
    count: number;
    layout: string;
    /** Lane ids, one per tile. */
    picks: string[];
}
export declare const LAYOUTS: Record<number, [string, string][]>;
/** "$0.94 per clip", or the list price for a lane that has not run. */
export declare function costLine(lane: Lane): string;
/** The short tile label: cost and seconds. */
export declare function tileMeta(lane: Lane): string;
export declare function secondsLine(lane: Lane): string;
/** Clamps a saved state to what this record offers. */
export declare function fitState(record: ArenaRecord, prev?: Partial<ArenaState>): ArenaState;
export declare function arenaView(ctx: ViewContext, state: ArenaState, onState: (s: ArenaState) => void): View;
