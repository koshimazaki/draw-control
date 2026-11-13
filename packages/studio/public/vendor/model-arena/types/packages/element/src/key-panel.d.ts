export declare const KEY_SHAPE: RegExp;
/** Why a pasted key cannot be right, or null when its shape is fine. */
export declare function keyProblem(key: string): string | null;
export declare class ArenaKey extends HTMLElement {
    static observedAttributes: string[];
    private store;
    private root;
    private remembered;
    constructor();
    connectedCallback(): void;
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
