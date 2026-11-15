/**
 * The Draw Control page's state is a shot script (docs/recipe.md, "Shot script"): `toScript`
 * prints the state, `fromScript` reads a script back into it. The two lanes are the script's
 * action and camera columns, the paths are its point lists with their `corners` word, and
 * the global lock and "on each hit" are its `lock …` words. A script with words outside the
 * page's vocabulary is read to the nearest page word, and `notes` says what changed.
 */
import { FOV_RANGE, parseRows, parseSettings, type FollowOffset } from "@motion-studio/core";
import { followWords, parseFollowArgs } from "@motion-studio/core/internal";
import { EXAMPLE_TRACKS, type ExampleId } from "./tracks";

export type PathPt = { x: number; z: number; y?: number };
export const CHARACTER_WORDS = ["glide", "hover", "spin", "jump", "hop", "freeze"] as const;
export type CharacterWord = (typeof CHARACTER_WORDS)[number];
export const CAMERA_WORDS = ["behind", "side", "orbit", "top", "path", "push"] as const;
export type CameraWord = (typeof CAMERA_WORDS)[number];
/**
 * A lane block; a camera block may carry a typed phrase (the script's camera words, e.g. "go above then dolly in 2m fast"),
 * and a follow block (behind, side) its offset: distance, height, angle (180 on side = the subject's right), and its own `fov`.
 * A camera block read with `shot: -` where the page would print a framing preset keeps `shot: "-"`: no preset, its own
 * distance, height and fov frame it (a preset would pull the camera to the preset's framing).
 */
export type Block<W extends string> = { from: number; to: number; word: W; phrase?: string; follow?: FollowOffset; fov?: number; shot?: "-" };
/** The page's follow words and the rig mode each prints as. */
export const FOLLOW_WORDS = { behind: "chase", side: "side" } as const;
export const isFollowWord = (w: string): w is keyof typeof FOLLOW_WORDS => w in FOLLOW_WORDS;
const followTail = (word: keyof typeof FOLLOW_WORDS, f?: FollowOffset, fov?: number) => {
  const t = [followWords(FOLLOW_WORDS[word], f), fov !== undefined ? `fov ${Math.round(fov * 1000) / 1000}` : ""].filter(Boolean).join(" ");
  return t ? ` ${t}` : "";
};
export const LOCK_CHOICES = ["off", "beat", "kick", "snare", "hat"] as const;
export type LockChoice = (typeof LOCK_CHOICES)[number];
export const HIT_CHOICES = ["move", "hold", "punch"] as const;
export type HitChoice = (typeof HIT_CHOICES)[number];
/** Clip length in whole seconds, as the video models take it: 3 to 30, marked at 5, 8, 10, 15, 20 and 30. */
export const CLIP_SECONDS = { min: 3, max: 30, marks: [5, 8, 10, 15, 20, 30] } as const;
/** Any typed or scripted length to a clip the page offers: whole seconds, 3 to 30. */
/** The clip's readout: seconds only (frames depend on the model's output rate; the guide itself renders at 24 fps). */
export const clipLabel = (seconds: number) => `${seconds} s`;
export const clampClip = (seconds: number) => Number.isFinite(seconds) ? Math.max(CLIP_SECONDS.min, Math.min(CLIP_SECONDS.max, Math.round(seconds))) : 8;

export type BeatPathState = {
  /** Clip length, whole seconds 3 to 30 (24 fps plus one frame: 121 frames for 5 s, 721 for 30 s). */
  clip: number;
  subject: PathPt[];
  /** 0 sharp (straight segments, hard turns) to 1 round. */
  subjectCorners: number;
  camera: PathPt[];
  cameraCorners: number;
  character: Block<CharacterWord>[];
  cameraLane: Block<CameraWord>[];
  /** The character lane's lock: what the travel lands on (stations), and how strongly. */
  charLock: { lock: LockChoice; strength: number };
  /** The camera lane's own lock: its source and strength, what it does on each hit, and whether its blocks advance on successive hits. */
  camLock: { lock: LockChoice; strength: number; onHit: HitChoice; advance: boolean };
  /** Landmark blocks around the scene (on by default; seed places them). */
  landmarks: { on: boolean; seed: number };
  /** How many detected hits the locks land on, 0–1 (absent: every hit); lower keeps fewer, stronger, spaced ones. */
  sensitivity?: number;
  /** Hits switched off (onset seconds): skipped by every lock. */
  muted: number[];
  /** Hits added by hand (track seconds) in a band: low kick, mid snare, high hat; every lock lands on them too. */
  markers?: { band: "low" | "mid" | "high"; seconds: number }[];
  /** Where the clip starts in a longer track (seconds; beat 0 sits there). Absent: the track's first beat. */
  slice?: number;
  /** The figure's colours (body, head), "#rrggbb". */
  figure: { shape: "glider" | "car" | "flyer" | "runner"; body: string; head: string };
  /** The scenery around the path: none, the seeded scatter, a street of buildings, a city grid. */
  scenery: "none" | "scatter" | "street" | "city";
  /** "clear": nothing crosses the camera's line of sight; "passes": blocks may cross it briefly. */
  sight: "clear" | "passes";
  /** Scenery boxes once edited on the map (they replace the preset's placement). */
  boxes?: { x: number; z: number; w: number; d: number; h: number; yaw?: number }[];
  /** The example's music (tracks.ts), when it ships its own. */
  track?: ExampleId;
  /**
   * The camera rig's start framing (the script's `rig:` line). Frame 0 is the rig start. Each block starts where the block
   * before it ended: a follow offset (distance, height; it wins over a shot preset), a shot preset, a fov and the end of a
   * programmed dolly, push, pull or rise carry on into every later block until another block changes them; a block that sets
   * none of them keeps what it started with. The camera word top (or above) with `shot: -` is the exception: it lifts the
   * camera overhead from those values without changing them, so the block after it comes back to the distance and height
   * from before it (a fov set on it carries on). With the `top` shot preset (`top | shot: top`, what the page prints for a
   * top block) it sets 1.4 m, 6.5 m and fov 45 like any preset, and those carry on. Absent fields (or no rig) keep the Draw
   * Control base: 7 m, 1.6 m, fov 40, yaw 0.
   */
  rig?: { distance?: number; height?: number; fov?: number; yaw?: number };
  /** The shot description that travels with the guide (the legend line is built from the figure's colours). */
  shot: { subject: string; environment: string; action: string };
  /** A suggested prompt line (examples carry one); printed as a comment. */
  prompt?: string;
};

export const LABELS = {
  character: { glide: "Glide", hover: "Hover", spin: "Spin", jump: "Jump", hop: "Hop", freeze: "Freeze" },
  camera: { behind: "Follow behind", side: "Follow side", orbit: "Orbit", top: "Top", path: "My path", push: "Push in" },
  lock: { off: "Off", beat: "Beat", kick: "Kick", snare: "Snare", hat: "Hat" },
  hit: { move: "Keeps moving", hold: "Holds", punch: "Punches in" },
} as const;

/** The figure's default colours: the guide's orange. */
export const FIGURE_DEFAULT = { body: "#ff6a13", head: "#ff6a13" } as const;

/** A plain colour name for a hex colour (for the legend a prompt can quote). */
export function colourName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (sat < 0.18) return l > 0.85 ? "white" : l < 0.18 ? "black" : "grey";
  const h = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360 : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
  return h < 15 || h >= 345 ? "red" : h < 42 ? "orange" : h < 66 ? "yellow" : h < 170 ? "green" : h < 200 ? "teal" : h < 255 ? "blue" : h < 290 ? "purple" : "pink";
}
/** The legend line: which colour is the character, what the grey blocks are. */
export function legendFor(figure: { body: string; head: string }): string {
  const body = colourName(figure.body), head = colourName(figure.head);
  return `the ${body} figure${head !== body ? ` with the ${head} head` : ""} is the character; grey blocks are placeholders for the environment`;
}

/** Fixed amounts behind the camera words. */
export const CAMERA_AMOUNTS = { orbitPerBeat: 15, pushTo: 2.6, punch: 0.9 } as const;

const f = (x: number) => String(Math.round(x * 1000) / 1000);
/** The rig's words after "rig:" ("" when it sets nothing). */
const rigWords = (rig?: BeatPathState["rig"]) => !rig ? "" : [
  rig.distance !== undefined ? `distance ${f(rig.distance)}m` : "", rig.height !== undefined ? `height ${f(rig.height)}m` : "",
  rig.fov !== undefined ? `fov ${f(rig.fov)}` : "", rig.yaw !== undefined ? `yaw ${f(rig.yaw)}` : "",
].filter(Boolean).join(" ");
/** An example's "# track:" words: its file ("file neon-rain-loop.mp3"), else its groove, and its bars when an earlier example has the same groove ("laidback 6 bars"). */
const trackWords = (id: ExampleId) => {
  const t = EXAMPLE_TRACKS[id];
  if (t.file) return `file ${t.name}`;
  const first = Object.values(EXAMPLE_TRACKS).find(o => !o.file && o.groove === t.groove)!;
  return first === t ? t.groove : `${t.groove} ${t.bars} bars`;
};
/** The example a "# track:" comment names: the file, or the groove with the bars picking between examples that share it. */
const trackFrom = (text: string): ExampleId | undefined => {
  const ids = Object.keys(EXAMPLE_TRACKS) as ExampleId[];
  const file = /^#\s*track:\s*file\s+(\S+)/im.exec(text);
  if (file) return ids.find(id => EXAMPLE_TRACKS[id].file && EXAMPLE_TRACKS[id].name === file[1]);
  const m = /^#\s*track:\s*(straight|drive|laidback)(?:\s+(\d+)\s*bars?)?/im.exec(text);
  if (!m) return undefined;
  const list = ids.filter(id => !EXAMPLE_TRACKS[id].file && EXAMPLE_TRACKS[id].groove === m[1]);
  return (m[2] ? list.find(id => EXAMPLE_TRACKS[id].bars === Number(m[2])) : undefined) ?? list[0];
};
const pts = (list: PathPt[]) => list.map(p => `(${f(p.x)},${f(p.z)}${p.y ? `,${f(p.y)}` : ""})`).join(" ");

/** The lanes' cuts, as rows: every block edge on either lane starts a row. */
function cuts(state: BeatPathState): number[] {
  const set = new Set<number>();
  for (const b of [...state.character, ...state.cameraLane]) { set.add(b.from); set.add(b.to); }
  return [...set].sort((a, b) => a - b);
}

export function toScript(state: BeatPathState): string {
  const edges = cuts(state);
  const cl = state.charLock, kl = state.camLock;
  const lock = cl.lock !== "off" ? ` lock ${cl.lock} ${f(cl.strength)}` : "";
  const camLock = kl.lock !== "off" && kl.onHit !== "move" ? ` lock ${kl.lock} ${f(kl.strength)} ${kl.onHit === "punch" ? `punch ${f(CAMERA_AMOUNTS.punch)}m` : "hold"}` : "";
  // Next move on each hit: every camera block after the first starts on the first hit of the camera's source in it.
  const advance = kl.advance && (kl.lock === "kick" || kl.lock === "snare" || kl.lock === "hat") ? ` @${kl.lock} 1` : "";
  const glide = state.character.find(b => b.word === "glide");
  let pathPrinted = false;
  const lines: string[] = [];
  if (state.prompt) lines.push(`# prompt: ${state.prompt}`);
  if (state.track) lines.push(`# track: ${trackWords(state.track)}`);
  lines.push(`# clip: ${state.clip} s · figure: ${state.figure.shape} · Draw Control`);
  const rig = rigWords(state.rig);
  if (rig) lines.push(`rig: ${rig}`);
  lines.push(`landmarks: ${state.landmarks.on ? `on seed ${state.landmarks.seed}` : "off"}`);
  if (state.slice !== undefined) lines.push(`slice: ${f(state.slice)}s`);
  if (state.markers?.length) {
    const word = { low: "kick", mid: "snare", high: "hat" } as const;
    lines.push(`markers: ${(["low", "mid", "high"] as const).map(b => state.markers!.filter(m => m.band === b)).filter(l => l.length).map(l => `${word[l[0].band]} ${l.map(m => f(m.seconds)).join(" ")}`).join(" ")}`);
  }
  if (state.sensitivity !== undefined && state.sensitivity < 1) lines.push(`sensitivity: ${f(state.sensitivity)}`);
  if (state.muted.length) lines.push(`muted: ${state.muted.map(f).join(" ")}`);
  if (state.figure.shape !== "glider" || state.figure.body !== FIGURE_DEFAULT.body || state.figure.head !== FIGURE_DEFAULT.head)
    lines.push(`figure: ${state.figure.shape !== "glider" ? `shape ${state.figure.shape} ` : ""}body ${state.figure.body} head ${state.figure.head}`);
  if (state.scenery !== "scatter" || state.sight === "passes") lines.push(`scenery: ${state.scenery}${state.sight === "passes" ? " sight passes" : ""}`);
  for (const b of state.boxes ?? []) lines.push(`box: ${[b.x, b.z, b.w, b.d, b.h, ...(b.yaw ? [b.yaw] : [])].map(f).join(" ")}`);
  if (state.shot.subject || state.shot.environment || state.shot.action) {
    for (const k of ["subject", "environment", "action"] as const) if (state.shot[k]) lines.push(`shot ${k}: ${state.shot[k].replace(/[\r\n#]+/g, " ").trim()}`);
    lines.push(`shot legend: ${legendFor(state.figure)}`);
  }
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i], to = edges[i + 1];
    const c = state.character.find(b => b.from === from), k = state.cameraLane.find(b => b.from === from);
    let action = "continue";
    if (c) {
      const mid = Math.round((c.from + c.to)) / 2;
      if (c === glide && state.subject.length >= 2) action = `walk on path ${pts(state.subject)} corners ${f(state.subjectCorners)}${lock}`;
      else if (c.word === "spin" || c.word === "jump") action = `rest, ${c.word} @beat ${f(mid)}`;
      // A hop jumps on the first kick of its row while the travel carries on through it (the walk block runs on).
      else if (c.word === "hop") action = "continue, jump @kick 1";
      else if (c.word === "freeze") action = "freeze";
      else action = "rest";
    }
    let camera = "continue", shot = "";
    if (k) {
      const word = k.word === "path" && state.camera.length < 2 ? "behind" : k.word;
      const len = k.to - k.from;
      if (k.phrase) {
        // A typed phrase: printed as typed, with the page's lock words; a path in it uses the drawn camera path.
        const withPath = /\bpath\b/.test(k.phrase) && !pathPrinted && state.camera.length >= 2;
        camera = (withPath ? k.phrase.replace(/\bpath\b/, `path ${pts(state.camera)} corners ${f(state.cameraCorners)}`) : k.phrase) + camLock + (k.from > 0 ? advance : "");
        if (withPath) pathPrinted = true;
        shot = /\bpath\b/.test(k.phrase) ? "-" : /^(go )?(top|above)\b/.test(k.phrase) ? "top" : "wide";
      } else {
        camera = {
          behind: `follow behind${followTail("behind", k.follow, k.fov)}`, side: `follow side${followTail("side", k.follow, k.fov)}`, orbit: `orbit ${f(CAMERA_AMOUNTS.orbitPerBeat * len)}`, top: "top",
          path: pathPrinted ? "path" : `path ${pts(state.camera)} corners ${f(state.cameraCorners)}`, push: `push in to ${f(CAMERA_AMOUNTS.pushTo)}m`,
        }[word] + camLock + (k.from > 0 ? advance : "");
        if (word === "path") pathPrinted = true;
        shot = word === "path" ? "-" : word === "top" ? "top" : "wide";
      }
    }
    if (k?.shot) shot = k.shot;
    lines.push(`beats ${f(from)}-${f(to)} | action: ${action} | camera: ${camera}${shot ? ` | shot: ${shot}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

const pointsIn = (text: string): PathPt[] => [...text.matchAll(/\(([^)]*)\)/g)].map(m => {
  const v = m[1].split(",").map(Number);
  return v.length >= 3 && v[2] ? { x: v[0], z: v[1], y: v[2] } : { x: v[0], z: v[1] };
});
const cornersIn = (text: string) => { const m = /corners\s+([\d.]+)/.exec(text); return m ? Math.max(0, Math.min(1, Number(m[1]))) : undefined; };

/** Read a shot script into the page state (`base` gives what the script leaves out). */
export function fromScript(text: string, base: BeatPathState, grid: { bpm: number; offsetSeconds: number } = { bpm: 120, offsetSeconds: 0 }): { state: BeatPathState; notes: string[] } {
  const rows = parseRows(text, grid), notes: string[] = [];
  const state: BeatPathState = { ...structuredClone(base), character: [], cameraLane: [], prompt: undefined };
  const prompt = /^#\s*prompt:\s*(.+)$/im.exec(text);
  if (prompt) state.prompt = prompt[1].trim();
  const clip = /^#\s*clip:\s*(\d+)/im.exec(text);
  if (clip) {
    state.clip = clampClip(Number(clip[1]));
    if (state.clip !== Number(clip[1])) notes.push(`clip ${clip[1]} s → ${state.clip} s (the page takes ${CLIP_SECONDS.min} to ${CLIP_SECONDS.max} s)`);
  }
  const parsed = parseSettings(text), settings = parsed.landmarks;
  state.muted = parsed.muted ?? [];
  state.sensitivity = parsed.sensitivity !== undefined && parsed.sensitivity < 1 ? Math.round(parsed.sensitivity * 100) / 100 : undefined;
  state.markers = parsed.markers?.length ? parsed.markers : undefined;
  state.slice = parsed.slice;
  state.figure = { shape: parsed.figure?.shape ?? "glider", body: parsed.figure?.body ?? FIGURE_DEFAULT.body, head: parsed.figure?.head ?? FIGURE_DEFAULT.head };
  state.scenery = parsed.scenery ?? (state.landmarks.on ? "scatter" : "none");
  state.sight = parsed.sight ?? "clear";
  state.boxes = parsed.boxes;
  state.track = trackFrom(text);
  state.rig = parsed.rig ? { ...(parsed.rig.distance !== undefined ? { distance: parsed.rig.distance } : {}), ...(parsed.rig.height !== undefined ? { height: parsed.rig.height } : {}),
    ...(parsed.rig.fov !== undefined ? { fov: parsed.rig.fov } : {}), ...(parsed.rig.startYaw !== undefined ? { yaw: parsed.rig.startYaw } : {}) } : undefined;
  state.shot = { subject: parsed.shot?.subject ?? "", environment: parsed.shot?.environment ?? "", action: parsed.shot?.action ?? "" };
  if (settings) state.landmarks = { on: settings.on, seed: settings.seed ?? state.landmarks.seed };
  let charSeen = false, camSeen = false, hitSeen = false, advanceSeen = false;
  const orbits: { index: number; degrees: number; line: number }[] = [];
  const readLock = (cell: string, into: { lock: LockChoice; strength: number }) => {
    const m = /lock\s+(beat|kick|snare|hat)(?:\s+([\d.]+))?/.exec(cell);
    if (!m) return false;
    into.lock = m[1] as LockChoice;
    into.strength = m[2] !== undefined ? Number(m[2]) : 1;
    return true;
  };
  for (const row of rows) {
    const a = row.action ?? "continue";
    if (a === "continue") { const last = state.character.at(-1); if (last) last.to = row.to; }
    else {
      let word: CharacterWord = "hover";
      if (/\bon path\b/.test(a)) {
        word = "glide";
        const p = pointsIn(a);
        if (p.length >= 2) state.subject = p;
        const c = cornersIn(a);
        state.subjectCorners = c ?? 0;
        if (readLock(a, state.charLock)) charSeen = true;
      } else if (/^continue\b/.test(a) && /\b(jump|kick)\s*@/.test(a)) word = "hop";
      else if (/^freeze\b/.test(a)) word = "freeze";
      else if (/\bspin\s*@/.test(a)) word = "spin";
      else if (/\b(jump|kick)\s*@/.test(a)) word = "jump";
      else if (!/^(rest|idle)\b/.test(a)) notes.push(`line ${row.line}: "${a}" reads as hover`);
      state.character.push({ from: row.from, to: row.to, word });
    }
    const c = row.camera ?? "continue";
    if (c === "continue") { const last = state.cameraLane.at(-1); if (last) last.to = row.to; continue; }
    let word: CameraWord = "behind";
    if (/^(follow behind|chase)\b/.test(c)) word = "behind";
    else if (/^(follow side|side)\b/.test(c)) word = "side";
    else if (/^orbit\b/.test(c)) {
      word = "orbit";
      const deg = /^orbit\s+(-?[\d.]+)/.exec(c);
      if (deg) orbits.push({ index: state.cameraLane.length, degrees: Number(deg[1]), line: row.line });
    }
    else if (/^top\b/.test(c)) word = "top";
    else if (/^path\b/.test(c)) {
      word = "path";
      const p = pointsIn(c);
      if (p.length >= 2) { state.camera = p; state.cameraCorners = cornersIn(c) ?? 0.5; }
    } else if (/^(push in|dolly in)\b/.test(c)) word = "push";
    else if (/\b(shoulder)\b/.test(c)) word = "behind";
    else if (/^(go )?above\b/.test(c)) word = "top";
    if (readLock(c, state.camLock)) { state.camLock.onHit = /\bpunch\b/.test(c) ? "punch" : /\bhold\b/.test(c) ? "hold" : "move"; hitSeen = camSeen = true; }
    const anchor = /@(kick|snare|hat)\s+1\b/.exec(c);
    if (anchor) { advanceSeen = true; if (!camSeen) state.camLock.lock = anchor[1] as LockChoice; }
    // Anything richer than a lane word stays as the block's phrase (lock words stripped: the lock is global).
    const bare = c.replace(/\s*@(kick|snare|hat)\s+1\b/, "").replace(/\s*\block\s+(beat|kick|snare|hat)(\s+[\d.]+)?(\s+(hold|punch(\s+[\d.]+m?)?))?\s*$/, "").trim();
    // A follow word with its offset words stays a plain follow block (the offset rides on it).
    const followed = /^follow (behind|side)\s+(.+)$/.exec(bare);
    let follow: FollowOffset | undefined, fov: number | undefined, followOk = false;
    if (followed && !/\b(then|over|shoulder)\b/.test(followed[2])) {
      // A fov rides on the follow block beside its offset ("follow side right distance 6m height 1.6m fov 35").
      const fm = /(?:^|\s)fov\s+(\d+(?:\.\d+)?)(?:°|deg)?(?=\s|$)/.exec(followed[2]);
      const tail = fm ? followed[2].replace(fm[0], " ") : followed[2];
      const fovOk = !fm || (Number(fm[1]) >= FOV_RANGE[0] && Number(fm[1]) <= FOV_RANGE[1]);
      try { follow = parseFollowArgs(followed[1] === "side" ? "side" : "chase", tail.split(/\s+/).filter(Boolean), msg => { throw new Error(msg); }); followOk = fovOk; } catch { followOk = false; }
      if (followOk && fm) fov = Number(fm[1]); else if (!followOk) follow = undefined;
    }
    const plain = followOk || /^(follow behind|follow side|top|push in to 2\.6m|orbit\s+-?[\d.]+)$/.test(bare) || /^path\b/.test(bare) && !/\bthen\b/.test(bare);
    const block: Block<CameraWord> = { from: row.from, to: row.to, word, ...(follow ? { follow } : {}), ...(fov !== undefined ? { fov } : {}) };
    if (!plain) block.phrase = bare.replace(/\(([^)]*)\)\s*/g, "").replace(/\s*corners\s+[\d.]+/, "").trim();
    // "shot: -" on a block the page would give a preset: kept, so the block frames itself.
    if (row.shot === "-" && block.word !== "path" && !/\bpath\b/.test(block.phrase ?? "")) block.shot = "-";
    state.cameraLane.push(block);
  }
  // An orbit whose degrees differ from the page's 15° a beat keeps them as its phrase.
  for (const o of orbits) {
    const b = state.cameraLane[o.index];
    if (!b.phrase && Math.abs(o.degrees - CAMERA_AMOUNTS.orbitPerBeat * (b.to - b.from)) > 1e-6) b.phrase = `orbit ${f(o.degrees)}`;
  }
  if (!charSeen) state.charLock = { ...state.charLock, lock: "off" };
  if (!hitSeen) state.camLock = { ...state.camLock, onHit: "move", ...(advanceSeen ? {} : { lock: "off" as LockChoice }) };
  state.camLock = { ...state.camLock, advance: advanceSeen };
  for (const lane of [state.character, state.cameraLane] as Block<string>[][]) {
    if (!lane.length) lane.push({ from: 0, to: rows.at(-1)!.to, word: lane === state.character ? "hover" : "behind" });
    if (lane[0].from > 0) lane[0].from = 0;
    for (let i = 1; i < lane.length; i++) lane[i].from = lane[i - 1].to;
  }
  return { state, notes };
}

/** Fit the lanes to a clip of `beats`: scaled to it, edges on half beats, every block at least one beat. */
export function fitLanes(state: BeatPathState, beats: number): BeatPathState {
  const fit = <W extends string>(lane: Block<W>[]): Block<W>[] => {
    if (!lane.length) return lane;
    const end = lane.at(-1)!.to, k = beats / end;
    const out: Block<W>[] = [];
    for (const b of lane) {
      const from = out.length ? out.at(-1)!.to : 0;
      const to = Math.min(beats, Math.max(from + 1, Math.round(b.to * k * 2) / 2));
      if (to > from) out.push({ ...b, from, to });
    }
    out[out.length - 1].to = beats;
    return out;
  };
  return { ...state, character: fit(state.character), cameraLane: fit(state.cameraLane) };
}

/** Only one glide block (the script has one walk path): making one glide turns the others to hover. */
export function setWord<W extends string>(lane: Block<W>[], index: number, word: W, single?: W): Block<W>[] {
  // A follow offset stays only on a follow word (a block turned into Orbit or Top drops it); a new word takes its own framing preset.
  const next = (b: Block<W>): Block<W> => {
    const { follow, fov, shot: _shot, ...rest } = b; void _shot;
    return isFollowWord(word) ? { ...rest, word, ...(follow ? { follow } : {}), ...(fov !== undefined ? { fov } : {}) } : { ...rest, word };
  };
  return lane.map((b, i) => (i === index ? next(b) : single && word === single && b.word === single ? { ...b, word: "hover" as W } : b));
}

/** What a script leaves out, before any example is read. */
export const BLANK_STATE: BeatPathState = {
  clip: 8, subject: [], subjectCorners: 0.5, camera: [], cameraCorners: 0.5,
  character: [{ from: 0, to: 17, word: "hover" }], cameraLane: [{ from: 0, to: 17, word: "behind" }],
  charLock: { lock: "kick", strength: 1 }, camLock: { lock: "kick", strength: 1, onHit: "hold", advance: false },
  landmarks: { on: true, seed: 7 }, muted: [], figure: { shape: "glider", body: "#ff6a13", head: "#ff6a13" }, scenery: "scatter", sight: "clear", shot: { subject: "", environment: "", action: "" },
};

/** A camera path to start from when "My path" is picked with none drawn: a slow arc in front. */
export const DEFAULT_CAMERA_PATH = [{ x: -7, z: 7, y: 2 }, { x: -2, z: 8.5, y: 2.4 }, { x: 3, z: 8, y: 2.2 }, { x: 7.5, z: 5, y: 2 }];
