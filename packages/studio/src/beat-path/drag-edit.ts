/**
 * The page's edits and the drag in progress, the pure part (page.ts holds the values). A drag's
 * moves change the state without an undo step and keep where the drag began (`base`); its release
 * makes the whole drag one undo step. A drag that ends with no change (Escape, a drop back where it
 * began, a guide render starting under it) goes back to `base` with no undo step. Either way no
 * `base` is left behind for a later edit to record as its own start.
 */
export type DragAt<S> = { state: S; base: S | null };

/** An edit: `step` is the undo step it makes (where the edit, or the drag it ends, began), null mid-drag. */
export function editStep<S>(at: DragAt<S>, next: S, final: boolean, clone: (s: S) => S = structuredClone): DragAt<S> & { step: S | null } {
  const base = at.base ?? clone(at.state);
  return final ? { state: next, base: null, step: base } : { state: next, base, step: null };
}

/** A drag ended without a change: back where it began, no undo step (`restored` false when no drag was in progress). */
export function endDrag<S>(at: DragAt<S>): DragAt<S> & { restored: boolean } {
  return at.base ? { state: at.base, base: null, restored: true } : { state: at.state, base: null, restored: false };
}
