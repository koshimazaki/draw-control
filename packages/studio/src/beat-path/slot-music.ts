/**
 * Which music an example brings when it shows again, the pure part (page.ts switches). Slice moves
 * an example's markers and switched-off hits onto the cut (track-cut.ts), so the cut stays with the
 * example for the session: its whole music again would leave them shifted onto the wrong beats.
 * Otherwise an example brings its own music, and Your own (no example music) keeps the track that
 * is loaded, as before.
 */
export type Cut<T, K extends string = string> = { track: T; licence: string; grid: { bpm: number; offsetSeconds: number }; from: K };
export type SlotMusic<T, K extends string = string> = { kind: "cut"; cut: Cut<T, K> } | { kind: "example"; id: K } | { kind: "keep" };

/** The music for a slot's saved state and the cut made on that slot (if any): the cut only while it is of the same example's music. */
export function musicFor<T, K extends string>(state: { track?: K }, cut: Cut<T, K> | undefined): SlotMusic<T, K> {
  if (!state.track) return { kind: "keep" };
  return cut && cut.from === state.track ? { kind: "cut", cut } : { kind: "example", id: state.track };
}
