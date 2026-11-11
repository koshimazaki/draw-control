/**
 * The move track, edited like a video editor: each move is a block from its start to its
 * end. Drag a block to move it, drag either edge to lengthen or shorten it (a longer block
 * plays the move slower, a shorter one faster), all snapped to the chosen target (beats,
 * half beats, kicks, snares or hats; Alt: free). Every edit is a core command
 * (moveMoveTo, resizeMove), the same one an agent sends.
 */
import { applyMotionCommand, moveEndBeat, snapBeat, type CommandContext, type Recipe, type SnapTarget } from "@motion-studio/core";

export type BlockHit = { kind: "start" | "end" | "body"; index: number; id: string };
const EDGE_PX = 5;

/** What is under x on the move lane: an edge (within 5 px) or a block's body. */
export function blockAt(recipe: Recipe, x: number, width: number): BlockHit | null {
  const X = (b: number) => b / recipe.durationBeats * width;
  let best: BlockHit | null = null, bd = EDGE_PX;
  recipe.moves.forEach((m, i) => {
    const s = X(m.atBeat), e = X(moveEndBeat(recipe, i));
    // At a shared cut, the left half picks the end of the earlier block and the right half the start of the later one.
    const ds = Math.abs(x - s) + (x < s ? 0.5 : 0), de = Math.abs(x - e) + (x > e ? 0.5 : 0);
    if (ds < bd) { bd = ds; best = { kind: "start", index: i, id: m.id }; }
    if (de < bd) { bd = de; best = { kind: "end", index: i, id: m.id }; }
  });
  if (best) return best;
  for (let i = recipe.moves.length - 1; i >= 0; i--) {
    const m = recipe.moves[i];
    if (x >= X(m.atBeat) && x <= X(moveEndBeat(recipe, i))) return { kind: "body", index: i, id: m.id };
  }
  return null;
}

export type MoveLaneHost = {
  recipe(): Recipe;
  ctx(): CommandContext;
  edit(fn: (r: Recipe) => Recipe): void;
  snapTarget(): SnapTarget;
  select(moveId: string): void;
  /** Record the gesture's final command (the command log). */
  log?(command: { type: string } & Record<string, unknown>): void;
};

/** Start a drag on the move lane; returns the pointer-move handler, or null when nothing was hit. */
export function startBlockDrag(host: MoveLaneHost, hit: BlockHit, downBeat: number, beatAtX: (clientX: number) => number): ((ev: PointerEvent) => void) & { finish(): void } {
  host.select(hit.id);
  const r0 = host.recipe(), m0 = r0.moves[hit.index];
  const grab = downBeat - m0.atBeat;   // where in the block the pointer took hold
  let last = NaN, lastCommand: ({ type: string } & Record<string, unknown>) | null = null;
  const onMove = (ev: PointerEvent) => {
    const target: SnapTarget = ev.altKey ? "free" : host.snapTarget();
    const raw = beatAtX(ev.clientX);
    const beat = snapBeat(host.recipe(), hit.kind === "body" ? raw - grab : raw, target, host.ctx().bands);
    if (beat === last) return;
    last = beat;
    // Each step re-applies the edit to the recipe as it was when the drag began, so one press is one undo step.
    const command = hit.kind === "body" ? { type: "moveMoveTo", moveId: hit.id, toBeat: beat } : { type: "resizeMove", moveId: hit.id, edge: hit.kind, toBeat: beat };
    host.edit(() => applyMotionCommand(r0, command, host.ctx()));
    lastCommand = command;
  };
  return Object.assign(onMove, { finish: () => { if (lastCommand) host.log?.(lastCommand); } });
}
