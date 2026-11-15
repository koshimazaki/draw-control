/**
 * Slice and Export in the track panel, the pure part: the samples inside the clip window (cut
 * exact to the sample, the same rounding as the guide's audio.wav), the WAV file Export saves,
 * the names both give, and the page state moved onto the cut (its track times start at the
 * cut's start). page-slice.ts wires the buttons; page.ts loads the cut as the track.
 */
import { encodeWav } from "@motion-studio/core/internal";
import type { BeatPathState } from "./script";

/** What the cut reads from a decoded track (an AudioBuffer has all three). */
export type Samples = { numberOfChannels: number; sampleRate: number; getChannelData(channel: number): Float32Array };

/** The sample range of a window: its first sample and its count, rounded as `encodeWav` rounds them. */
export const sampleRange = (sampleRate: number, startSeconds: number, seconds: number) =>
  ({ from: Math.round(startSeconds * sampleRate), count: Math.max(0, Math.round(seconds * sampleRate)) });

/** Every channel's samples inside the window; before the track's start and past its end, silence (as the guide's audio.wav). */
export function cutChannels(audio: Samples, startSeconds: number, seconds: number): Float32Array[] {
  const { from, count } = sampleRange(audio.sampleRate, startSeconds, seconds);
  return Array.from({ length: audio.numberOfChannels }, (_, c) => {
    const src = audio.getChannelData(c), out = new Float32Array(count);
    // A window starting before the track: its first -from samples are silence (never placed past the window's end).
    out.set(src.subarray(Math.max(0, from), Math.max(0, Math.min(src.length, from + count))), Math.min(count, Math.max(0, -from)));
    return out;
  });
}

/** The window as a 16-bit WAV file, every channel kept, at the track's sample rate. */
export function windowWav(audio: Samples, startSeconds: number, seconds: number): Uint8Array {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  return encodeWav(channels, audio.sampleRate, startSeconds, seconds);
}

const range = (a: number, b: number) => `${a.toFixed(1)}–${b.toFixed(1)} s`;
/** A sliced track's name: the original's, with the range in the original's seconds ("song.wav (12.0–20.0 s)"). */
export const slicedName = (base: string, start: number, end: number) => `${base} (${range(start, end)})`;
/** Export's file name: the original's name without its extension, and the range ("song 12.0-20.0s.wav"). */
export const exportName = (base: string, start: number, end: number) =>
  `${base.replace(/\.[a-z0-9]{2,4}$/i, "")} ${start.toFixed(1)}-${end.toFixed(1)}s.wav`;

const ms = (t: number) => Math.round(t * 1000) / 1000;
/**
 * A state moved onto a cut that starts `start` seconds into the track and lasts `length`: your
 * markers and the switched-off hits shift with the music (those outside the cut go), and beat 0
 * sits at the cut's start (no slice). The lanes are in beats and stay as they are.
 */
export function moveOntoCut(s: BeatPathState, start: number, length: number): BeatPathState {
  const inside = (t: number) => t >= -1e-6 && t <= length + 1e-6;
  const markers = (s.markers ?? []).map(m => ({ ...m, seconds: ms(m.seconds - start) })).filter(m => inside(m.seconds));
  return { ...s, slice: undefined, markers: markers.length ? markers : undefined, muted: s.muted.map(t => ms(t - start)).filter(inside) };
}
