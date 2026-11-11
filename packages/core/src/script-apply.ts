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
import { LOCK_TARGETS, type LockTarget } from "./lock";
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
type Cam = { path?: Point[]; modes: CameraMode[]; amount?: number; from?: number; to?: number; lock?: LockTarget; strength?: number; onHit?: "hold" | "punch"; punch?: number; at?: { band: string; index: number } };

const bad = (row: Row, msg: string): never => { throw new RecipeError(`script line ${row.line}: ${msg}`); };
const number = (row: Row, t: string, what: string) => {
  const v = Number(t.replace(/(m|°|deg)$/, ""));
  return Number.isFinite(v) ? v : bad(row, `${what} must be a number (got ${JSON.stringify(t)})`);
};

export function parseRows(script: string): Row[] {
  if (typeof script !== "string" || script.length > 100_000) throw new RecipeError("script must be text up to 100 000 characters");
  const rows: Row[] = [];
  script.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/#.*$/, "").trim();
    if (!text) return;
    const [head, ...cells] = text.split("|").map(c => c.trim());
    const m = /^beats\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/i.exec(head);
    const row: Row = { from: 0, to: 0, line: i + 1 };
    if (!m) bad(row, `a row starts "beats A-B" (got ${JSON.stringify(head)})`);
    row.from = Number(m![1]); row.to = Number(m![2]);
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

type Action = { kind: "continue" | "rest" | "move" | "glide"; move?: string; onPath?: boolean; points?: Point[]; lock?: Lock; hits: Hit[] };
function parseAction(r: Recipe, row: Row): Action {
  const taken = takePoints(row, row.action ?? "continue"), a = parseActionWords(r, row, taken.text);
  if (taken.points) {
    if (!a.onPath) bad(row, "points belong after \"on path\": \"glide on path (0,0) (2,0) (2,3,1.5)\"");
    if (taken.points.length < 2) bad(row, "a path needs at least two points");
    a.points = taken.points;
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
  if (word === "continue" || word === "rest") return { kind: word, hits };
  if (word === "glide") { if (!onPath) bad(row, "glide needs a path: \"glide on path\""); return { kind: "glide", onPath, lock, hits }; }
  const rigged = r.character.kind === "rigged";
  const mapped = ACTION_WORDS[word]?.[rigged ? 0 : 1] ?? (actionVocabulary(r).includes(word) ? word : actionVocabulary(r).find(w => w.toLowerCase() === word));
  if (!mapped) {
    if (isAccentKey(word)) return { kind: "rest", hits: [{ accent: word as AccentKey, band: "beat", index: (row.from + row.to) / 2 }] };
    bad(row, `unknown action ${JSON.stringify(word)} for the ${r.character.kind} character: use one of ${[...actionVocabulary(r), "rest", "continue", "glide on path"].join(", ")}, or an accent (${accentVocabulary().join(", ")}) with an anchor such as @kick 1`);
  }
  return { kind: "move", move: mapped, onPath, lock, hits };
}

function parseCamera(row: Row): Cam | "continue" {
  const taken = takePoints(row, row.camera ?? "continue"), text = taken.text;
  if (text === "continue") return "continue";
  let words = text.split(/\s+/);
  const cam: Cam = { modes: [] };
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
  const rows = parseRows(args.script), bands = ctx.bands ?? ctx.drive?.bands;
  if (rows[rows.length - 1].to > recipe.durationBeats + 1e-6) throw new RecipeError(`script runs to beat ${rows[rows.length - 1].to}, past the recipe's ${recipe.durationBeats} beats`);
  let r: Recipe = validateRecipe({ ...structuredClone(recipe), moves: [] });
  // Action track: blocks from rows, a block running on over `continue` rows.
  type Block = { from: number; to: number; action: Action };
  const blocks: Block[] = [], hits: { row: Row; hit: Hit }[] = [];
  let pathBlock: Block | null = null;
  for (const row of rows) {
    const a = parseAction(r, row);
    const last = blocks[blocks.length - 1];
    if (a.kind === "continue" && last && Math.abs(last.to - row.from) < 1e-6) last.to = row.to;
    else blocks.push({ from: row.from, to: row.to, action: a.kind === "continue" ? { kind: "rest", hits: [] } : a });
    for (const hit of a.hits) hits.push({ row, hit });
    const b = blocks[blocks.length - 1];
    if (b.action.onPath && b !== pathBlock) { if (pathBlock) bad(row, "one walk path: only one block can be \"on path\""); pathBlock = b; }
  }
  if (pathBlock) {
    const glide = pathBlock.action.kind === "glide";
    const pts = pathBlock.action.points;
    r = pts ? setRootPath(r, { points: pts, fromBeat: pathBlock.from, toBeat: pathBlock.to, face: glide ? "hold" : "path", smooth: false })
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
  const given = cams.filter(b => b.cam.path);
  if (given.some(b => JSON.stringify(b.cam.path) !== JSON.stringify(given[0].cam.path))) bad(given[1].row, "one camera path per script: give the points once (later path blocks reuse them)");
  if (given.length && given[0].cam.path!.length > 12) bad(given[0].row, "a camera path in a script takes up to 12 points");
  if (given.length) r = setCameraPath(r, { points: given[0].cam.path!, useMode: false });
  else if (cams.some(b => b.cam.modes.includes("path")) && !r.camera?.path) bad(cams.find(b => b.cam.modes.includes("path"))!.row, "camera: path needs points: \"path (4,2,1.6) (0,2,1.6)\" (x, z, height in metres)");
  for (const b of cams) {
    const { modes, at, path: _path, ...fields } = b.cam;
    void _path;
    let start = b.from;
    if (at) {
      start = resolveAnchor(r, bands, b.row, at.band, at.index);
      const nth = onsetBeats(r, bands, at.band).findIndex(x => Math.abs(x - start) < 1e-6);
      r = startCameraMove(r, { modes, target: at.band, index: nth, lengthBeats: b.to - start, fields: { ...fields, ...b.shot } }, bands);
    } else r = setCameraModes(r, { modes, fromBeat: b.from, toBeat: b.to, fields: { ...fields, ...b.shot } });
  }
  return validateRecipe(r);
}
