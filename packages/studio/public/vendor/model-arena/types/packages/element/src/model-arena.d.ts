import { type ArenaRecord } from "../../core/src/record.ts";
export declare class ModelArena extends HTMLElement {
    static observedAttributes: string[];
    private root;
    private clock;
    private unsubscribe?;
    private current?;
    private set?;
    private tabId?;
    private arenaState?;
    private base;
    private load;
    private onHide;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, value: string | null): void;
    get record(): ArenaRecord | undefined;
    set record(record: unknown);
    /** Hands in a record or a record set; media and tab paths resolve against `baseUrl` (default: the page). */
    setRecord(data: unknown, baseUrl?: string): void;
    /** Not async on purpose: a bad record throws synchronously, so the message shows at once. */
    private accept;
    private fetchJson;
    private fetchSource;
    private showTab;
    private message;
    private teardown;
    private tabs;
    private render;
}
export declare function define(name?: string): void;
