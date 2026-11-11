/**
 * The move track, edited like a video editor: each move is a block from its start to its
 * end. Drag a block to move it, drag either edge to lengthen or shorten it (a longer block
 * plays the move slower, a shorter one faster), all snapped to the chosen target (beats,
 * half beats, kicks, snares or hats; Alt: free). Every edit is a core command
 * (moveMoveTo, resizeMove), the same one an agent sends.
 */
import { applyMotionCommand, moveEndBeat, snapBeat, type CommandContext, type Recipe, type SnapTarget } from "@motion-studio/core";

export type SpanHit = { kind: "start" | "end" | "body"; index: number };
export type BlockHit = SpanHit & { id: string };
const EDGE_PX = 5;

/** What is under x on a lane of blocks: an edge (within 5 px) or a block's body. Shared by the move and camera lanes. */
export function spanAt(spans: readonly { start: number; end: number }[], x: number, width: number, total: number): SpanHit | null {
  const X = (b: number) => b / total * width;
  let best: SpanHit | null = null, bd = EDGE_PX;
  spans.forEach((sp, i) => {
    const s = X(sp.start), e = X(sp.end);
    // At a shared cut, the left half picks the end of the earlier block and the right half the start of the later one.
    const ds = Math.abs(x - s) + (x < s ? 0.5 : 0), de = Math.abs(x - e) + (x > e ? 0.5 : 0);
    if (ds < bd) { bd = ds; best = { kind: "start", index: i }; }
    if (de < bd) { bd = de; best = { kind: "end", index: i }; }
  });
  if (best) return best;
  for (let i = spans.length - 1; i >= 0; i--) if (x >= X(spans[i].start) && x <= X(spans[i].end)) return { kind: "body", index: i };
  return null;
}

/** What is under x on the move lane. */
export function blockAt(recipe: Recipe, x: number, width: number): BlockHit | null {
  const hit = spanAt(recipe.moves.map((m, i) => ({ start: m.atBeat, end: moveEndBeat(recipe, i) })), x, width, recipe.durationBeats);
  return hit && { ...hit, id: recipe.moves[hit.index].id };
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
type Command = { type: string } & Record<string, unknown>;

/**
 * Drag a block or an edge, snapped to the chosen target (Alt: free). Each step re-applies the
 * command to the recipe as it was when the drag began, so one press is one undo step.
 */
export function startSpanDrag(host: Omit<MoveLaneHost, "select">, hit: SpanHit, blockStart: number, downBeat: number, beatAtX: (clientX: number) => number,
  commandFor: (kind: SpanHit["kind"], beat: number) => Command): ((ev: PointerEvent) => void) & { finish(): void } {
  const r0 = host.recipe(), grab = downBeat - blockStart;
  let last = NaN, lastCommand: Command | null = null;
  const onMove = (ev: PointerEvent) => {
    const target: SnapTarget = ev.altKey ? "free" : host.snapTarget();
    const raw = beatAtX(ev.clientX);
    const beat = snapBeat(host.recipe(), hit.kind === "body" ? raw - grab : raw, target, host.ctx().bands);
    if (beat === last) return;
    last = beat;
    const command = commandFor(hit.kind, beat);
    host.edit(() => applyMotionCommand(r0, command, host.ctx()));
    lastCommand = command;
  };
  return Object.assign(onMove, { finish: () => { if (lastCommand) host.log?.(lastCommand); } });
}

/** Start a drag on the move lane (moveMoveTo, resizeMove). */
export function startBlockDrag(host: MoveLaneHost, hit: BlockHit, downBeat: number, beatAtX: (clientX: number) => number): ((ev: PointerEvent) => void) & { finish(): void } {
  host.select(hit.id);
  return startSpanDrag(host, hit, host.recipe().moves[hit.index].atBeat, downBeat, beatAtX,
    (kind, beat) => (kind === "body" ? { type: "moveMoveTo", moveId: hit.id, toBeat: beat } : { type: "resizeMove", moveId: hit.id, edge: kind, toBeat: beat }));
}
