/**
 * <arena-gallery src="runs.json">: published comparison records, playable
 * without a key. A switcher picks the record; a view toggle shows "Inputs and
 * outputs" (the reference images as a strip, the guide and one to three
 * outputs on one playhead with their prompts, the guide's audio once), "Guide
 * beside output" (the guidance layout) or "All outputs". Under the player: the
 * shot the lane's prompt came from: this path, this prompt, this output.
 * "Run this yourself" opens the record in <arena-generate> (attribute
 * `generate` names its id) and fires `arena-run-yourself` with the preset.
 *
 * `src` is a JSON array of records or of record URLs (relative to the list),
 * or `{ "records": [...] }`. Media paths resolve against each record's URL.
 * Property `records`; method `add(record, baseUrl?)` (e.g. from
 * <arena-generate>'s `arena-gallery-add`). With no records it shows
 * "No published runs yet".
 */
import type { ShotDescription } from "../../core/src/compose.ts";
import { type ArenaRecord } from "../../core/src/record.ts";
/** One line from a lane's (or the record's) shot: subject, environment, action, legend. */
export declare function shotLine(s: ShotDescription | undefined): string | null;
export declare class ArenaGallery extends HTMLElement {
    static observedAttributes: string[];
    private root;
    private entries;
    private index;
    private view;
    private skipped;
    private load;
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(_n: string, old: string | null, value: string | null): void;
    get records(): ArenaRecord[];
    set records(list: unknown[]);
    /** Adds a record and shows it. Returns false when it does not validate. */
    add(record: unknown, baseUrl?: string): boolean;
    private accept;
    private fetchList;
    private tryParse;
    private render;
}
export declare function defineGallery(name?: string): void;
