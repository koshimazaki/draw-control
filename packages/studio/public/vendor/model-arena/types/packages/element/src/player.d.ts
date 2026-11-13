/** Whether to seek the video to the host's time: when paused, or more than one frame off. */
export declare function needsSeek(videoTime: number, hostTime: number, paused: boolean, fps?: number): boolean;
export declare class ArenaPlayer extends HTMLElement {
    static observedAttributes: string[];
    readonly video: HTMLVideoElement;
    private root;
    private err;
    private target;
    constructor();
    attributeChangedCallback(name: string): void;
    private get fps();
    get duration(): number;
    get paused(): boolean;
    get muted(): boolean;
    set muted(v: boolean);
    get currentTime(): number;
    /** The host's time, every frame if it likes; the video seeks only when it must. */
    set currentTime(t: number);
    follow(t: number): void;
    seek(t: number): void;
    play(): Promise<void>;
    pause(): void;
}
export declare function definePlayer(name?: string): void;
