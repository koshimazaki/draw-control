/**
 * The setup file: the whole page as one JSON file, saved from Settings and loaded back (a `.json`,
 * a guide `.zip` with `setup.json` inside, or the unzipped guide's folder). Format, version 1:
 *
 *   { "kind": "beat-path-setup", "version": 1, "saved": "<ISO time>",
 *     "music": { name, licence, bpm, offsetSeconds, lengthSeconds } | null,
 *     "state": <BeatPathState>,
 *     "script": "<the shot script, toScript(state)>" }
 *
 * `state` is the source of truth on load; `script` is there for people and agents (the CLI's
 * `script` command takes it). `music` says what the lanes were timed to: an example's music
 * (`state.track`) comes back with the example, a user's own file cannot travel in JSON.
 *
 * `readSetup` never throws: a field it cannot use falls back to the blank page's value (BLANK_STATE)
 * on its own, with a note, rather than refusing the whole file; values are clamped as the page clamps them.
 */
import { CAMERA_MAX_HEIGHT, FOLLOW_LIMITS, FOV_RANGE, RIG_LIMITS, clipBeats, type CommandContext, type FollowOffset } from "@motion-studio/core";
import { beatPathRecipe, type TrackInfo } from "./recipe-map";
import {
  BLANK_STATE, CAMERA_WORDS, CHARACTER_WORDS, HIT_CHOICES, LOCK_CHOICES, clampClip, fitLanes, toScript,
  type BeatPathState, type Block, type PathPt,
} from "./script";

export const SETUP_KIND = "beat-path-setup";
export const SETUP_VERSION = 1;
/** Its name inside a guide zip (and an unzipped guide's folder). */
export const SETUP_FILE = "setup.json";
/** The name Save setup downloads. */
export const SETUP_DOWNLOAD = "draw-control-setup.json";
/** Bigger than any real setup by far (a full page is a few kilobytes). */
export const SETUP_MAX_BYTES = 2_000_000;

export type SetupMusic = TrackInfo;
export type SetupFile = { kind: typeof SETUP_KIND; version: typeof SETUP_VERSION; saved: string; music: SetupMusic | null; state: BeatPathState; script: string };
export type SetupRead = { ok: true; state: BeatPathState; music: SetupMusic | null; notes: string[]; /** "Next move on each hit" waits for the hits of a track not given in `ctx`. */ waitsForHits?: boolean } | { ok: false; error: string };

/** The file for the page's state and the music it is timed to. */
export function buildSetup(state: BeatPathState, music: TrackInfo | null, now = new Date()): SetupFile {
  return { kind: SETUP_KIND, version: SETUP_VERSION, saved: now.toISOString(), music: music ? { ...music } : null, state: structuredClone(state), script: toScript(state) };
}
export const setupJson = (state: BeatPathState, music: TrackInfo | null, now?: Date) => JSON.stringify(buildSetup(state, music, now), null, 2) + "\n";

// Limits: the map's own (map.ts: points within ±60 m, 16 points a path), the recipe's for scenery
// boxes (recipe.ts: up to 200, ±200 m, sides 0.2–80 m, height 0.2–60 m, yaw ±7 rad), generous caps elsewhere.
const LIMIT = {
  coord: 60, points: 16, blocks: 64, cameraBlocks: 32, boxes: 200, box: { coord: 200, side: [0.2, 80], height: [0.2, 60], yaw: 7 },
  // The recipe's own: 512 switched-off hits and markers (recipe.ts), shot text 300 characters; `scan` bounds the work on a hostile list.
  hits: 512, scan: 10_000, shot: 300, text: 2000, phrase: 300, seconds: 3600, subjectY: 30,
} as const;
const BANDS = ["low", "mid", "high"] as const;
const SHAPES = ["glider", "car", "flyer", "runner"] as const;
const SCENERY = ["none", "scatter", "street", "city"] as const;
const SIGHT = ["clear", "passes"] as const;
const TRACKS = ["flyer", "runner", "car", "drone"] as const;
/** The state's optional fields (BLANK_STATE leaves them out). */
const OPTIONAL = ["sensitivity", "markers", "slice", "boxes", "track", "rig", "prompt"] as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);
/** One line of text: no line breaks, no script separators (`|`, `#`), trimmed and capped. */
const line = (v: string, max: number) => v.replace(/[\r\n|#]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const ms = (t: number) => Math.round(t * 1000) / 1000;
/** Shot text as the recipe takes it (validate.ts `text`): one line, no `<>{}\`, no URL schemes, at most 300 characters. */
const shotText = (v: string) => v.replace(/[<>{}\\]/g, " ").replace(/(https?|data|javascript):\S*/gi, " ").replace(/\s*[\r\n]+\s*/g, " ").replace(/ {2,}/g, " ").trim().slice(0, LIMIT.shot).trim();

/** Read a setup file's text. Never throws: a state with notes, or a plain error. */
export function readSetup(text: string, ctx: CommandContext = {}): SetupRead {
  if (typeof text !== "string") return { ok: false, error: "Not a setup file" };
  if (text.length > SETUP_MAX_BYTES) return { ok: false, error: `The setup file is too big (${(text.length / 1e6).toFixed(1)} MB; a setup is a few kB)` };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "Not a setup file: it is not valid JSON" }; }
  if (!isRec(raw) || raw.kind !== SETUP_KIND) return { ok: false, error: `Not a setup file: it has no "kind": "${SETUP_KIND}"` };
  const version = num(raw.version);
  if (version === undefined || !Number.isInteger(version) || version < 1) return { ok: false, error: "Not a setup file: its version is missing" };
  if (version > SETUP_VERSION) return { ok: false, error: `This setup is version ${version}, newer than this page reads (${SETUP_VERSION}): update the page` };
  if (!isRec(raw.state)) return { ok: false, error: "The setup file has no state" };
  const notes: string[] = [];
  const music = readMusic(raw.music, notes);
  let state = readState(raw.state, notes);
  // The lanes fill the clip at the music's tempo, as the page keeps them.
  state = fitLanes(state, clipBeats(state.clip, music?.bpm ?? 120));
  // Last: the state must build a recipe, as the page builds it (`ctx`: the hits of the track loaded).
  // "Next move on each hit" anchors camera blocks on hits, so without the setup's own track it cannot
  // resolve yet: that never refuses the file; the state keeps it and it lands once the track is loaded.
  // Typed camera phrases are the other part the core can refuse: those are dropped, with a note.
  const builds = (s: BeatPathState) => { try { beatPathRecipe(s, music, ctx); return null; } catch (e) { return (e as Error).message; } };
  const off = (s: BeatPathState): BeatPathState => ({ ...s, camLock: { ...s.camLock, advance: false } });
  const ok = (s: BeatPathState) => (!builds(s) ? "now" : s.camLock.advance && !builds(off(s)) ? "hits" : null);
  const why = builds(state);
  let result = why ? ok(state) : "now";
  if (!result && state.cameraLane.some(b => b.phrase)) {
    const bare = { ...state, cameraLane: state.cameraLane.map(({ phrase: _, ...b }) => b) };
    result = ok(bare);
    if (result) { state = bare; notes.push(`camera directions dropped (${why!.replace(/^Recipe: /, "")})`); }
  }
  if (!result) return { ok: false, error: `The setup does not make a shot: ${why!.replace(/^Recipe: /, "")}` };
  return { ok: true, state, music, notes, ...(result === "hits" ? { waitsForHits: true } : {}) };
}

function readMusic(v: unknown, notes: string[]): SetupMusic | null {
  if (v === null || v === undefined) return null;
  const bpm = isRec(v) ? num(v.bpm) : undefined;
  if (!isRec(v) || typeof v.name !== "string" || bpm === undefined || bpm < 40 || bpm > 240) { notes.push("music details unreadable: timed at 120 BPM"); return null; }
  return {
    name: line(v.name, 200) || "track", licence: typeof v.licence === "string" ? line(v.licence, 200) : "unspecified", bpm,
    offsetSeconds: clamp(num(v.offsetSeconds) ?? 0, 0, LIMIT.seconds), lengthSeconds: clamp(num(v.lengthSeconds) ?? 0, 0, LIMIT.seconds),
  };
}

/** The page state, field by field; anything unusable keeps BLANK_STATE's value and adds a note. */
export function readState(s: Rec, notes: string[]): BeatPathState {
  const out = structuredClone(BLANK_STATE);
  const drop = (what: string) => notes.push(`${what}: not readable, left as on a blank page`);
  const has = (k: string) => s[k] !== undefined;
  const known = new Set([...Object.keys(BLANK_STATE), ...OPTIONAL]);
  const missing = Object.keys(BLANK_STATE).filter(k => !has(k)), unknown = Object.keys(s).filter(k => !known.has(k));
  if (missing.length) notes.push(`not in the file, as on a blank page: ${missing.join(", ")}`);
  if (unknown.length) notes.push(`ignored: ${unknown.slice(0, 8).map(k => line(k, 40)).join(", ")}${unknown.length > 8 ? "…" : ""}`);

  const clip = num(s.clip);
  if (clip !== undefined) { out.clip = clampClip(clip); if (out.clip !== clip) notes.push(`clip ${clip} s → ${out.clip} s`); } else if (has("clip")) drop("clip");

  for (const [key, cornersKey, camera] of [["subject", "subjectCorners", false], ["camera", "cameraCorners", true]] as const) {
    if (has(key)) { const p = points(s[key], camera); if (p) { out[key] = p.list; if (p.cut) notes.push(`${key} path: ${p.cut}`); } else drop(`${key} path`); }
    const c = num(s[cornersKey]);
    if (c !== undefined) out[cornersKey] = clamp(c, 0, 1); else if (has(cornersKey)) drop(`${key} corners`);
  }

  for (const [key, words] of [["character", CHARACTER_WORDS], ["cameraLane", CAMERA_WORDS]] as const) {
    if (!has(key)) continue;
    const lane = blocks(s[key], words as readonly string[], key === "cameraLane");
    if (lane) {
      (out as Rec)[key] = lane.list;
      if (lane.dropped) notes.push(`${key === "character" ? "character" : "camera"} lane: ${lane.dropped} unreadable blocks dropped`);
      if (lane.capped) notes.push(`camera lane: ${lane.capped} blocks past the rig's ${LIMIT.cameraBlocks} dropped${lane.phrases ? `, with ${lane.phrases} typed camera direction${lane.phrases > 1 ? "s" : ""}` : ""}; the last block kept runs to the end`);
    }
    else drop(`${key === "character" ? "character" : "camera"} lane`);
  }

  if (has("charLock")) {
    const l = isRec(s.charLock) ? s.charLock : {}, lock = pick(l.lock, LOCK_CHOICES), strength = num(l.strength);
    if (lock && strength !== undefined) out.charLock = { lock, strength: clamp(strength, 0, 1) }; else drop("character lock");
  }
  if (has("camLock")) {
    const l = isRec(s.camLock) ? s.camLock : {}, lock = pick(l.lock, LOCK_CHOICES), strength = num(l.strength), onHit = pick(l.onHit, HIT_CHOICES);
    if (lock && strength !== undefined && onHit) out.camLock = { lock, strength: clamp(strength, 0, 1), onHit, advance: l.advance === true };
    else drop("camera lock");
  }
  if (has("landmarks")) {
    const l = isRec(s.landmarks) ? s.landmarks : {}, seed = num(l.seed);
    if (typeof l.on === "boolean" && seed !== undefined) out.landmarks = { on: l.on, seed: Math.round(clamp(seed, 0, 1e9)) }; else drop("landmarks");
  }
  const sens = num(s.sensitivity);
  if (sens !== undefined && sens < 1) out.sensitivity = Math.round(clamp(sens, 0, 1) * 100) / 100; else if (has("sensitivity") && sens === undefined) drop("sensitivity");

  if (has("muted")) { const t = times(s.muted); if (t) { out.muted = t.list; if (t.cut) notes.push(`switched-off hits: ${t.cut}`); } else drop("switched-off hits"); }
  if (has("markers")) {
    const raw = Array.isArray(s.markers) ? s.markers : null;
    if (!raw) drop("markers");
    else {
      const read = raw.slice(0, LIMIT.scan).flatMap(m => {
        const band = isRec(m) ? pick(m.band, BANDS) : undefined, seconds = isRec(m) ? num(m.seconds) : undefined;
        return band && seconds !== undefined && seconds >= 0 && seconds <= LIMIT.seconds ? [{ band, seconds: ms(seconds) }] : [];
      }).sort((a, b) => a.seconds - b.seconds);
      if (read.length < raw.length) notes.push(`markers: ${raw.length - read.length} unreadable dropped`);
      if (read.length > LIMIT.hits) notes.push(`markers: kept the first ${LIMIT.hits} (the recipe's most)`);
      if (read.length) out.markers = read.slice(0, LIMIT.hits);
    }
  }
  const slice = num(s.slice);
  if (slice !== undefined) out.slice = clamp(slice, 0, LIMIT.seconds); else if (has("slice")) drop("slice");

  if (has("figure")) {
    const f = isRec(s.figure) ? s.figure : {}, colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
    const shape = pick(f.shape, SHAPES), body = colour(f.body), head = colour(f.head);
    out.figure = { shape: shape ?? out.figure.shape, body: body ?? out.figure.body, head: head ?? out.figure.head };
    if (!shape || !body || !head) drop("part of the figure");
  }
  const scenery = pick(s.scenery, SCENERY), sight = pick(s.sight, SIGHT);
  if (scenery) out.scenery = scenery; else if (has("scenery")) drop("scenery");
  if (sight) out.sight = sight; else if (has("sight")) drop("pass in front");
  if (has("boxes")) {
    const raw = Array.isArray(s.boxes) ? s.boxes : null;
    if (!raw) drop("scenery boxes");
    else {
      const { coord, side, height, yaw: turn } = LIMIT.box;
      const list = raw.slice(0, LIMIT.boxes).flatMap(b => {
        if (!isRec(b)) return [];
        const [x, z, w, d, h, yaw] = [b.x, b.z, b.w, b.d, b.h, b.yaw].map(num);
        if (x === undefined || z === undefined || w === undefined || d === undefined || h === undefined) return [];
        const box = { x: clamp(x, -coord, coord), z: clamp(z, -coord, coord), w: clamp(w, ...side), d: clamp(d, ...side), h: clamp(h, ...height) };
        return [yaw ? { ...box, yaw: clamp(yaw, -turn, turn) } : box];
      });
      if (list.length < raw.length) notes.push(`scenery boxes: ${raw.length - list.length} unreadable dropped`);
      out.boxes = list;
    }
  }
  if (has("rig")) { const r = isRec(s.rig) ? rig(s.rig, notes) : undefined; if (r) out.rig = r; else drop("camera start"); }
  const track = pick(s.track, TRACKS);
  if (track) out.track = track; else if (has("track")) drop("example music");
  if (has("shot")) {
    const sh = isRec(s.shot) ? s.shot : {}, changed: string[] = [];
    const text = (k: "subject" | "environment" | "action") => {
      const v = sh[k];
      if (typeof v !== "string") return "";
      const t = shotText(v);
      if (t !== v) changed.push(k);
      return t;
    };
    out.shot = { subject: text("subject"), environment: text("environment"), action: text("action") };
    if (!isRec(s.shot)) drop("shot description");
    if (changed.length) notes.push(`shot ${changed.join(", ")}: shortened to one line of ${LIMIT.shot} characters, without links or <>{}\\`);
  }
  if (typeof s.prompt === "string" && line(s.prompt, LIMIT.text)) out.prompt = line(s.prompt, LIMIT.text); else if (has("prompt") && typeof s.prompt !== "string") drop("prompt");
  return out;
}

/** A path's points within the map; `cut` says what was trimmed. Null when it is not a list. */
function points(v: unknown, camera: boolean): { list: PathPt[]; cut?: string } | null {
  if (!Array.isArray(v)) return null;
  const list = v.slice(0, LIMIT.points).flatMap(p => {
    const x = isRec(p) ? num(p.x) : undefined, z = isRec(p) ? num(p.z) : undefined, y = isRec(p) ? num(p.y) : undefined;
    if (x === undefined || z === undefined) return [];
    const q: PathPt = { x: clamp(x, -LIMIT.coord, LIMIT.coord), z: clamp(z, -LIMIT.coord, LIMIT.coord) };
    // Heights as the engine takes them: the camera up to CAMERA_MAX_HEIGHT, the subject 0–30 m (setRootPath); 0 means on the ground (no y).
    const top = camera ? CAMERA_MAX_HEIGHT : LIMIT.subjectY, h = y === undefined ? 0 : clamp(y, 0, top);
    if (h) q.y = h;
    return [q];
  });
  const cut = v.length > LIMIT.points ? `kept the first ${LIMIT.points} points` : list.length < v.length ? `${v.length - list.length} unreadable points dropped` : undefined;
  return { list, ...(cut ? { cut } : {}) };
}

/** A lane: readable blocks in order, edges joined (each block starts where the last ends, the first at 0). */
function blocks(v: unknown, words: readonly string[], camera: boolean): { list: Block<string>[]; dropped: number; capped?: number; phrases?: number } | null {
  if (!Array.isArray(v)) return null;
  const list = v.slice(0, LIMIT.blocks).flatMap(b => {
    if (!isRec(b)) return [];
    const from = num(b.from), to = num(b.to), word = pick(b.word, words);
    if (from === undefined || to === undefined || !word || to <= from || from < 0 || to > 10_000) return [];
    const block: Block<string> = { from, to, word };
    if (camera && typeof b.phrase === "string" && line(b.phrase, LIMIT.phrase)) block.phrase = line(b.phrase, LIMIT.phrase);
    if (camera && (word === "behind" || word === "side") && isRec(b.follow)) { const f = follow(b.follow); if (f) block.follow = f; }
    const fov = num(b.fov);
    if (camera && (word === "behind" || word === "side") && fov !== undefined) block.fov = clamp(fov, FOV_RANGE[0], FOV_RANGE[1]);
    if (camera && b.shot === "-") block.shot = "-";
    return [block];
  }).sort((a, b) => a.from - b.from);
  if (!list.length) return null;
  list[0].from = 0;
  for (let i = 1; i < list.length; i++) { list[i].from = list[i - 1].to; if (list[i].to <= list[i].from) list[i].to = list[i].from + 1; }
  const read = list.length;
  // The camera rig holds at most 32 ranges (camera.ts): the 32nd block runs on to the lane's end.
  let phrases = 0;
  if (camera && list.length > LIMIT.cameraBlocks) {
    const end = list.at(-1)!.to;
    phrases = list.slice(LIMIT.cameraBlocks).filter(b => b.phrase).length;
    list.length = LIMIT.cameraBlocks; list[list.length - 1].to = end;
  }
  return { list, dropped: v.length - read, ...(read > list.length ? { capped: read - list.length, phrases } : {}) };
}

function follow(f: Rec): FollowOffset | undefined {
  const out: FollowOffset = {}, d = num(f.distance), h = num(f.height), a = num(f.angle);
  if (d !== undefined) out.distance = clamp(d, FOLLOW_LIMITS.distance[0], FOLLOW_LIMITS.distance[1]);
  if (h !== undefined) out.height = clamp(h, FOLLOW_LIMITS.height[0], Math.min(FOLLOW_LIMITS.height[1], CAMERA_MAX_HEIGHT));
  if (a !== undefined) out.angle = clamp(a, FOLLOW_LIMITS.angle[0], FOLLOW_LIMITS.angle[1]);
  return Object.keys(out).length ? out : undefined;
}

/** The rig's start framing, each field clamped to the camera's limits (RIG_LIMITS), with a note for each clamped one. */
function rig(r: Rec, notes: string[]): NonNullable<BeatPathState["rig"]> | undefined {
  const out: NonNullable<BeatPathState["rig"]> = {};
  for (const [key, limit, unit] of [["distance", RIG_LIMITS.distance, " m"], ["height", RIG_LIMITS.height, " m"], ["fov", RIG_LIMITS.fov, "°"], ["yaw", RIG_LIMITS.startYaw, "°"]] as const) {
    const v = num(r[key]);
    if (v === undefined) { if (r[key] !== undefined) notes.push(`camera start ${key}: not readable, left as on a blank page`); continue; }
    out[key] = clamp(v, limit[0], limit[1]);
    if (out[key] !== v) notes.push(`camera start ${key} ${v}${unit} → ${out[key]}${unit} (the rig takes ${limit[0]} to ${limit[1]})`);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Hit times (switched-off hits) as the recipe keeps them: finite, 0 to an hour, to the millisecond, once each, sorted, at most 512. */
function times(v: unknown): { list: number[]; cut?: string } | null {
  if (!Array.isArray(v)) return null;
  const read = v.slice(0, LIMIT.scan).flatMap(t => { const n = num(t); return n !== undefined && n >= 0 && n <= LIMIT.seconds ? [ms(n)] : []; });
  const list = [...new Set(read)].sort((a, b) => a - b), cuts: string[] = [];
  if (read.length < v.length) cuts.push(`${v.length - read.length} unreadable dropped`);
  if (list.length > LIMIT.hits) cuts.push(`kept the first ${LIMIT.hits} (the recipe's most)`);
  return { list: list.slice(0, LIMIT.hits), ...(cuts.length ? { cut: cuts.join(", ") } : {}) };
}
