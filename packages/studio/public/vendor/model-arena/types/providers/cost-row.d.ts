/**
 * One row of docs/costs.md, as pure data and text, so the Node CLI and the
 * browser generate flow describe a paid run the same way. Appending the row to
 * the file is the CLI's job (scripts/lib/costs.ts); the browser hands it back.
 */
export interface CostRow {
    date: string;
    model: string;
    modelRan: string | null;
    taskUUID: string;
    duration: string;
    resolution: string;
    inputs: string;
    estimateUsd: number | null;
    costUsd: number | null;
    seconds: number | null;
    output: string;
    status: string;
}
export declare function costRow(r: CostRow): string;
/** The resolution cell: the `resolution` field, or width×height (LTX). */
export declare const resolutionCell: (task: Record<string, unknown>) => string;
