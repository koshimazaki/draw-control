/**
 * One clock for every lane, lifted from the camera-director Arena playback
 * hook and made framework-free. The first registered clip is the master; the
 * others are pulled back onto it whenever they drift more than `maxDrift`.
 * `solo` plays one clip on its own: the shared loop stops and the rest pause.
 * A generation counter cancels any play() that resolves after a newer action.
 */
/** The slice of HTMLVideoElement the clock uses, so tests can fake it. */
export interface ClockMedia {
    currentTime: number;
    readonly duration: number;
    readonly readyState: number;
    readonly ended: boolean;
    readonly error: unknown;
    play(): Promise<void>;
    pause(): void;
    addEventListener(type: "pause", fn: () => void, opts?: {
        once?: boolean;
    }): void;
}
export interface ClockState {
    playing: boolean;
    soloing: string | undefined;
    time: number;
    duration: number;
    error: string;
}
export interface ClockOptions {
    /** Largest allowed offset from the master, in seconds. Default half a frame at 24 fps. */
    maxDrift?: number;
    /** Minimum milliseconds between state publications while playing. */
    publishEvery?: number;
    raf?: (fn: (now: number) => void) => number;
    caf?: (id: number) => void;
}
export declare class SharedClock {
    private media;
    private generation;
    private frame;
    private listeners;
    private readonly maxDrift;
    private readonly publishEvery;
    private readonly raf;
    private readonly caf;
    state: ClockState;
    constructor(opts?: ClockOptions);
    subscribe(fn: (s: ClockState) => void): () => void;
    private set;
    add(id: string, m: ClockMedia): void;
    remove(id: string): void;
    /** Call on `loadedmetadata`: the shared length is the shortest clip. */
    loaded(): void;
    pause(): void;
    seek(t: number): void;
    play(): Promise<void>;
    solo(id: string): Promise<void>;
    /** Pause everything; call on page hide or element disconnect. */
    hide(): void;
    private stopLoop;
    /** One frame of the sync loop; public so tests can drive it. */
    tick(now: number): boolean;
    private published;
    private startLoop;
    private startSoloLoop;
}
