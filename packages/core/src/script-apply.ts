/**
 * `applyScript`: a shot script (shot-script.ts) back into the recipe. The script describes
 * the whole Action and Camera tracks: the move blocks, the edited hit markers and the camera
 * ranges are replaced by its rows (beats past the last row rest and hold the camera); the
 * beat grid, the character, the rig numbers, the envelope and the rest stay. Everything goes
 * through the edit functions the studio and the commands use (insertMove, setMoveFields,
 * addMarker, setRootPath's re-timing, setCameraModes, startCameraMove, setCameraSegment), so
 * the result is a validated recipe. Unknown words fail with the list of valid ones.
 */
import { isAccentKey, type AccentKey } from "./accents";
import type { BandAnalysis } from "./audio-bands";
import type { AudioDrive } from "./audio-drive";
import { secondsAtBeat } from "./beats";
import { DEFAULT_CAMERA, SHOTS, type CameraMode, type Shot } from "./camera";
import { gaitSpeedFor, setCameraModes, setCameraPath, setRootPath, startCameraMove } from "./camera-edits";
import { insertMove } from "./commands";
import { LOCK_TARGETS, lockHits, unmutedBands, type LockTarget } from "./lock";
import { makeMoveFor, onsetBeats, setMoveFields } from "./move-edits";
import { addMarker } from "./performance-edits";
import { DEFAULT_REACTIVE } from "./reactive-config";
import { RecipeError, validateRecipe, type Recipe, type RootPoint } from "./recipe";
import { travelRange } from "./root-travel";
import { ACTION_WORDS, CAMERA_WORDS, accentVocabulary, actionVocabulary, cameraVocabulary } from "./shot-script";

type Lock = { lock: LockTarget; strength?: number };
type Hit = { accent: AccentKey; band: string; index: number };
type Row = { from: number; to: number; line: number; action?: string; camera?: string; shot?: string };
type Point = { x: number; z: number; y?: number };
type Cam = { path?: Point[]; corners?: number; startSeconds?: number; shoulder?: boolean; pace?: "slow" | "fast"; then?: Cam[]; modes: CameraMode[]; amount?: number; from?: number; to?: number; lock?: LockTarget; strength?: number; onHit?: "hold" | "punch"; punch?: number; at?: { band: string; index: number } };

const bad = (row: Row, msg: string): never => { throw new RecipeError(`script line ${row.line}: ${msg}`); };
const number = (row: Row, t: string, what: string) => {
  const v = Number(t.replace(/(m|°|deg)$/, ""));
  return Number.isFinite(v) ? v : bad(row, `${what} must be a number (got ${JSON.stringify(t)})`);
};

/** A settings line: `landmarks: on seed 7` or `landmarks: off` (not a row). */
const SETTING = /^(landmarks|muted|figure|shot (subject|environment|action|legend))\s*:/i;
/** The script's settings lines; a script without one leaves the setting as it was. */
export type ScriptSettings = { landmarks?: { on: boolean; seed?: number }; muted?: number[]; figure?: { body: string; head: string }; shot?: Partial<Record<"subject" | "environment" | "action" | "legend", string>> };
export function parseSettings(script: string): ScriptSettings {
  const out: ScriptSettings = {};
  script.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/#.*$/, "").trim();
    if (!SETTING.test(text)) return;
    const shotLine = /^shot (subject|environment|action|legend)\s*:\s*(.*)$/i.exec(raw.trim());
    if (shotLine) { (out.shot ??= {})[shotLine[1].toLowerCase() as "subject"] = shotLine[2].trim(); return; }
    if (/^figure\s*:/i.test(text)) {
      const m = /^figure\s*:\s*body\s+(#[0-9a-f]{6})(?:\s+head\s+(#[0-9a-f]{6}))?\s*$/i.exec(text);
      if (!m) throw new RecipeError(`script line ${i + 1}: figure reads "figure: body #e8632a head #f2a35e"`);
      out.figure = { body: m[1].toLowerCase(), head: (m[2] ?? m[1]).toLowerCase() };
      return;
    }
    if (/^muted\s*:/i.test(text)) {
      const list = text.replace(/^muted\s*:/i, "").trim().split(/[\s,]+/).filter(Boolean).filter(w => w !== "none").map(w => Number(w.replace(/s$/, "")));
      if (list.some(t => !Number.isFinite(t) || t < 0)) throw new RecipeError(`script line ${i + 1}: muted lists hit times in seconds: "muted: 1.6 2.35" (or "muted: none")`);
      out.muted = list;
      return;
    }
    const m = /^landmarks\s*:\s*(on|off)(?:\s+seed\s+(\d+))?\s*$/i.exec(text);
    if (!m) throw new RecipeError(`script line ${i + 1}: landmarks reads "landmarks: on seed 7" or "landmarks: off"`);
    out.landmarks = { on: m[1].toLowerCase() === "on", ...(m[2] !== undefined ? { seed: Number(m[2]) } : {}) };
  });
  return out;
}

export function parseRows(script: string, grid?: { bpm: number; offsetSeconds: number }): Row[] {
  if (typeof script !== "string" || script.length > 100_000) throw new RecipeError("script must be text up to 100 000 characters");
  const rows: Row[] = [];
  script.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/#.*$/, "").trim();
    if (!text || SETTING.test(text)) return;
    const [head, ...cells] = text.split("|").map(c => c.trim());
    const m = /^(?:beats|seconds)\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)s?$/i.exec(head);
    const row: Row = { from: 0, to: 0, line: i + 1 };
    if (!m) bad(row, `a row starts "beats A-B" (got ${JSON.stringify(head)})`);
    row.from = Number(m![1]); row.to = Number(m![2]);
    // A row in seconds ("seconds 0-2 | …") is converted through the tempo when a grid is given.
    if (/^seconds/i.test(head)) {
      if (!grid) bad(row, "a row in seconds needs the recipe's tempo");
      const toBeat = (t: number) => Math.round((t - grid!.offsetSeconds) * grid!.bpm / 60 * 1000) / 1000;
      row.from = Math.max(0, toBeat(row.from)); row.to = toBeat(row.to);
    }
    if (!(row.to > row.from)) bad(row, "the end beat must be after the start");
    if (rows.length && row.from < rows[rows.length - 1].to - 1e-6) bad(row, "rows must be in order and must not overlap");
    for (const cell of cells) {
      const c = /^(action|camera|shot)\s*:\s*(.*)$/i.exec(cell);
      if (!c) bad(row, `columns are action:, camera: and shot: (got ${JSON.stringify(cell)})`);
      (row as Record<string, unknown>)[c![1].toLowerCase()] = c![2].trim().toLowerCase();
    }
    rows.push(row);
  });
  if (!rows.length) throw new RecipeError("script has no rows");
  return rows;
}

/** Points "(x,z)" or "(x,z,height)" in metres, taken out of a column's text. */
function takePoints(row: Row, text: string): { text: string; points?: Point[] } {
  const points: Point[] = [];
  const rest = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const v = inner.split(",").map(t => Number(t.trim()));
    if ((v.length !== 2 && v.length !== 3) || v.some(x => !Number.isFinite(x))) bad(row, `a point reads (x,z) or (x,z,height) in metres (got (${inner}))`);
    points.push(v.length === 3 ? { x: v[0], z: v[1], y: v[2] } : { x: v[0], z: v[1] });
    return " ";
  }).replace(/\s+/g, " ").trim();
  if (/[()]/.test(rest)) bad(row, "unbalanced brackets in a point list");
  return points.length ? { text: rest, points } : { text: rest };
}

/** "corners 0.6" (corner rounding of the row's path, 0–1) taken out of a column's text. */
function takeCorners(row: Row, text: string): { text: string; corners?: number } {
  const m = /(?:^|\s)corners\s+(\S+)/.exec(text);
  if (!m) return { text };
  const corners = number(row, m[1], "corners");
  if (corners < 0 || corners > 1) bad(row, "corners runs from 0 (sharp) to 1 (round)");
  return { text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(), corners };
}

/** "lock kick 0.8" at the end of a word list; returns the remaining words. */
function takeLock(row: Row, words: string[]): { words: string[]; lock?: Lock; rest: string[] } {
  const k = words.indexOf("lock");
  if (k < 0) return { words, rest: [] };
  const target = words[k + 1] as LockTarget;
  if (!LOCK_TARGETS.includes(target)) bad(row, `lock takes one of ${LOCK_TARGETS.join(", ")}`);
  const lock: Lock = { lock: target };
  let j = k + 2;
  if (words[j] !== undefined && /^\d*\.?\d+$/.test(words[j])) lock.strength = number(row, words[j++], "lock strength");
  return { words: words.slice(0, k), lock, rest: words.slice(j) };
}

function parseHit(row: Row, item: string): Hit {
  const m = /^([a-z]+)\s*@\s*(kick|snare|hat|beat)\s+(\d+(?:\.\d+)?)$/.exec(item.trim());
  if (!m) bad(row, `an accent reads "jump @kick 2" (got ${JSON.stringify(item)})`);
  if (!isAccentKey(m![1])) bad(row, `unknown accent ${JSON.stringify(m![1])}: use one of ${accentVocabulary().join(", ")}`);
  return { accent: m![1] as AccentKey, band: m![2], index: Number(m![3]) };
}

type Action = { kind: "continue" | "rest" | "move" | "glide" | "freeze"; move?: string; onPath?: boolean; points?: Point[]; corners?: number; lock?: Lock; hits: Hit[] };
function parseAction(r: Recipe, row: Row): Action {
  const taken = takePoints(row, row.action ?? "continue"), shaped = takeCorners(row, taken.text), a = parseActionWords(r, row, shaped.text);
  if (taken.points) {
    if (!a.onPath) bad(row, "points belong after \"on path\": \"glide on path (0,0) (2,0) (2,3,1.5)\"");
    if (taken.points.length < 2) bad(row, "a path needs at least two points");
    a.points = taken.points;
  }
  if (shaped.corners !== undefined) {
    if (!taken.points) bad(row, "corners belongs to a path given by points: \"walk on path (0,0) (2,0) (2,3) corners 0.5\"");
    a.corners = shaped.corners;
  }
  return a;
}
function parseActionWords(r: Recipe, row: Row, text: string): Action {
  const items = text.split(",").map(s => s.trim()).filter(Boolean);
  const hits: Hit[] = [];
  while (items.length && items[items.length - 1].includes("@")) hits.unshift(parseHit(row, items.pop()!));
  if (items.length > 1) bad(row, "one move per row, then accents: \"run, jump @kick 2\"");
  if (!items.length) return { kind: "rest", hits };
  const { words, lock } = takeLock(row, items[0].split(/\s+/));
  const onPath = words.length >= 3 && words.slice(-2).join(" ") === "on path";
  const word = (onPath ? words.slice(0, -2) : words).join(" ");
  if (word === "continue" || word === "rest" || word === "freeze") return { kind: word, hits };
  if (word === "glide") { if (!onPath) bad(row, "glide needs a path: \"glide on path\""); return { kind: "glide", onPath, lock, hits }; }
  const rigged = r.character.kind === "rigged";
  const mapped = ACTION_WORDS[word]?.[rigged ? 0 : 1] ?? (actionVocabulary(r).includes(word) ? word : actionVocabulary(r).find(w => w.toLowerCase() === word));
  if (!mapped) {
    if (isAccentKey(word)) return { kind: "rest", hits: [{ accent: word as AccentKey, band: "beat", index: (row.from + row.to) / 2 }] };
    bad(row, `unknown action ${JSON.stringify(word)} for the ${r.character.kind} character: use one of ${[...actionVocabulary(r), "rest", "continue", "glide on path"].join(", ")}, or an accent (${accentVocabulary().join(", ")}) with an anchor such as @kick 1`);
  }
  return { kind: "move", move: mapped, onPath, lock, hits };
}

/** Words that only read well: "go above", "then go top". */
const FILLER = new Set(["go", "and"]);

function parseCamera(row: Row): Cam | "continue" {
  const taken = takePoints(row, row.camera ?? "continue"), shaped = takeCorners(row, taken.text), text = shaped.text;
  if (text === "continue") return "continue";
  // "A then B": two moves in one block, split evenly (or on a locked hit near the middle) when applied.
  const parts = text.split(/\s+then\s+/);
  if (parts.length > 1) {
    if (parts.length > 4) bad(row, "a block chains at most four moves with then");
    const cams = parts.map(t => parseCameraWords(row, t, /\bpath\b/.test(t) ? taken.points : undefined, /\bpath\b/.test(t) ? shaped.corners : undefined));
    const last = cams[cams.length - 1];
    // The lock (and pace) at the end of the chain belong to every move in it.
    for (const c of cams) for (const k of ["lock", "strength", "onHit", "punch"] as const) if (c[k] === undefined && last[k] !== undefined) (c as Record<string, unknown>)[k] = last[k];
    return { ...cams[0], then: cams.slice(1) };
  }
  return parseCameraWords(row, text, taken.points, shaped.corners);
}

function parseCameraWords(row: Row, text: string, points: Point[] | undefined, corners: number | undefined): Cam {
  let words = text.split(/\s+/).filter(w => !FILLER.has(w));
  const cam: Cam = { modes: [] };
  // "at 2s": the block starts at that time (the camera holds until then), as a spoken direction says it.
  const atS = words.findIndex((w, i) => w === "at" && /^\d+(\.\d+)?s$/.test(words[i + 1] ?? ""));
  if (atS >= 0) { cam.startSeconds = Number(words[atS + 1].slice(0, -1)); words = words.filter((_, i) => i !== atS && i !== atS + 1); }
  const paceAt = words.findIndex(w => w === "slow" || w === "even" || w === "fast");
  if (paceAt >= 0) { if (words[paceAt] !== "even") cam.pace = words[paceAt] as "slow" | "fast"; words = words.filter((_, i) => i !== paceAt); }
  const taken = { points }, shaped = { corners };
  if (shaped.corners !== undefined) {
    if (!taken.points) bad(row, "corners belongs to a camera path given by points: \"path (4,2,1.6) (0,2,1.6) corners 0.5\"");
    cam.corners = shaped.corners;
  }
  if (taken.points) {
    if (taken.points.length < 2) bad(row, "a camera path needs at least two points");
    cam.path = taken.points;
  }
  const at = words.findIndex(w => w.startsWith("@"));
  if (at >= 0) {
    const band = words[at].slice(1), index = Number(words[at + 1]);
    if (!["kick", "snare", "hat"].includes(band) || !Number.isInteger(index) || index < 1) bad(row, "a camera start reads \"@snare 1\"");
    cam.at = { band, index };
    words = [...words.slice(0, at), ...words.slice(at + 2)];
  }
  const locked = takeLock(row, words);
  if (locked.lock) {
    Object.assign(cam, locked.lock);
    const tail = locked.rest;
    if (tail[0] === "punch") { cam.onHit = "punch"; if (tail[1]) cam.punch = number(row, tail[1], "punch depth"); }
    else if (tail[0] === "hold") cam.onHit = "hold";
    else if (tail.length) bad(row, `after the lock comes hold or punch (got ${JSON.stringify(tail.join(" "))})`);
  }
  for (const part of locked.words.join(" ").split("+").map(s => s.trim())) {
    const key = Object.keys(CAMERA_WORDS).sort((a, b) => b.length - a.length).find(k => part === k || part.startsWith(`${k} `));
    if (!key) bad(row, `unknown camera move ${JSON.stringify(part)}: use one of ${cameraVocabulary().join(", ")}`);
    const mode = CAMERA_WORDS[key!], args = part.slice(key!.length).trim().split(/\s+/).filter(Boolean);
    cam.modes.push(mode);
    if (key === "over shoulder" || key === "shoulder") cam.shoulder = true;
    if (!args.length) continue;
    const toAt = args.indexOf("to");
    if (mode === "orbit" || mode === "truck") cam.amount = number(row, args[0], `${key} amount`) * (key === "truck left" ? -1 : 1);
    else if (mode === "pushIn" || mode === "pullOut") { if (toAt === 0) cam.to = number(row, args[1], "end distance"); else cam.amount = number(row, args[0], "dolly amount"); }
    else if (mode === "rise") {
      if (key === "jib up" || key === "jib down") cam.amount = number(row, args[0], "jib amount") * (key === "jib down" ? -1 : 1);
      else if (toAt === 0) cam.to = number(row, args[1], "end height");
      else { cam.from = number(row, args[0], "start height"); if (toAt === 1) cam.to = number(row, args[2], "end height"); }
    } else bad(row, `${key} takes no amount`);
  }
  if (cam.path && !cam.modes.includes("path")) bad(row, "camera points belong after \"path\": \"camera: path (4,2,1.6) (0,2,1.6)\"");
  return cam;
}

function parseShot(row: Row): { shot?: Shot; cut?: boolean } {
  if (!row.shot || row.shot === "-") return {};
  const [name, flag] = row.shot.split(/\s+/);
  if (!SHOTS.includes(name as Shot)) bad(row, `unknown shot ${JSON.stringify(name)}: use one of ${SHOTS.join(", ")} or -`);
  if (flag && flag !== "cut") bad(row, "after the shot only \"cut\" may follow");
  return { shot: name as Shot, ...(flag ? { cut: true } : {}) };
}

/** The beat of the Nth (1-based) onset of a band inside a row, or a beat. */
function resolveAnchor(r: Recipe, bands: BandAnalysis | undefined, row: Row, band: string, index: number): number {
  if (band === "beat") return index;
  const list = onsetBeats(r, bands, band).filter(b => b >= row.from - 1e-6 && b < row.to - 1e-6);
  if (!list.length) return bad(row, `no ${band}s in beats ${row.from}-${row.to}${bands ? "" : " (analyse a track first: --analysis)"}`);
  if (!Number.isInteger(index) || index < 1 || index > list.length) return bad(row, `@${band} ${index}: beats ${row.from}-${row.to} have ${list.length} ${band}s (count from 1)`);
  return list[index - 1];
}

/** Re-time the drawn walk path onto a new range, keeping its shape (facing along it, or held for a glide). */
function retimePath(r: Recipe, from: number, to: number, glide: boolean): RootPoint[] {
  const travel = travelRange(r.rootPath);
  if (!travel) throw new RecipeError("\"on path\" needs a drawn walk path (setRootPath, or Draw walk path in the studio)");
  const moving = r.rootPath.filter(p => p.beat >= travel.from - 1e-6);
  const k = (to - from) / (travel.to - travel.from), r3 = (x: number) => Math.round(x * 1000) / 1000;
  const pts = moving.map(p => ({ ...p, beat: r3(from + (p.beat - travel.from) * k) }));
  if (!glide) pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    if (a.x !== b.x || a.z !== b.z) p.yaw = r3(Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI);
  });
  return from > 0 ? [{ ...pts[0], beat: 0 }, ...pts] : pts;
}

export function applyScript(recipe: Recipe, args: { script: string }, ctx: { bands?: BandAnalysis; drive?: AudioDrive } = {}): Recipe {
  const rows = parseRows(args.script, recipe.beatGrid), bands = ctx.bands ?? ctx.drive?.bands;
  const freezes: { fromBeat: number; toBeat: number }[] = [];
  if (rows[rows.length - 1].to > recipe.durationBeats + 1e-6) throw new RecipeError(`script runs to beat ${rows[rows.length - 1].to}, past the recipe's ${recipe.durationBeats} beats`);
  let r: Recipe = validateRecipe({ ...structuredClone(recipe), moves: [] });
  const settings = parseSettings(args.script);
  if (settings.muted) r = validateRecipe({ ...r, mutedHits: settings.muted });
  if (settings.figure) r = validateRecipe({ ...r, figure: settings.figure });
  if (settings.shot) r = validateRecipe({ ...r, shot: { subject: "", environment: "", action: "", legend: "", ...r.shot, ...settings.shot } });
  if (settings.landmarks) r = validateRecipe({ ...r, landmarks: { seed: settings.landmarks.seed ?? recipe.landmarks?.seed ?? 7, on: settings.landmarks.on } });
  // Action track: blocks from rows, a block running on over `continue` rows.
  type Block = { from: number; to: number; action: Action };
  const blocks: Block[] = [], hits: { row: Row; hit: Hit }[] = [];
  let pathBlock: Block | null = null;
  for (const row of rows) {
    const a = parseAction(r, row);
    const last = blocks[blocks.length - 1];
    // freeze: the block above carries on underneath, and the character holds still over the row.
    if (a.kind === "freeze") freezes.push({ fromBeat: row.from, toBeat: row.to });
    if ((a.kind === "continue" || a.kind === "freeze") && last && Math.abs(last.to - row.from) < 1e-6) last.to = row.to;
    else blocks.push({ from: row.from, to: row.to, action: a.kind === "continue" || a.kind === "freeze" ? { kind: "rest", hits: [] } : a });
    for (const hit of a.hits) hits.push({ row, hit });
    const b = blocks[blocks.length - 1];
    if (b.action.onPath && b !== pathBlock) { if (pathBlock) bad(row, "one walk path: only one block can be \"on path\""); pathBlock = b; }
  }
  const nextRecipe = structuredClone(r);
  if (freezes.length) nextRecipe.freezes = freezes; else delete nextRecipe.freezes;
  r = validateRecipe(nextRecipe);
  if (pathBlock) {
    const glide = pathBlock.action.kind === "glide";
    const pts = pathBlock.action.points;
    r = pts ? setRootPath(r, { points: pts, fromBeat: pathBlock.from, toBeat: pathBlock.to, face: glide ? "hold" : "path", smooth: false, corners: pathBlock.action.corners })
      : validateRecipe({ ...r, rootPath: retimePath(recipe, pathBlock.from, pathBlock.to, glide) });
    const lock = pathBlock.action.lock;
    if (lock) r = { ...r, travelLock: lock }; else delete r.travelLock;
  }
  for (const b of blocks) {
    if (b.action.kind !== "move") continue;
    const m = makeMoveFor(r, b.action.move!, b.from);
    if (b === pathBlock) {
      m.id = `${m.id}-path`;
      let len = 0;
      for (let i = 1; i < r.rootPath.length; i++) len += Math.hypot(r.rootPath[i].x - r.rootPath[i - 1].x, r.rootPath[i].z - r.rootPath[i - 1].z);
      const sp = gaitSpeedFor(b.action.move!, len / ((b.to - b.from) * 60 / r.beatGrid.bpm), r.beatGrid.bpm);
      if (sp !== undefined && sp !== 1) m.speed = sp;
    }
    m.lengthBeats = Math.round((b.to - b.from) * 1e4) / 1e4;
    r = insertMove(r, { move: m, atBeat: b.from });
    if (b.action.lock) r = setMoveFields(r, { moveId: m.id, lock: b.action.lock.lock, strength: b.action.lock.strength });
  }
  // Hit markers: the script's accents replace the edited ones (detected markers stay detected without any).
  if (hits.length || recipe.reactive?.markers) {
    r = validateRecipe({ ...r, reactive: { ...(r.reactive ?? { ...DEFAULT_REACTIVE, accents: [] }), markers: [] } });
    for (const { row, hit } of hits) {
      const beat = hit.band === "beat" ? hit.index : resolveAnchor(r, bands, row, hit.band, hit.index);
      r = addMarker(r, ctx.drive, secondsAtBeat(r.beatGrid, beat), hit.accent);
    }
  }
  // Camera track.
  const anyCamera = rows.some(row => row.camera !== undefined);
  if (!anyCamera) return validateRecipe(r);
  r = validateRecipe({ ...r, camera: { ...(r.camera ?? DEFAULT_CAMERA), segments: [{ fromBeat: 0, toBeat: r.durationBeats, modes: ["static"] }] } });
  type CamBlock = { from: number; to: number; cam: Cam; shot: ReturnType<typeof parseShot>; row: Row };
  const cams: CamBlock[] = [];
  for (const row of rows) {
    const c = parseCamera(row), last = cams[cams.length - 1];
    if (c === "continue") {
      if (row.shot) bad(row, "a shot belongs to the row that starts the camera block");
      if (last && Math.abs(last.to - row.from) < 1e-6) { last.to = row.to; continue; }
      cams.push({ from: row.from, to: row.to, cam: { modes: ["static"] }, shot: {}, row });
    } else cams.push({ from: row.from, to: row.to, cam: c, shot: parseShot(row), row });
  }
  // Chains ("A then B") become blocks of their own: an even split, moved to a locked hit near each cut.
  for (let i = 0; i < cams.length; i++) {
    const b = cams[i], chain = b.cam.then;
    if (!chain?.length) continue;
    const list = [{ ...b.cam, then: undefined }, ...chain], len = (b.to - b.from) / list.length;
    const hits = b.cam.lock ? lockHits(r.beatGrid, unmutedBands(bands, r.mutedHits), b.cam.lock, b.from, b.to) : [];
    const cuts = list.slice(1).map((_, k) => {
      const even = b.from + len * (k + 1), near = hits.filter(h => Math.abs(h - even) <= len * 0.25).sort((x, y) => Math.abs(x - even) - Math.abs(y - even))[0];
      return Math.round((near ?? even) * 1000) / 1000;
    });
    const edges = [b.from, ...cuts, b.to];
    cams.splice(i, 1, ...list.map((cam, k) => ({ from: edges[k], to: edges[k + 1], cam, shot: k === 0 ? b.shot : {}, row: b.row })));
    i += list.length - 1;
  }
  const given = cams.filter(b => b.cam.path);
  if (given.some(b => JSON.stringify([b.cam.path, b.cam.corners]) !== JSON.stringify([given[0].cam.path, given[0].cam.corners]))) bad(given[1].row, "one camera path per script: give the points once (later path blocks reuse them)");
  if (given.length && given[0].cam.path!.length > 12) bad(given[0].row, "a camera path in a script takes up to 12 points");
  if (given.length) r = setCameraPath(r, { points: given[0].cam.path!, useMode: false, corners: given[0].cam.corners });
  else if (cams.some(b => b.cam.modes.includes("path")) && !r.camera?.path) bad(cams.find(b => b.cam.modes.includes("path"))!.row, "camera: path needs points: \"path (4,2,1.6) (0,2,1.6)\" (x, z, height in metres)");
  for (const b of cams) {
    const { modes, at, path: _path, corners: _corners, then: _then, startSeconds, ...fields } = b.cam;
    void _path; void _corners; void _then;
    let start = b.from;
    if (startSeconds !== undefined) {
      start = Math.round((startSeconds - r.beatGrid.offsetSeconds) * r.beatGrid.bpm / 60 * 1000) / 1000;
      if (!(start >= b.from - 1e-6 && start < b.to - 1e-6)) bad(b.row, `at ${startSeconds}s is outside the row's beats ${b.from}-${b.to}`);
      r = setCameraModes(r, { modes, fromBeat: start, toBeat: b.to, fields: { ...fields, ...b.shot } });
      continue;
    }
    if (at) {
      start = resolveAnchor(r, bands, b.row, at.band, at.index);
      const nth = onsetBeats(r, bands, at.band).findIndex(x => Math.abs(x - start) < 1e-6);
      r = startCameraMove(r, { modes, target: at.band, index: nth, lengthBeats: b.to - start, fields: { ...fields, ...b.shot } }, bands);
    } else r = setCameraModes(r, { modes, fromBeat: b.from, toBeat: b.to, fields: { ...fields, ...b.shot } });
  }
  return validateRecipe(r);
}
