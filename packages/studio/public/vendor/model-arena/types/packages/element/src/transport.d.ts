/** The shared transport (play, one playhead, time) and the clip screen, used by every view. */
import type { ClockState, SharedClock } from "../../core/src/clock.ts";
export declare const fmt: (t: number) => string;
export interface Transport {
    node: HTMLElement;
    update(s: ClockState): void;
}
export declare function transport(clock: () => SharedClock, label?: string): Transport;
/** A muted, inline video in a 16:9 screen with a playhead bar; null src shows a badge instead. */
export declare function screen(src: string | null, label: string, onError: (msg: string) => void, badge?: string): {
    node: HTMLElement;
    video?: HTMLVideoElement;
    bar: HTMLElement;
};
export declare const progress: (s: ClockState) => string;
