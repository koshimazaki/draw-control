/**
 * The Beat Path page's state is a shot script (docs/recipe.md, "Shot script"): `toScript`
 * prints the state, `fromScript` reads a script back into it. The two lanes are the script's
 * action and camera columns, the paths are its point lists with their `corners` word, and
 * the global lock and "on each hit" are its `lock …` words. A script with words outside the
 * page's vocabulary is read to the nearest page word, and `notes` says what changed.
 */
import { parseRows, parseSettings } from "@motion-studio/core";

export type PathPt = { x: number; z: number; y?: number };
export const CHARACTER_WORDS = ["glide", "hover", "spin", "jump"] as const;
export type CharacterWord = (typeof CHARACTER_WORDS)[number];
export const CAMERA_WORDS = ["behind", "side", "orbit", "top", "path", "push"] as const;
export type CameraWord = (typeof CAMERA_WORDS)[number];
/** A lane block; a camera block may carry a typed phrase (the script's camera words, e.g. "go above then dolly in 2m fast"). */
export type Block<W extends string> = { from: number; to: number; word: W; phrase?: string };
export const LOCK_CHOICES = ["off", "beat", "kick", "snare"] as const;
export type LockChoice = (typeof LOCK_CHOICES)[number];
export const HIT_CHOICES = ["move", "hold", "punch"] as const;
export type HitChoice = (typeof HIT_CHOICES)[number];
export const CLIP_CHOICES = [5, 8] as const;
export type ClipChoice = (typeof CLIP_CHOICES)[number];

export type BeatPathState = {
  /** Clip length, seconds: 5 or 8 (121 or 193 frames at 24 fps). */
  clip: ClipChoice;
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
  /** Hits switched off (onset seconds): skipped by every lock. */
  muted: number[];
  /** The figure's colours (body, head), "#rrggbb". */
  figure: { body: string; head: string };
  /** A suggested prompt line (examples carry one); printed as a comment. */
  prompt?: string;
};

export const LABELS = {
  character: { glide: "Glide", hover: "Hover", spin: "Spin", jump: "Jump" },
  camera: { behind: "Follow behind", side: "Follow side", orbit: "Orbit", top: "Top", path: "My path", push: "Push in" },
  lock: { off: "Off", beat: "Beat", kick: "Kick", snare: "Snare" },
  hit: { move: "Keeps moving", hold: "Holds", punch: "Punches in" },
} as const;

/** The figure's default colours: the guide's orange. */
export const FIGURE_DEFAULT = { body: "#ff6a13", head: "#ff6a13" } as const;

/** Fixed amounts behind the camera words. */
export const CAMERA_AMOUNTS = { orbitPerBeat: 15, pushTo: 2.6, punch: 0.9 } as const;

const f = (x: number) => String(Math.round(x * 1000) / 1000);
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
  const advance = kl.advance && (kl.lock === "kick" || kl.lock === "snare") ? ` @${kl.lock} 1` : "";
  const glide = state.character.find(b => b.word === "glide");
  let pathPrinted = false;
  const lines: string[] = [];
  if (state.prompt) lines.push(`# prompt: ${state.prompt}`);
  lines.push(`# clip: ${state.clip} s · figure: glider · Beat Path`);
  lines.push(`landmarks: ${state.landmarks.on ? `on seed ${state.landmarks.seed}` : "off"}`);
  if (state.muted.length) lines.push(`muted: ${state.muted.map(f).join(" ")}`);
  if (state.figure.body !== FIGURE_DEFAULT.body || state.figure.head !== FIGURE_DEFAULT.head) lines.push(`figure: body ${state.figure.body} head ${state.figure.head}`);
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i], to = edges[i + 1];
    const c = state.character.find(b => b.from === from), k = state.cameraLane.find(b => b.from === from);
    let action = "continue";
    if (c) {
      const mid = Math.round((c.from + c.to)) / 2;
      if (c === glide && state.subject.length >= 2) action = `walk on path ${pts(state.subject)} corners ${f(state.subjectCorners)}${lock}`;
      else if (c.word === "spin" || c.word === "jump") action = `rest, ${c.word} @beat ${f(mid)}`;
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
          behind: "follow behind", side: "follow side", orbit: `orbit ${f(CAMERA_AMOUNTS.orbitPerBeat * len)}`, top: "top",
          path: pathPrinted ? "path" : `path ${pts(state.camera)} corners ${f(state.cameraCorners)}`, push: `push in to ${f(CAMERA_AMOUNTS.pushTo)}m`,
        }[word] + camLock + (k.from > 0 ? advance : "");
        if (word === "path") pathPrinted = true;
        shot = word === "path" ? "-" : word === "top" ? "top" : "wide";
      }
    }
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
export function fromScript(text: string, base: BeatPathState): { state: BeatPathState; notes: string[] } {
  const rows = parseRows(text), notes: string[] = [];
  const state: BeatPathState = { ...structuredClone(base), character: [], cameraLane: [], prompt: undefined };
  const prompt = /^#\s*prompt:\s*(.+)$/im.exec(text);
  if (prompt) state.prompt = prompt[1].trim();
  const clip = /^#\s*clip:\s*(\d+)/im.exec(text);
  if (clip) state.clip = Number(clip[1]) <= 6 ? 5 : 8;
  const parsed = parseSettings(text), settings = parsed.landmarks;
  state.muted = parsed.muted ?? [];
  state.figure = parsed.figure ?? { ...FIGURE_DEFAULT };
  if (settings) state.landmarks = { on: settings.on, seed: settings.seed ?? state.landmarks.seed };
  let charSeen = false, camSeen = false, hitSeen = false, advanceSeen = false;
  const orbits: { index: number; degrees: number; line: number }[] = [];
  const readLock = (cell: string, into: { lock: LockChoice; strength: number }) => {
    const m = /lock\s+(beat|kick|snare|hat)(?:\s+([\d.]+))?/.exec(cell);
    if (!m) return false;
    if (m[1] === "hat") notes.push("hat locks become beat locks");
    into.lock = m[1] === "hat" ? "beat" : (m[1] as LockChoice);
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
      } else if (/\bspin\s*@/.test(a)) word = "spin";
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
    const anchor = /@(kick|snare)\s+1\b/.exec(c);
    if (anchor) { advanceSeen = true; if (!camSeen) state.camLock.lock = anchor[1] as LockChoice; }
    // Anything richer than a lane word stays as the block's phrase (lock words stripped: the lock is global).
    const bare = c.replace(/\s*@(kick|snare)\s+1\b/, "").replace(/\s*\block\s+(beat|kick|snare|hat)(\s+[\d.]+)?(\s+(hold|punch(\s+[\d.]+m?)?))?\s*$/, "").trim();
    const plain = /^(follow behind|follow side|top|push in to 2\.6m|orbit\s+-?[\d.]+)$/.test(bare) || /^path\b/.test(bare) && !/\bthen\b/.test(bare);
    const block: Block<CameraWord> = { from: row.from, to: row.to, word };
    if (!plain) block.phrase = bare.replace(/\(([^)]*)\)\s*/g, "").replace(/\s*corners\s+[\d.]+/, "").trim();
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
      if (to > from) out.push({ word: b.word, from, to });
    }
    out[out.length - 1].to = beats;
    return out;
  };
  return { ...state, character: fit(state.character), cameraLane: fit(state.cameraLane) };
}

/** Only one glide block (the script has one walk path): making one glide turns the others to hover. */
export function setWord<W extends string>(lane: Block<W>[], index: number, word: W, single?: W): Block<W>[] {
  return lane.map((b, i) => (i === index ? { ...b, word } : single && word === single && b.word === single ? { ...b, word: "hover" as W } : b));
}

/** What a script leaves out, before any example is read. */
export const BLANK_STATE: BeatPathState = {
  clip: 8, subject: [], subjectCorners: 0.5, camera: [], cameraCorners: 0.5,
  character: [{ from: 0, to: 17, word: "hover" }], cameraLane: [{ from: 0, to: 17, word: "behind" }],
  charLock: { lock: "kick", strength: 1 }, camLock: { lock: "kick", strength: 1, onHit: "hold", advance: false },
  landmarks: { on: true, seed: 7 }, muted: [], figure: { body: "#ff6a13", head: "#ff6a13" },
};

/** A camera path to start from when "My path" is picked with none drawn: a slow arc in front. */
export const DEFAULT_CAMERA_PATH = [{ x: -7, z: 7, y: 2 }, { x: -2, z: 8.5, y: 2.4 }, { x: 3, z: 8, y: 2.2 }, { x: 7.5, z: 5, y: 2 }];
