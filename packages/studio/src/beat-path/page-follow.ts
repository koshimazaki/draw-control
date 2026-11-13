/**
 * The follow block's numbers in the map footer (Camera tool): Left / Right for Follow side,
 * distance, height and angle, typed or read back after a drag on the map (map-follow.ts).
 * They edit the selected camera block when it is a follow, else the follow block under the
 * playhead. Values are the block's offset (camera segment `follow`); an empty field shows
 * the shot's own value as its placeholder. Split from page-actions.ts.
 */
import {
  CAMERA_MAX_HEIGHT, FOLLOW_LIMITS, PASSES, SHOT_PRESETS, beatAtSeconds, frameAt, hiddenSamples, placeLandmarks, planCamera, scenePaths, secondsAtBeat,
  type AudioDrive, type FollowOffset, type Recipe,
} from "@motion-studio/core";
import { foldDegrees } from "@motion-studio/core/internal";
import { isFollowWord, type BeatPathState } from "./script";

type Page = {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  state: BeatPathState; recipe: Recipe; tool: string; head: number;
  selection: { kind: "point" } | { kind: "block"; lane: "character" | "cameraLane"; index: number } | null;
  update(next: BeatPathState, final?: boolean): void;
  say(text: string): void;
};

/** The follow block the footer edits: the selected camera block if it is a follow, else the one under the playhead (-1: none). */
export function followBlock(p: Pick<Page, "state" | "recipe" | "head" | "selection">): number {
  const lane = p.state.cameraLane, plain = (i: number) => i >= 0 && !!lane[i] && isFollowWord(lane[i].word) && !lane[i].phrase;
  const sel = p.selection?.kind === "block" && p.selection.lane === "cameraLane" ? p.selection.index : -1;
  if (sel >= 0) return plain(sel) ? sel : -1;
  const beat = beatAtSeconds(p.recipe.beatGrid, p.head), at = lane.findIndex(b => beat >= b.from && beat < b.to);
  return plain(at) ? at : -1;
}

export function bindFollowFields(p: Page) {
  const { $ } = p;
  const field = (id: string) => $<HTMLInputElement>(id);
  const set = (patch: (f: FollowOffset) => FollowOffset, note?: string) => {
    const k = followBlock(p);
    if (k < 0) return;
    const f = patch({ ...p.state.cameraLane[k].follow });
    for (const key of Object.keys(f) as (keyof FollowOffset)[]) if (f[key] === undefined) delete f[key];
    const lane = p.state.cameraLane.map((b, i) => {
      if (i !== k) return b;
      const { follow: _drop, ...rest } = b; void _drop;
      return Object.keys(f).length ? { ...rest, follow: f } : rest;
    });
    p.update({ ...p.state, cameraLane: lane });
    if (note) p.say(note);
  };
  const read = (id: string, lo: number, hi: number) => { const v = field(id).value.trim(); return v === "" ? undefined : Math.max(lo, Math.min(hi, Number(v))); };
  field("followDistance").onchange = () => set(f => ({ ...f, distance: read("followDistance", ...FOLLOW_LIMITS.distance) }));
  field("followHeight").onchange = () => set(f => ({ ...f, height: read("followHeight", FOLLOW_LIMITS.height[0], Math.min(FOLLOW_LIMITS.height[1], CAMERA_MAX_HEIGHT)) }));
  field("followAngle").onchange = () => set(f => {
    // On Follow side the angle field is the turn from the chosen side; Right adds 180.
    const right = isSide() && Math.abs(f.angle ?? 0) > 90, a = read("followAngle", -90, 90) ?? 0;
    const angle = isSide() ? foldDegrees(a + (right ? 180 : 0)) : read("followAngle", ...FOLLOW_LIMITS.angle);
    return { ...f, angle: angle || undefined };
  });
  const isSide = () => { const k = followBlock(p); return k >= 0 && p.state.cameraLane[k].word === "side"; };
  for (const [id, right] of [["followLeft", false], ["followRight", true]] as const) $(id).onclick = () => set(f => {
    const now = Math.abs(f.angle ?? 0) > 90;
    if (now === right) return f;
    const angle = foldDegrees((f.angle ?? 0) + 180);
    return { ...f, angle: Math.abs(angle) < 1e-9 ? undefined : angle };
  }, `Follow side: ${right ? "right" : "left"} of the subject`);

  /** Show the fields for the current follow block (Camera tool only), with its values. */
  function sync() {
    const k = p.tool === "camera" ? followBlock(p) : -1, row = $("followRow");
    row.hidden = k < 0;
    $("cornersRow").hidden ||= k >= 0;
    $("clearPath").hidden = k >= 0;
    if (k < 0) return;
    const b = p.state.cameraLane[k], f = b.follow ?? {}, wide = SHOT_PRESETS.wide, side = b.word === "side", right = side && Math.abs(f.angle ?? 0) > 90;
    $("followSide").hidden = !side;
    $("followLeft").classList.toggle("on", side && !right); $("followRight").classList.toggle("on", right);
    $("followLeft").setAttribute("aria-checked", String(side && !right)); $("followRight").setAttribute("aria-checked", String(right));
    const put = (id: string, v: number | undefined, placeholder: number) => {
      const el = field(id);
      if (document.activeElement !== el) el.value = v === undefined ? "" : String(v);
      el.placeholder = String(placeholder);
    };
    put("followDistance", f.distance, wide.distance);
    put("followHeight", f.height, wide.height);
    put("followAngle", side ? (f.angle === undefined ? undefined : foldDegrees(f.angle - (right ? 180 : 0)) || undefined) : f.angle, 0);
    row.title = `${side ? "Follow side" : "Follow behind"}, block ${k + 1}: drag its line on the map, or type the numbers`;
  }
  return { sync };
}

/**
 * For the smoke step (dev probe): at the middle of camera block `k`, the camera's offset in the
 * subject's frame (+ right, metres), and how long the placed blocks hide the subject against the caps.
 */
export function followProbe(recipe: Recipe, drive: AudioDrive | undefined, block: { from: number; to: number }) {
  const frames = Math.ceil(secondsAtBeat(recipe.beatGrid, recipe.durationBeats) * recipe.fps) + 2, plan = planCamera(recipe, drive, frames);
  const n = Math.round(secondsAtBeat(recipe.beatGrid, (block.from * 0.4 + block.to * 0.6)) * recipe.fps), root = frameAt(recipe, n, drive).root, c = plan.samples[n].position;
  const right = -Math.cos(root.yawRadians) * (c[0] - root.x) + Math.sin(root.yawRadians) * (c[2] - root.z);
  const blocks = placeLandmarks(recipe, plan, drive), { subject, camera } = scenePaths(recipe, plan, drive);
  const hidden = new Uint8Array(Math.min(subject.length, camera.length));
  for (const b of blocks) for (const i of hiddenSamples(b, subject, camera)) hidden[i] = 1;
  let run = 0, longest = 0, total = 0;
  for (const v of hidden) { run = v ? run + 1 : 0; longest = Math.max(longest, run); total += v; }
  return { right, blocks: blocks.length, longest, maxRun: Math.floor(PASSES.maxHiddenSeconds * 24 / 2), share: total / Math.max(1, hidden.length), maxShare: PASSES.maxHiddenShare };
}
