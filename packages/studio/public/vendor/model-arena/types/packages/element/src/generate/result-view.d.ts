/**
 * The result of one run: the guide and the output on one clock (a nested
 * <model-arena layout="guidance">), the honest caption (inputs sent, cost,
 * seconds, model that ran), Download, "Add to gallery" and the costs.md row.
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import type { GenerateResult } from "../../../../providers/runware-api/generate.ts";
/** The record with bundle-relative media swapped for URLs the page can play (blob: or resolved). */
export declare function displayRecord(record: ArenaRecord, urls: Map<string, string>): ArenaRecord;
/** "Inputs sent: reference video guide.mp4, … · Cost … · Seconds … · Model ran …" */
export declare function captionText(r: GenerateResult): string;
export declare function resultView(r: GenerateResult, urls: Map<string, string>, base: string, onAdd: (record: ArenaRecord) => void): HTMLElement;
