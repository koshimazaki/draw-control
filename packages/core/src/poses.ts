/**
 * Joint set and pose library for the procedural characters.
 *
 * Conventions (Three.js, Y up, the character faces +Z, its left hand is at +X):
 * - every joint holds an Euler XYZ rotation in radians, relative to the rest pose;
 * - at rest the arms hang down and the legs point down;
 * - shoulder x < 0 swings the arm forward, shoulder z > 0 raises the left arm sideways
 *   (z < 0 for the right arm); elbow x < 0 bends the forearm forward;
 * - hip x < 0 swings the leg forward; knee x > 0 bends the shin back;
 * - spine x > 0 leans forward; spine z > 0 bends towards the character's right;
 * - `rootY` is a vertical offset of the pelvis in metres (negative = crouch).
 */
export const JOINTS = [
  "pelvis", "spine", "head",
  "leftShoulder", "leftElbow", "rightShoulder", "rightElbow",
  "leftHip", "leftKnee", "rightHip", "rightKnee",
] as const;
export type JointName = (typeof JOINTS)[number];
export type Euler3 = readonly [number, number, number];
export type Pose = { rootY: number; joints: Record<JointName, Euler3> };

const ZERO: Euler3 = [0, 0, 0];

export function neutralPose(): Pose {
  const joints = {} as Record<JointName, Euler3>;
  for (const j of JOINTS) joints[j] = ZERO;
  return { rootY: 0, joints };
}

/** Build a pose from the joints that differ from rest. */
function pose(rootY: number, partial: Partial<Record<JointName, Euler3>>): Pose {
  const p = neutralPose();
  p.rootY = rootY;
  for (const [k, v] of Object.entries(partial)) p.joints[k as JointName] = v as Euler3;
  return p;
}

const ARMS_RELAXED = { leftShoulder: [0, 0, 0.12], rightShoulder: [0, 0, -0.12], leftElbow: [-0.25, 0, 0], rightElbow: [-0.25, 0, 0] } as const;

export const POSES = {
  neutral: neutralPose(),
  ready: pose(-0.04, { ...ARMS_RELAXED, leftHip: [-0.12, 0, 0], rightHip: [-0.12, 0, 0], leftKnee: [0.22, 0, 0], rightKnee: [0.22, 0, 0] }),
  // Bounce reads from the front as well as the side: the knees turn out (a plié, the leg's
  // bend plane yawed 0.5 rad outwards, so the feet stay under the hips), the pelvis drops by
  // the leg's lost height, and the arms open and pump. Hip Eulers are Ry(±0.5)·Rx(-0.5) in XYZ order.
  bounceDown: pose(-0.105, { spine: [0.1, 0, 0], head: [0.12, 0, 0], leftHip: [-0.557, 0.434, 0.256], rightHip: [-0.557, -0.434, -0.256], leftKnee: [1.0, 0, 0], rightKnee: [1.0, 0, 0], leftShoulder: [0, 0, 0.5], rightShoulder: [0, 0, -0.5], leftElbow: [-1.2, 0, 0], rightElbow: [-1.2, 0, 0] }),
  bounceUp: pose(0, { leftShoulder: [0, 0, 0.18], rightShoulder: [0, 0, -0.18], leftElbow: [-0.35, 0, 0], rightElbow: [-0.35, 0, 0], leftKnee: [0.05, 0, 0], rightKnee: [0.05, 0, 0] }),
  armsOut: pose(0, { leftShoulder: [0, 0, 1.5], rightShoulder: [0, 0, -1.5] }),
  armsUp: pose(0.02, { leftShoulder: [0, 0, 2.6], rightShoulder: [0, 0, -2.6], head: [-0.2, 0, 0] }),
  clapFront: pose(-0.03, { leftShoulder: [-1.35, 0, -0.25], rightShoulder: [-1.35, 0, 0.25], leftElbow: [-0.35, 0, 0], rightElbow: [-0.35, 0, 0], leftKnee: [0.15, 0, 0], rightKnee: [0.15, 0, 0], leftHip: [-0.08, 0, 0], rightHip: [-0.08, 0, 0] }),
  stepLeft: pose(-0.03, { pelvis: [0, 0, -0.08], spine: [0, 0, 0.1], leftHip: [0, 0, 0.25], leftKnee: [0.1, 0, 0], rightKnee: [0.45, 0, 0], rightHip: [-0.2, 0, 0], leftShoulder: [0, 0, 0.5], rightShoulder: [0, 0, -0.2], leftElbow: [-0.6, 0, 0], rightElbow: [-0.6, 0, 0] }),
  stepRight: pose(-0.03, { pelvis: [0, 0, 0.08], spine: [0, 0, -0.1], rightHip: [0, 0, -0.25], rightKnee: [0.1, 0, 0], leftKnee: [0.45, 0, 0], leftHip: [-0.2, 0, 0], rightShoulder: [0, 0, -0.5], leftShoulder: [0, 0, 0.2], leftElbow: [-0.6, 0, 0], rightElbow: [-0.6, 0, 0] }),
  pointUpRight: pose(0, { pelvis: [0, 0.2, 0], spine: [0, 0, 0.15], rightShoulder: [0, 0, -2.7], rightElbow: [0, 0, 0], leftShoulder: [0.2, 0, 0.35], leftElbow: [-1.2, 0, 0], rightHip: [0, 0, -0.2], leftKnee: [0.25, 0, 0] }),
  pointDownLeft: pose(-0.05, { pelvis: [0, -0.2, 0], spine: [0.15, 0, -0.15], rightShoulder: [-0.4, 0, 0.6], rightElbow: [-0.3, 0, 0], leftShoulder: [0.2, 0, 0.3], leftElbow: [-1.2, 0, 0], leftHip: [0, 0, 0.2], rightKnee: [0.3, 0, 0] }),
  walkA: pose(0, { leftHip: [-0.45, 0, 0], leftKnee: [0.1, 0, 0], rightHip: [0.35, 0, 0], rightKnee: [0.45, 0, 0], leftShoulder: [0.4, 0, 0.08], rightShoulder: [-0.4, 0, -0.08], leftElbow: [-0.2, 0, 0], rightElbow: [-0.5, 0, 0] }),
  walkB: pose(0, { rightHip: [-0.45, 0, 0], rightKnee: [0.1, 0, 0], leftHip: [0.35, 0, 0], leftKnee: [0.45, 0, 0], rightShoulder: [0.4, 0, -0.08], leftShoulder: [-0.4, 0, 0.08], rightElbow: [-0.2, 0, 0], leftElbow: [-0.5, 0, 0] }),
  runA: pose(0.04, { spine: [0.25, 0, 0], leftHip: [-0.9, 0, 0], leftKnee: [0.9, 0, 0], rightHip: [0.5, 0, 0], rightKnee: [1.2, 0, 0], leftShoulder: [0.7, 0, 0.1], rightShoulder: [-0.8, 0, -0.1], leftElbow: [-1.4, 0, 0], rightElbow: [-1.4, 0, 0] }),
  runB: pose(0.04, { spine: [0.25, 0, 0], rightHip: [-0.9, 0, 0], rightKnee: [0.9, 0, 0], leftHip: [0.5, 0, 0], leftKnee: [1.2, 0, 0], rightShoulder: [0.7, 0, -0.1], leftShoulder: [-0.8, 0, 0.1], leftElbow: [-1.4, 0, 0], rightElbow: [-1.4, 0, 0] }),
  crouch: pose(-0.28, { spine: [0.35, 0, 0], leftHip: [-0.8, 0, 0], rightHip: [-0.8, 0, 0], leftKnee: [1.3, 0, 0], rightKnee: [1.3, 0, 0], leftShoulder: [-0.5, 0, 0.2], rightShoulder: [-0.5, 0, -0.2], leftElbow: [-0.8, 0, 0], rightElbow: [-0.8, 0, 0] }),
  kickRight: pose(0, { spine: [-0.15, 0, 0], rightHip: [-1.35, 0, 0], rightKnee: [0.1, 0, 0], leftKnee: [0.12, 0, 0], leftShoulder: [0, 0, 1.2], rightShoulder: [0, 0, -1.2], leftElbow: [-0.3, 0, 0], rightElbow: [-0.3, 0, 0] }),
  punchLeft: pose(-0.04, { pelvis: [0, -0.35, 0], leftShoulder: [-1.5, 0, -0.1], leftElbow: [0, 0, 0], rightShoulder: [-0.4, 0, 0.1], rightElbow: [-1.9, 0, 0], leftKnee: [0.25, 0, 0], rightKnee: [0.25, 0, 0] }),
  punchRight: pose(-0.04, { pelvis: [0, 0.35, 0], rightShoulder: [-1.5, 0, 0.1], rightElbow: [0, 0, 0], leftShoulder: [-0.4, 0, -0.1], leftElbow: [-1.9, 0, 0], leftKnee: [0.25, 0, 0], rightKnee: [0.25, 0, 0] }),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;
export const POSE_NAMES = Object.keys(POSES) as PoseName[];
export const isPoseName = (x: unknown): x is PoseName =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(POSES, x);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Scale a pose's offset from rest by an amplitude (0 = rest, 1 = as authored). */
export function scalePose(p: Pose, amplitude: number): Pose {
  const out = neutralPose();
  out.rootY = p.rootY * amplitude;
  for (const j of JOINTS) {
    const [x, y, z] = p.joints[j];
    out.joints[j] = [x * amplitude, y * amplitude, z * amplitude];
  }
  return out;
}

export function mixPoses(a: Pose, b: Pose, t: number): Pose {
  const out = neutralPose();
  out.rootY = lerp(a.rootY, b.rootY, t);
  for (const j of JOINTS) {
    const pa = a.joints[j], pb = b.joints[j];
    out.joints[j] = [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t)];
  }
  return out;
}

/** L1 distance in radians across all joints, plus the root height in decimetres. */
export function poseDistance(a: Pose, b: Pose): number {
  let d = Math.abs(a.rootY - b.rootY) * 10;
  for (const j of JOINTS) {
    const pa = a.joints[j], pb = b.joints[j];
    d += Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
  }
  return d;
}
