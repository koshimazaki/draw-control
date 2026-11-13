/**
 * The caption under each clip. Everything from the record goes in through
 * textContent or a checked URL, never as HTML, because records are fetched.
 */
import type { Lane } from "../../core/src/record.ts";
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K];
/** Resolves a record-relative media path; refuses schemes that are not media. */
export declare function mediaUrl(src: string, base: string): string | null;
export declare const usd: (n: number | null) => string;
export declare const secs: (n: number | null | undefined) => string;
export declare function caption(lane: Lane, base: string, onSolo: () => void): {
    node: HTMLElement;
    solo: HTMLButtonElement;
};
