/**
 * Where a setup comes from, and what music it brings, the pure part (page-setup.ts reads the
 * files, page.ts loads the result). A setup is a `.json` file, a guide `.zip` with `setup.json`
 * inside, or the files of an unzipped guide's folder. A guide carries the clip's audio
 * (`audio.wav`, the music inside the clip window), which can stand in for a user's own track.
 */
import { unzipSync } from "fflate";
import { BUNDLE_FILES } from "@motion-studio/core/internal";
import { SETUP_FILE, SETUP_MAX_BYTES, type SetupMusic } from "./setup-file";
import { EXAMPLE_TRACKS } from "./tracks";
import type { BeatPathState } from "./script";

/** The guide's audio is a clip of at most 30 s: 16-bit stereo at 48 kHz is under 6 MB; this leaves room for any rate. */
const AUDIO_MAX_BYTES = 60_000_000;
const base = (path: string) => path.split("/").pop() ?? path;
/** How deep a path sits (an unzipped guide's own files sit shallowest). */
const depth = (path: string) => path.split("/").length;

export type SetupSource = { text: string; audio?: Uint8Array } | { error: string };

/**
 * The most a picked file may be, checked on its size before a byte is read (a stored zip entry is
 * never inflated, so only this bounds it): a setup .json its own cap; a guide zip the setup's and
 * the audio's caps together, which also holds a 30 s guide video (6 Mbit/s, about 23 MB).
 */
export const ZIP_MAX_BYTES = SETUP_MAX_BYTES + AUDIO_MAX_BYTES;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
export function tooBig(size: number, zip: boolean): string | null {
  const cap = zip ? ZIP_MAX_BYTES : SETUP_MAX_BYTES;
  return size > cap ? `the file is too big (${mb(size)}; a ${zip ? "guide zip" : "setup file"} is at most ${mb(cap)})` : null;
}

/** A guide has nine files; this leaves room for a zipped folder with more beside it. */
export const ZIP_MAX_ENTRIES = 1000;
class TooMany extends Error {}

/**
 * A guide zip's setup and audio. The unzipper allocates each accepted entry at its declared size,
 * so nothing is accepted blind: a first pass only lists the entries (accepting none, at most
 * ZIP_MAX_ENTRIES), then the second decompresses just the shallowest setup.json and the audio.wav
 * beside it, by exact name, each within its cap (so at most SETUP_MAX_BYTES + AUDIO_MAX_BYTES in all).
 */
export function fromZip(bytes: Uint8Array): SetupSource {
  const sizes = new Map<string, number>();
  let entries = 0;   // every entry, a repeated name too
  try {
    unzipSync(bytes, { filter: f => { if (++entries > ZIP_MAX_ENTRIES) throw new TooMany(); sizes.set(f.name, f.originalSize); return false; } });
  } catch (e) { return { error: e instanceof TooMany ? `The zip has more than ${ZIP_MAX_ENTRIES} files: not a guide` : "Could not open the zip" }; }
  const setup = shallowest([...sizes.keys()].filter(n => base(n) === SETUP_FILE));
  if (!setup) return { error: `No ${SETUP_FILE} in the zip: a guide downloaded before setups were saved in it has none` };
  if (sizes.get(setup)! > SETUP_MAX_BYTES) return { error: "The setup file is too big" };
  const audioName = setup.slice(0, setup.length - SETUP_FILE.length) + BUNDLE_FILES.audio, audioSize = sizes.get(audioName);
  const wanted = new Set([setup, ...(audioSize !== undefined && audioSize <= AUDIO_MAX_BYTES ? [audioName] : [])]);
  let files: Record<string, Uint8Array>;
  // Checked again per entry, with a running total: a name repeated in the zip must not get a second, bigger allocation.
  let left = SETUP_MAX_BYTES + AUDIO_MAX_BYTES;
  const take = (f: { name: string; originalSize: number }) => {
    const cap = f.name === setup ? SETUP_MAX_BYTES : AUDIO_MAX_BYTES;
    if (!wanted.has(f.name) || f.originalSize > cap || f.originalSize > left) return false;
    left -= f.originalSize;
    return true;
  };
  try { files = unzipSync(bytes, { filter: take }); } catch { return { error: "Could not open the zip" }; }
  if (!files[setup]) return { error: "Could not open the zip" };
  const audio = files[audioName];
  return { text: new TextDecoder().decode(files[setup]), ...(audio ? { audio } : {}) };
}

/** A folder's files (their paths inside it): the shallowest setup.json, and audio.wav beside it. */
export function pickFromFolder<F extends { path: string; size: number }>(files: F[]): { setup: F; audio?: F } | { error: string } {
  const setups = files.filter(f => base(f.path) === SETUP_FILE);
  const path = shallowest(setups.map(f => f.path));
  if (!path) return { error: `No ${SETUP_FILE} in that folder: pick an unzipped guide's folder` };
  const setup = setups.find(f => f.path === path)!;
  const big = tooBig(setup.size, false);
  if (big) return { error: big };
  const dir = path.slice(0, path.length - SETUP_FILE.length), audio = files.find(f => f.path === dir + BUNDLE_FILES.audio && f.size <= AUDIO_MAX_BYTES);
  return { setup, ...(audio ? { audio } : {}) };
}
const shallowest = (paths: string[]) => paths.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];

/** What a loaded setup does with the music. */
export type MusicPlan =
  /** An example's own music (made in the page). */
  | { kind: "example"; id: NonNullable<BeatPathState["track"]> }
  /** The guide's audio as the track: a cut starting `start` seconds into the music the setup was timed to. */
  | { kind: "guide"; start: number }
  /** The music already loaded is the setup's. */
  | { kind: "keep" }
  /** No track: the setup had none, or it was the user's own file (not in the setup). */
  | { kind: "none"; awaiting?: string };

/**
 * What the setup's music was: an example's own, a cut Slice made of it (named after it, track-cut.ts),
 * the user's own file (an example slot keeps its `track` under a dropped file), or none.
 */
export function musicKind(state: Pick<BeatPathState, "track">, music: Pick<SetupMusic, "name"> | null): "example" | "example-cut" | "own" | "none" {
  const example = state.track ? EXAMPLE_TRACKS[state.track].name : undefined;
  if (example && (!music || music.name === example)) return "example";
  if (!music) return "none";
  return example && music.name.startsWith(`${example} (`) ? "example-cut" : "own";
}
/**
 * A loaded setup whose own track is not here (page.ts holds one, and forgets it on undo, a switch
 * or another load): the file to wait for, the setup's state, and its lanes as fitted while it waits.
 */
export type Awaited = { name: string; length: number; licence: string; state: BeatPathState; lanes: string };
const lanesOf = (s: BeatPathState) => JSON.stringify([s.character, s.cameraLane]);
export const awaitFor = (music: SetupMusic, saved: BeatPathState, now: BeatPathState): Awaited =>
  ({ name: music.name, length: music.lengthSeconds, licence: music.licence, state: structuredClone(saved), lanes: lanesOf(now) });
/** The awaited setup, when the track just loaded is its file (name, and length within 50 ms). */
export const matchAwaited = (a: Awaited | null, name: string, length: number) => (a && a.name === name && Math.abs(a.length - length) < 0.05 ? a : null);
/** The setup's slice, markers and switched-off hits back on the state, and its lanes if they were not edited while it waited. */
export function restoreAwaited(a: Awaited, s: BeatPathState): BeatPathState {
  const lanes = lanesOf(s) === a.lanes ? { character: a.state.character, cameraLane: a.state.cameraLane } : {};
  return { ...s, slice: a.state.slice, markers: a.state.markers, muted: a.state.muted, ...lanes };
}
/** The setup's slice only if the clip fits in the music that stays (`length` seconds; null: no track), else cleared. */
export function keepSliceIn(s: BeatPathState, length: number | null): { state: BeatPathState; cleared: boolean } {
  if (s.slice === undefined || (length !== null && s.slice + s.clip <= length + 0.05)) return { state: s, cleared: false };
  return { state: { ...s, slice: undefined }, cleared: true };
}
/** Same file, as far as the page can tell: name, tempo and length. */
const sameMusic = (a: SetupMusic, b: SetupMusic) => a.name === b.name && Math.abs(a.bpm - b.bpm) < 1e-6 && Math.abs(a.lengthSeconds - b.lengthSeconds) < 0.05;

/**
 * The music for a setup: its example's music when it was timed to the whole of it; else the
 * guide's audio when there is one (the clip as a cut, as Slice makes it); else the track that is
 * loaded when it is the same; else none, and a note to load the file again.
 */
export function planMusic(state: BeatPathState, music: SetupMusic | null, current: SetupMusic | null, guideAudio: boolean): { plan: MusicPlan; note?: string } {
  const kind = musicKind(state, music);
  if (kind === "example" && state.track) return { plan: { kind: "example", id: state.track } };
  if (music && guideAudio) return { plan: { kind: "guide", start: state.slice ?? music.offsetSeconds }, note: "The guide's audio is the track (the clip only): load your whole track again to slice elsewhere" };
  if (kind === "example-cut" && state.track) return { plan: { kind: "example", id: state.track }, note: "This setup was made on a cut of the example's music: load its guide zip to bring the cut, or check the markers" };
  if (!music) return { plan: { kind: "none" } };
  if (current && sameMusic(current, music)) return { plan: { kind: "keep" } };
  return { plan: { kind: "none", awaiting: music.name }, note: `This setup used your track "${music.name}": load it again (Your track, or drop it on the music strip)` };
}
