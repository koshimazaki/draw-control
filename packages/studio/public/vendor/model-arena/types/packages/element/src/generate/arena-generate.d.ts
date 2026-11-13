import type { FetchLike } from "../../../../providers/runware-api/client.ts";
import { type CostQuestion, type GenerateOptions, type ReferenceInput } from "../../../../providers/runware-api/generate.ts";
import { type LoadedGuide } from "../../../../providers/runware-api/guide-bundle.ts";
import { type GeneratePreset } from "./preset.ts";
type BundleFiles = Iterable<File> | ArrayLike<File> | Record<string, Blob>;
export declare class ArenaGenerate extends HTMLElement {
    static observedAttributes: string[];
    /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
    fetch?: FetchLike;
    pollOptions?: GenerateOptions["poll"];
    /** Replaces the inline "spend up to" check. */
    confirm?: (q: CostQuestion) => boolean | Promise<boolean>;
    private root;
    private urls;
    private base;
    private loaded?;
    private refs;
    private slots?;
    private abort?;
    private ownKey?;
    private ui?;
    private pending?;
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, value: string | null): void;
    /** A bundle: FileList, File[] or name → Blob. */
    set guide(src: BundleFiles);
    /** The loaded guide, or undefined. */
    get guide(): LoadedGuide | undefined;
    /** Host-supplied reference images; a missing role is cleared. */
    set references(r: {
        character?: ReferenceInput;
        environment?: ReferenceInput;
    } | undefined);
    get references(): {
        character?: ReferenceInput;
        environment?: ReferenceInput;
    };
    set preset(p: GeneratePreset);
    /** Resolves once the last guide, references or preset handed in has loaded. */
    whenReady(): Promise<void>;
    /** Loads a bundle, its references, shot and model; URLs resolve against `baseUrl`. */
    loadPreset(p: unknown, baseUrl?: string): Promise<void>;
    private fetchPreset;
    private loadFrom;
    private keySource;
    private shot;
    private setGuide;
    private setRef;
    private fail;
    private refresh;
    private askInline;
    private run;
    private build;
}
export declare function defineGenerate(name?: string): void;
export {};
