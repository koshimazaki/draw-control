/**
 * `frameAt(recipe, n, drive?)`: the full state of frame n. Without `recipe.reactive` it is
 * the time-stretch path (engine.ts). With it, the audio-reactive layer runs on top:
 * tempo and amplitude by energy, accents on hits, overlapping action and seeded
 * variation. Still a pure function of (recipe, drive, n): no state carries between
 * frames, so any frame can be seeked, exported or tested alone.
 */
import { evaluateAccent, proceduralAccent } from "./accents";
import { energyAtSeconds, type AudioDrive } from "./audio-drive";
import { beatAtSeconds } from "./beats";
import { clipFrameAt } from "./clip-perform";
import { baseFrameAt, jumpHeight, poseAtBeat, type FrameState } from "./engine";
import { rootAt } from "./root-travel";
import { JOINTS, mixPoses, poseDistance, scalePose, type Euler3, type JointName, type Pose } from "./poses";
import { planReactive, type BarLevel, type ReactivePlan } from "./reactive";
import { AMPLITUDE_MAX, type Recipe } from "./recipe";
import { envelopeAt } from "./envelope";
import { smoothNoise } from "./rng";
import { frozenBeat } from "./freeze";

/** Beats over which a tempo change cross-fades at a bar line. */
const TEMPO_FADE_BEATS = 0.5;
/** Frames each joint trails the hips at humanise 1: the chain lags outwards from the pelvis. */
export const JOINT_LAG_FRAMES: Record<JointName, number> = {
  pelvis: 0, leftHip: 0, rightHip: 0, leftKnee: 0.5, rightKnee: 0.5,
  spine: 1.5, leftShoulder: 2, rightShoulder: 2, head: 3, leftElbow: 3.5, rightElbow: 3.5,
};
/** Joints that get seeded drift (the upper body), and how far, radians at humanise 1. */
const DRIFT: Partial<Record<JointName, number>> = { spine: 0.05, head: 0.07, leftShoulder: 0.06, rightShoulder: 0.06, leftElbow: 0.08, rightElbow: 0.08 };
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));

let memo: { recipe: Recipe; drive?: AudioDrive; plan: ReactivePlan } | null = null;
/** The reactive plan for a recipe and drive, cached for the last pair seen. */
export function reactivePlanFor(recipe: Recipe, drive?: AudioDrive): ReactivePlan {
  if (!memo || memo.recipe !== recipe || memo.drive !== drive) memo = { recipe, drive, plan: planReactive(recipe, drive) };
  return memo.plan;
}

function levelPose(recipe: Recipe, plan: ReactivePlan, level: BarLevel, beat: number): Pose {
  return level === 0 ? poseAtBeat(plan.idle, beat).pose : poseAtBeat(recipe, beat, level, plan.drive?.bands).pose;
}

/** The move layer at a time: tempo level per bar (cross-faded), amplitude by energy, seeded drift. */
export function movePoseAt(recipe: Recipe, plan: ReactivePlan, seconds: number): Pose {
  const cfg = plan.config, g = recipe.beatGrid;
  const beat = beatAtSeconds(g, seconds);
  const bar = Math.max(0, Math.floor(beat / g.beatsPerBar));
  const level = plan.levels[bar] ?? 1;
  let pose = levelPose(recipe, plan, level, beat);
  const into = beat - bar * g.beatsPerBar;
  const prev = plan.levels[bar - 1];
  if (bar > 0 && prev !== undefined && prev !== level && into < TEMPO_FADE_BEATS) pose = mixPoses(levelPose(recipe, plan, prev, beat), pose, ease(into / TEMPO_FADE_BEATS));
  const e = energyAtSeconds(plan.drive, seconds);
  const h = cfg.humanise;
  const scale = Math.max(0.2, 1 + 1.3 * cfg.amplitude * (cfg.drive ?? 1) * (e - 0.5) + 0.08 * h * smoothNoise(cfg.seed, 1, beat / 2));
  pose = scalePose(pose, scale);
  if (h > 0) {
    JOINTS.forEach((j, i) => {
      const amount = DRIFT[j];
      if (!amount) return;
      const [x, y, z] = pose.joints[j];
      pose.joints[j] = [x + amount * h * smoothNoise(cfg.seed, 20 + i * 3, beat * 0.7), y, z + amount * h * smoothNoise(cfg.seed, 21 + i * 3, beat * 0.7)];
    });
  }
  return pose;
}

/**
 * Overlapping action: each joint samples the move layer a few frames in the past (its
 * lag), plus a little of its own velocity, so the arms and head drag behind the hips and
 * carry past a stop (follow-through).
 */
export function humanisedPoseAt(recipe: Recipe, plan: ReactivePlan, seconds: number): Pose {
  const h = plan.config.humanise, fps = recipe.fps;
  const cache = new Map<number, Pose>();
  const at = (s: number) => { let p = cache.get(s); if (!p) { p = movePoseAt(recipe, plan, s); cache.set(s, p); } return p; };
  const now = at(seconds);
  if (h <= 0) return now;
  const out: Pose = { rootY: now.rootY, joints: { ...now.joints } };
  const carry = 0.35 * h;
  for (const j of JOINTS) {
    const lag = JOINT_LAG_FRAMES[j] * h / fps;
    if (lag <= 0) continue;
    const p = at(seconds - lag).joints[j], q = at(seconds - lag - 2 / fps).joints[j];
    out.joints[j] = [p[0] + carry * (p[0] - q[0]), p[1] + carry * (p[1] - q[1]), p[2] + carry * (p[2] - q[2])] as Euler3;
  }
  return out;
}

/**
 * The full state of frame n: the time-stretch path, the reactive layer or the rigged
 * mannequin's clips, then the amplitude envelope on top (it scales the move on every
 * character: pose angles on the procedural figures, clip amplitude on the rigged one).
 */
/** How far each glider shape leans into a turn: radians of bank per radian a second of turning, and the most it leans. */
const BANK = { flyer: [0.45, 0.65], car: [0.05, 0.08], runner: [0.12, 0.2], glider: [0, 0] } as const;

export function frameAt(recipe: Recipe, frame: number, drive?: AudioDrive): FrameState {
  const state = recipe.freezes?.length ? frozenFrameAt(recipe, frame, drive) : movedFrameAt(recipe, frame, drive);
  if (recipe.character.kind === "glider" && recipe.figure?.shape) {
    // Lean into a turn: from the path's turning rate around this frame (a pure function of the recipe and the frame).
    const g = recipe.beatGrid, yaw = (n: number) => rootAt(recipe, frozenBeat(recipe, beatAtSeconds(g, n / recipe.fps)), drive).yaw * Math.PI / 180;
    const rate = (yaw(frame + 2) - yaw(frame - 2)) / (4 / recipe.fps), [k, max] = BANK[recipe.figure.shape];
    state.root = { ...state.root, bank: Math.max(-max, Math.min(max, -rate * k)) };
  }
  if (!recipe.envelope) return state;
  const env = envelopeAt(recipe.envelope, frame);
  state.envelope = env;
  if (recipe.character.kind === "rigged") state.amplitude = Math.min(AMPLITUDE_MAX, (state.amplitude ?? 1) * env);
  else state.pose = { ...scalePose(state.pose, env), rootY: state.pose.rootY * Math.min(1, env) };
  return state;
}

/** A freeze holds the character: it is evaluated at the frozen time, the frame keeps its real time. */
function frozenFrameAt(recipe: Recipe, frame: number, drive?: AudioDrive): FrameState {
  const g = recipe.beatGrid, beat = beatAtSeconds(g, frame / recipe.fps), held = frozenBeat(recipe, beat);
  const state = movedFrameAt(recipe, (g.offsetSeconds + held * 60 / g.bpm) * recipe.fps, drive);
  return { ...state, frame, seconds: frame / recipe.fps, beat };
}

function movedFrameAt(recipe: Recipe, frame: number, drive?: AudioDrive): FrameState {
  if (recipe.character.kind === "rigged") return clipFrameAt(recipe, frame, drive);
  if (!recipe.reactive) return baseFrameAt(recipe, frame, drive);
  const plan = reactivePlanFor(recipe, drive);
  const seconds = frame / recipe.fps;
  const beat = beatAtSeconds(recipe.beatGrid, seconds);
  const path = rootAt(recipe, beat, drive);
  const root = { x: path.x, y: path.y + jumpHeight(recipe, beat), z: path.z, yawRadians: path.yaw * Math.PI / 180 };
  const base = poseAtBeat(recipe, beat, 1, drive?.bands);
  let pose = humanisedPoseAt(recipe, plan, seconds);
  let accent: FrameState["accent"];
  for (const hit of plan.hits) {
    const accentMove = proceduralAccent(hit.key);
    const s = accentMove ? evaluateAccent(accentMove, beat - hit.beat) : null;
    if (!s) continue;
    pose = mixPoses(pose, s.pose, s.weight);
    root.y += s.lift;
    root.yawRadians += s.spinRadians;
    accent = { key: hit.key, hitSeconds: hit.seconds, weight: s.weight };
  }
  const state: FrameState = { frame, seconds, beat, root, pose, layers: base.layers, active: base.active, energy: energyAtSeconds(drive, seconds) };
  if (accent) state.accent = accent;
  return state;
}

/** Pose speed in radians per second between frame n-1 and n (0 at frame 0). */
export function poseSpeed(recipe: Recipe, frame: number, drive?: AudioDrive): number {
  if (frame <= 0) return 0;
  return poseDistance(frameAt(recipe, frame - 1, drive).pose, frameAt(recipe, frame, drive).pose) * recipe.fps;
}
