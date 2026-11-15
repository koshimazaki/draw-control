/**
 * Slice again, for a loop: when the overview shows and Slice can cut (sliceable, overviewShows),
 * resizing the window by a bracket (whole seconds, 3 s at least, the track's length at most, the
 * other end held), a window as long as the track, and the playhead's time on the timeline.
 */
import { describe, expect, it } from "vitest";
import { overviewShows, resizeWindow, roomFrom, sliceFor, sliceable } from "../src/beat-path/page-slice";
import { timeAtFraction } from "../src/beat-path/playhead";
import { moveOntoCut } from "../src/beat-path/track-cut";
import { BLANK_STATE } from "../src/beat-path/script";

const long = { name: "long.wav", licence: "test", bpm: 120, offsetSeconds: 0.1, lengthSeconds: 180.6 };
/** A track right after slicing 8 s out of it: exactly 8 s, beat 0 at its start. */
const cut8 = { ...long, name: "long.wav (40.1–48.1 s)", offsetSeconds: 0, lengthSeconds: 8 };

describe("when the overview shows and Slice cuts", () => {
  it("shows the overview for any track longer than the shortest clip, sliced or not", () => {
    expect(overviewShows(long)).toBe(true);
    expect(overviewShows(cut8)).toBe(true);                                    // right after a slice: drag an edge inward from here
    expect(overviewShows({ ...long, lengthSeconds: 3.4 })).toBe(false);         // no shorter window than 3 s
    expect(overviewShows(null)).toBe(false);
  });
  it("cuts only a window shorter than the track", () => {
    expect(sliceable(cut8, 8)).toBe(false);                                     // the window is the whole track: nothing to cut
    expect(sliceable(cut8, 7)).toBe(true);
    expect(sliceable(cut8, 4)).toBe(true);
    expect(sliceable({ ...long, lengthSeconds: 5 }, 8)).toBe(false);            // a track shorter than the clip
  });
  it("starts a window as long as the track at 0, snap on or off", () => {
    expect(sliceFor(3, cut8, 8, true)).toBe(0);
    expect(sliceFor(3, cut8, 8, false)).toBe(0);
    expect(sliceFor(3, cut8, 4, true)).toBe(3);
    expect(sliceFor(10, cut8, 4, true)).toBe(4);                                // kept inside: ends on the track's last sample, on a beat
  });
  it("counts the room left in whole seconds, a cut's exact length included", () => {
    expect(roomFrom(cut8, 0)).toBe(8);
    expect(roomFrom(cut8, 2.5)).toBe(5);
    expect(roomFrom(long, 0)).toBe(180);
  });
});

describe("resizing the window by a bracket", () => {
  it("drags the right bracket inward in whole seconds, the start held", () => {
    expect(resizeWindow("end", 4.3, { start: 0, clip: 8 }, cut8, true)).toEqual({ start: 0, clip: 4 });
    expect(resizeWindow("end", 4.6, { start: 0, clip: 8 }, cut8, true)).toEqual({ start: 0, clip: 5 });
  });
  it("never goes under 3 s nor past the track's end (nor 30 s)", () => {
    expect(resizeWindow("end", 1, { start: 0, clip: 8 }, cut8, true)).toEqual({ start: 0, clip: 3 });
    expect(resizeWindow("end", 20, { start: 0, clip: 4 }, cut8, true)).toEqual({ start: 0, clip: 8 });
    expect(resizeWindow("end", 20, { start: 2, clip: 4 }, cut8, false)).toEqual({ start: 2, clip: 6 });
    expect(resizeWindow("end", 200, { start: 10, clip: 8 }, long, true)).toEqual({ start: 10, clip: 30 });
    expect(resizeWindow("end", 10, { start: 0, clip: 3 }, { ...cut8, lengthSeconds: 2.5 }, true)).toBeNull();
  });
  it("drags the left bracket with the end held (snapped to the beat with Snap on)", () => {
    expect(resizeWindow("start", 3.9, { start: 0, clip: 8 }, cut8, false)).toEqual({ start: 4, clip: 4 });
    expect(resizeWindow("start", 3.9, { start: 0, clip: 8 }, cut8, true)).toEqual({ start: 4, clip: 4 });
    expect(resizeWindow("start", 7.5, { start: 0, clip: 8 }, cut8, true)).toEqual({ start: 5, clip: 3 });
    expect(resizeWindow("start", -5, { start: 4, clip: 4 }, cut8, true)).toEqual({ start: 0, clip: 8 });
  });
});

describe("a second slice", () => {
  it("moves the state onto the new cut again: markers shift, those outside go, no slice left", () => {
    const s = { ...BLANK_STATE, clip: 4, slice: 2, markers: [{ band: "low" as const, seconds: 1 }, { band: "low" as const, seconds: 3.5 }], muted: [2.25, 7] };
    const moved = moveOntoCut(s, 2, 4);
    expect(moved.slice).toBeUndefined();
    expect(moved.markers).toEqual([{ band: "low", seconds: 1.5 }]);
    expect(moved.muted).toEqual([0.25]);
  });
});

describe("the playhead on the timeline", () => {
  it("maps a fraction of the timeline to the clip's time, clamped to the window", () => {
    expect(timeAtFraction(40, 8, 0.5)).toBe(44);
    expect(timeAtFraction(0, 4, 0.25)).toBe(1);
    expect(timeAtFraction(0, 4, -1)).toBe(0);
    expect(timeAtFraction(0, 4, 2)).toBe(4);
  });
});
