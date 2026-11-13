/**
 * <arena-key>: the reader's own Runware API key, kept in their browser.
 *
 * A password-style field; connect checks only the format and length (16-512
 * printable characters, no spaces) and sends nothing. The key lives in memory,
 * or in sessionStorage when "Remember for this tab" is ticked; it is never
 * logged, never put in an attribute, a URL, an event or a record. Only
 * RunwareClient reads it, through `getKey()`, and sends it to api.runware.ai.
 *
 * Once connected it asks Runware for the account balance and shows it;
 * `refreshBalance()` reads it again (hosts call it after a run). Only the
 * number is read from that response.
 *
 * Attributes: `signup-url` (the "Get a key" link), `theme`.
 * Events: `arena-key-change`, detail `{ connected, remembered }` (never the key);
 * `arena-balance-change`, detail `{ balance }` (USD, or null when unknown).
 */
import { type FetchLike } from "../../../providers/runware-api/client.ts";
export declare const KEY_SHAPE: RegExp;
/** Why a pasted key cannot be right, or null when its shape is fine. */
export declare function keyProblem(key: string): string | null;
export declare class ArenaKey extends HTMLElement {
    static observedAttributes: string[];
    private store;
    private root;
    private remembered;
    private balanceUsd;
    private balanceNote;
    private asked;
    /** Test seam: the fetch the balance call uses. */
    fetch?: FetchLike;
    constructor();
    connectedCallback(): void;
    /** The balance last read from Runware, in USD; null until known. */
    get balance(): number | null;
    /** Reads the balance again. Resolves to the number, or null when it cannot be read. */
    refreshBalance(): Promise<number | null>;
    attributeChangedCallback(): void;
    /** True when a key is held. */
    get connected(): boolean;
    /** The key, for RunwareClient only. Never log or store what this returns. */
    getKey: () => string | undefined;
    disconnect(): void;
    /** Connects a key typed or pasted elsewhere; returns the problem, or null. */
    connect(key: string, remember?: boolean): string | null;
    private changed;
    private signup;
    private render;
}
export declare function defineKey(name?: string): void;
