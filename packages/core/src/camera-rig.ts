/**
 * Audio-reactive camera rig: `planCamera` turns the recipe's camera timeline, the beat
 * grid and the audio drive into one camera sample per frame. The plan is built once and
 * then read per frame (`cameraAtFrame`), so any frame can be seeked and exported alone.
 *
 * Off-beats get a small push only and downbeats a push plus a yaw nudge, so the path stays calm.
 * Every channel is smooth by construction:
 * - rates (orbit yaw, dolly, crane) pass through a slew limiter, so their acceleration
 *   never exceeds the channel's clamp and nothing overshoots;
 * - following channels (subject centre, lead/chase heading) use a critically damped
 *   follower with velocity feed-forward (no lag at constant speed), acceleration clamped;
 * - beat accents are raised-cosine pulses that peak exactly on the beat, with their
 *   amplitude reduced analytically until their peak acceleration fits the clamp.
 * There are no cuts and no noise.
 */
import { energyAtFrame, type AudioDrive } from "./audio-drive";
import { beatAtSeconds, secondsAtBeat } from "./beats";
import { CAMERA_MAX_HEIGHT, FOLLOW_ANGLES, modesAt, type CameraConfig, type CameraMode } from "./camera";
import type { Recipe } from "./recipe";
import { buildSpline } from "./spline";
import { subjectAt } from "./subject";
import { rootAt } from "./root-travel";
import { cornerPath, polylineSpline } from "./corners";
import { guardFraming } from "./camera-guard";
import { unmutedBands } from "./lock";

/** Over the shoulder: turned this far (radians) from straight behind, this share closer, this much higher (metres). */
export const SHOULDER = { angle: 0.38, closer: 0.45, higher: 0.35 } as const;
/** The subject's centre above its root, metres (the framing guard keeps this point in frame). */
export const SUBJECT_CENTRE = 0.6;
import { programCamera, type ProgrammedCamera } from "./camera-shots";
import { inLane, laneAt } from "./automation";

export type Vec3 = [number, number, number];
export type CameraSample = { position: Vec3; target: Vec3; /** vertical, degrees, at 16:9 */ fov: number; energy: number };
export type CameraAccent = { beat: number; seconds: number; downbeat: boolean; /** 0–1 after energy scaling */ amount: number };
export type CameraChannels = { yaw: Float64Array; distance: Float64Array; height: Float64Array; aimY: Float64Array; cx: Float64Array; cz: Float64Array };
export type CameraPlan = {
  fps: number; frames: number; config: CameraConfig;
  samples: CameraSample[]; accents: CameraAccent[]; channels: CameraChannels;
  /** Shots, programmed moves and beat locks per frame (camera-shots.ts). */
  programmed: ProgrammedCamera;
  /** Frames whose camera was held at CAMERA_MAX_HEIGHT (it asked to go higher). */
  heightClamped: number;
};

/** Acceleration clamps per channel (SI units). Exported so tests check against them. */
export const CAMERA_LIMITS = {
  yawAccel: 1.6,          // rad/s², orbit and follow yaw
  linearAccel: 1.2,       // m/s², dolly and crane rates
  centreAccel: 8,         // m/s², centre follow
  accentPushAccel: 18,    // m/s², per accent pulse
  accentYawAccel: 3.5,    // rad/s², per accent pulse
} as const;
/** Accent pulse shape, in beats: a rise into the beat, a release after it (sums to 1, so pulses never overlap). */
export const ACCENT_RISE_BEATS = 0.45;
export const ACCENT_RELEASE_BEATS = 0.55;
const PUSH_FRACTION = 0.3;    // a push-in range covers this share of the start distance
const RISE_METRES = 1.6;
const AIM_DROP = 0.35;
const DOWNBEAT_PUSH = 0.1,  BEAT_PUSH_SHARE = 0.12, DOWNBEAT_YAW = 0.6 * Math.PI / 180;
const AIM_Y = 1.0;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const slew = (current: number, desired: number, maxStep: number) => current + clamp(desired - current, -maxStep, maxStep);

/** Raised-cosine pulse: 0 before `-rise`, 1 at 0, 0 after `release` (u, rise, release in one unit). */
export function accentPulse(u: number, rise: number, release: number): number {
  if (u <= -rise || u >= release) return 0;
  return u <= 0 ? 0.5 + 0.5 * Math.cos(Math.PI * u / rise) : 0.5 + 0.5 * Math.cos(Math.PI * u / release);
}
/** Largest pulse amplitude whose peak acceleration (A·π²/2w²) stays under `maxAccel`. */
export const clampPulseAmplitude = (amplitude: number, widthSeconds: number, maxAccel: number) =>
  Math.min(amplitude, maxAccel * 2 * widthSeconds * widthSeconds / (Math.PI * Math.PI));

/** Energy-to-speed factor: 1 at intensity 0; 0.3–1.7 across the energy range at intensity 1. */
export const speedFactor = (intensity: number, energy: number) => 1 + intensity * (1.4 * energy - 0.7);

function followStep(x: number, v: number, target: number, targetV: number, omega: number, maxAccel: number, dt: number) {
  const a = clamp(omega * omega * (target - x) + 2 * omega * (targetV - v), -maxAccel, maxAccel);
  const nv = v + a * dt;
  return [x + nv * dt, nv] as const;
}

export function planCamera(recipe: Recipe, drive?: AudioDrive, frames = 0): CameraPlan {
  const config = recipe.camera;
  if (!config) throw new Error("planCamera: the recipe has no camera rig");
  const fps = recipe.fps, dt = 1 / fps, g = recipe.beatGrid;
  const beatSeconds = 60 / g.bpm;
  const total = Math.max(frames, Math.ceil((g.offsetSeconds + recipe.durationBeats * beatSeconds) * fps) + 64);
  const ch: CameraChannels = {
    yaw: new Float64Array(total), distance: new Float64Array(total), height: new Float64Array(total),
    aimY: new Float64Array(total), cx: new Float64Array(total), cz: new Float64Array(total),
  };
  const subject = (n: number) => subjectAt(recipe, beatAtSeconds(g, n * dt), drive);
  const prog = programCamera(config, g, unmutedBands(drive?.bands, recipe.mutedHits), total, fps);
  const d0 = config.distance, dMin = d0 * 0.55, dMax = d0 * 1.7;
  const hMin = 0.3, hMax = config.height + RISE_METRES + 1;
  // State: base yaw (follow), orbit yaw, dolly, crane, aim, centre.
  const s0 = subject(0);
  let followYaw = 0, followV = 0, orbit = 0, orbitRate = 0;
  let dolly = 0, dollyRate = 0, crane = 0, craneRate = 0, aim = 0, aimRate = 0;
  let cx = s0.x, cz = s0.z, cvx = 0, cvz = 0;
  const startModes = modesAt(config, beatAtSeconds(g, 0));
  const followOffset = (m: readonly CameraMode[]) => { for (const k of m) if (FOLLOW_ANGLES[k] !== undefined) return FOLLOW_ANGLES[k]!; return null; };
  const segAt = (beat: number) => config.segments.find(s => beat >= s.fromBeat && beat < s.toBeat);
  // Over the shoulder: the chase angle turned a little to one side, closer and a little higher (eased in and out).
  let shoulderW = segAt(0)?.shoulder ? 1 : 0;
  const yaw0 = config.startYaw * Math.PI / 180;
  const off0 = followOffset(startModes);
  if (off0 !== null) followYaw = s0.heading + off0 - SHOULDER.angle * shoulderW - yaw0;
  const rangeSeconds = (beat: number) => {
    const seg = config.segments.find(s => beat >= s.fromBeat && beat < s.toBeat);
    return seg ? (seg.toBeat - seg.fromBeat) * beatSeconds : Infinity;
  };
  const room = (x: number, dir: number, lo: number, hi: number, soft: number) => clamp((dir < 0 ? x - lo : hi - x) / soft, 0, 1);

  for (let n = 0; n < total; n++) {
    const beat = beatAtSeconds(g, n * dt);
    const modes = modesAt(config, beat);
    const e = energyAtFrame(drive, n);
    const segNow = segAt(beat), pace = segNow?.pace === "fast" ? 1.8 : segNow?.pace === "slow" ? 0.55 : 1;
    const k = speedFactor(config.intensity, e) * pace;
    shoulderW = slew(shoulderW, segNow?.shoulder ? 1 : 0, 1.5 * dt * pace);
    const span = rangeSeconds(beat);
    if (n > 0) {
      // Orbit: yaw rate from the base speed and the energy, slew-limited.
      const free = 1 - prog.gate[n];   // a locked hold stops the energy-driven rates
      const orbitWant = modes.includes("orbit") && !prog.owns.orbit[n] ? free * config.orbitDegreesPerBeat * Math.PI / 180 / beatSeconds * k : 0;
      orbitRate = slew(orbitRate, orbitWant, CAMERA_LIMITS.yawAccel * dt);
      orbit += orbitRate * dt;
      // Dolly and crane: cover their distance over the range, faster when loud, easing off near the limits.
      const dir = modes.includes("pushIn") ? -1 : modes.includes("pullOut") ? 1 : 0;
      const dollyWant = dir === 0 || prog.owns.dolly[n] ? 0 : free * dir * PUSH_FRACTION * d0 / span * k * room(d0 + dolly, dir, dMin, dMax, 0.8);
      dollyRate = slew(dollyRate, dollyWant, CAMERA_LIMITS.linearAccel * dt);
      dolly += dollyRate * dt;
      const rising = modes.includes("rise") && !prog.owns.crane[n];
      const craneWant = rising ? free * RISE_METRES / span * k * room(config.height + crane, 1, hMin, hMax, 0.6) : 0;
      craneRate = slew(craneRate, craneWant, CAMERA_LIMITS.linearAccel * dt);
      crane += craneRate * dt;
      const aimWant = rising ? -AIM_DROP / span * k * room(AIM_Y + aim, -1, AIM_Y - AIM_DROP - 0.2, AIM_Y, 0.15) : 0;
      aimRate = slew(aimRate, aimWant, CAMERA_LIMITS.linearAccel * dt);
      aim += aimRate * dt;
      // Centre follows the subject with feed-forward, so a travelling subject stays framed.
      const s = subject(n), sp = subject(n - 1);
      [cx, cvx] = followStep(cx, cvx, s.x, (s.x - sp.x) / dt, 6, CAMERA_LIMITS.centreAccel, dt);
      [cz, cvz] = followStep(cz, cvz, s.z, (s.z - sp.z) / dt, 6, CAMERA_LIMITS.centreAccel, dt);
      // Lead / chase: swing the base yaw so the camera sits in front of or behind the heading.
      const rig = followOffset(modes), off = rig === null ? null : rig - SHOULDER.angle * shoulderW;
      if (off !== null) {
        let want = s.heading + off - yaw0 - orbit;
        want += 2 * Math.PI * Math.round((followYaw - want) / (2 * Math.PI));
        const headingV = (s.heading - sp.heading) / dt;
        [followYaw, followV] = followStep(followYaw, followV, want, headingV - orbitRate, 2.2 * Math.sqrt(pace), CAMERA_LIMITS.yawAccel * pace, dt);
      } else {
        followV = slew(followV, 0, CAMERA_LIMITS.yawAccel * dt);
        followYaw += followV * dt;
      }
    }
    ch.yaw[n] = yaw0 + followYaw + orbit + prog.orbit[n];
    ch.distance[n] = (prog.distance[n] + dolly) * (1 - SHOULDER.closer * shoulderW) - prog.punch[n];
    ch.height[n] = prog.height[n] + crane + SHOULDER.higher * shoulderW;
    ch.aimY[n] = prog.aim[n] + aim;
    ch.cx[n] = cx; ch.cz[n] = cz;
  }

  // Follow height: the camera rises and aims with the subject's height (a figure in flight stays framed).
  if (config.followHeight) for (let n = 0; n < total; n++) {
    const y = rootAt(recipe, beatAtSeconds(g, n * dt), drive).y;
    ch.height[n] += y; ch.aimY[n] += y;
  }

  // Beat accents: a push and a yaw nudge on every beat, larger on downbeats, scaled by energy.
  const accents: CameraAccent[] = [];
  const push = new Float64Array(total);
  const rise = ACCENT_RISE_BEATS * beatSeconds, release = ACCENT_RELEASE_BEATS * beatSeconds;
  const pushMax = Math.min(clampPulseAmplitude(DOWNBEAT_PUSH, rise, CAMERA_LIMITS.accentPushAccel), clampPulseAmplitude(DOWNBEAT_PUSH, release, CAMERA_LIMITS.accentPushAccel));
  const yawMax = Math.min(clampPulseAmplitude(DOWNBEAT_YAW, rise, CAMERA_LIMITS.accentYawAccel), clampPulseAmplitude(DOWNBEAT_YAW, release, CAMERA_LIMITS.accentYawAccel));
  if (config.intensity > 0) {
    for (let b = 0; b <= recipe.durationBeats; b++) {
      const seconds = secondsAtBeat(g, b);
      const downbeat = b % g.beatsPerBar === 0;
      const amount = config.intensity * (downbeat ? 1 : BEAT_PUSH_SHARE) * (0.5 + 0.5 * energyAtFrame(drive, seconds * fps));
      accents.push({ beat: b, seconds, downbeat, amount });
      const bar = Math.floor(b / g.beatsPerBar);
      const nudgeSign = (Math.sign(config.orbitDegreesPerBeat) || 1) * (bar % 2 === 0 ? 1 : -1);
      const from = Math.max(0, Math.floor((seconds - rise) * fps)), to = Math.min(total - 1, Math.ceil((seconds + release) * fps));
      for (let n = from; n <= to; n++) {
        const p = accentPulse(n * dt - seconds, rise, release) * amount;
        if (!prog.owns.dolly[n]) { ch.distance[n] -= pushMax * p; push[n] += pushMax * p; }
        if (downbeat && !prog.owns.orbit[n]) ch.yaw[n] += yawMax * p * nudgeSign;   // yaw nudges on downbeats only: a calmer path
      }
    }
  }

  // Automation lanes win over everything above for their parameter, where they have points; yaw adds an offset.
  const lanes = config.lanes;
  if (lanes) for (let n = 0; n < total; n++) {
    if (inLane(lanes.distance, n)) ch.distance[n] = laneAt(lanes.distance, n);
    if (inLane(lanes.height, n)) ch.height[n] = laneAt(lanes.height, n);
    if (lanes.yaw) ch.yaw[n] += laneAt(lanes.yaw, n, 0) * Math.PI / 180;
  }
  const fovAt = (n: number) => (inLane(lanes?.fov, n) ? laneAt(lanes!.fov, n) : prog.fov[n]);

  // Drawn path: the camera travels the spline over the path ranges, faster when loud,
  // cross-fading from and to the other modes; accents push along the view.
  const usesPath = !!config.path && config.segments.some(s => s.modes.includes("path"));
  const pathS = new Float64Array(total), pathW = new Float64Array(total);
  if (usesPath) {
    let cum = 0, rate = 0, w = modesAt(config, beatAtSeconds(g, 0)).includes("path") ? 1 : 0;
    const cums = new Float64Array(total);
    for (let n = 0; n < total; n++) {
      const on = modesAt(config, beatAtSeconds(g, n * dt)).includes("path");
      rate = slew(rate, on ? speedFactor(config.intensity, energyAtFrame(drive, n)) : 0, 2 * dt);
      cum += rate * (1 - prog.gate[n]) * dt;   // a locked hold on a path block stops it on each hit
      cums[n] = cum;
      w = slew(w, on ? 1 : 0, 1.2 * dt);
      pathW[n] = w;
    }
    // The path is covered by the end of the last path range.
    const lastBeat = Math.max(...config.segments.filter(s => s.modes.includes("path")).map(s => s.toBeat));
    const end = cums[Math.min(total - 1, Math.round(secondsAtBeat(g, lastBeat) * fps))] || cum;
    for (let n = 0; n < total; n++) pathS[n] = end > 0 ? Math.min(1, cums[n] / end) : 0;
  }
  const spline = !usesPath ? null : config.corners !== undefined ? polylineSpline(cornerPath(config.path!, config.corners).map(p => ({ x: p.x, y: p.y ?? 0, z: p.z }))) : buildSpline(config.path!);
  const samples: CameraSample[] = new Array(total);
  // Top and fixed fade in and out over about half a second, so switching never cuts.
  let topW = 0, fixW = 0, anchor: Vec3 | null = null, heightClamped = 0;
  for (let n = 0; n < total; n++) {
    const modes = modesAt(config, beatAtSeconds(g, n * dt));
    const segPace = segAt(beatAtSeconds(g, n * dt))?.pace;
    topW = slew(topW, modes.includes("top") ? 1 : 0, (segPace === "fast" ? 4 : segPace === "slow" ? 0.8 : 2) * dt);
    const yaw = ch.yaw[n];
    const ease = (w: number) => 0.5 - 0.5 * Math.cos(Math.PI * w);
    const tw = ease(topW), d = ch.distance[n] * (1 - 0.92 * tw);
    const target: Vec3 = [ch.cx[n], ch.aimY[n] - 0.15 * tw, ch.cz[n]];
    let position: Vec3 = [ch.cx[n] + Math.sin(yaw) * d, ch.height[n] + tw * (ch.distance[n] * 1.35 + 0.6), ch.cz[n] + Math.cos(yaw) * d];
    if (prog.truck[n]) {
      // Truck: camera and aim slide sideways together (right of the view is (cos yaw, -sin yaw)).
      const tx = Math.cos(yaw) * prog.truck[n], tz = -Math.sin(yaw) * prog.truck[n];
      position = [position[0] + tx, position[1], position[2] + tz];
      target[0] += tx; target[2] += tz;
    }
    const wasFixed = fixW > 0;
    fixW = slew(fixW, modes.includes("fixed") ? 1 : 0, 2 * dt);
    if (fixW > 0 && !wasFixed) anchor = position;
    if (anchor && fixW > 0) {
      const w = ease(fixW);
      position = [position[0] + (anchor[0] - position[0]) * w, position[1] + (anchor[1] - position[1]) * w, position[2] + (anchor[2] - position[2]) * w];
    }
    if (tw > 0 || fixW > 0) {
      ch.yaw[n] = Math.atan2(position[0] - target[0], position[2] - target[2]);
      ch.distance[n] = Math.hypot(position[0] - target[0], position[2] - target[2]);
      ch.height[n] = position[1];
    }
    if (spline && pathW[n] > 0) {
      const p = spline.at(pathS[n]);
      const dir = [target[0] - p[0], target[1] - p[1], target[2] - p[2]], len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const along = push[n] + prog.punch[n];   // accents, and a locked punch-in, push along the view
      const q: Vec3 = [p[0] + dir[0] / len * along, p[1] + dir[1] / len * along, p[2] + dir[2] / len * along];
      const w = 0.5 - 0.5 * Math.cos(Math.PI * pathW[n]);
      position = [position[0] + (q[0] - position[0]) * w, position[1] + (q[1] - position[1]) * w, position[2] + (q[2] - position[2]) * w];
      // Keep the channels describing the camera actually used (LTX suggestion, tests).
      ch.yaw[n] = Math.atan2(position[0] - target[0], position[2] - target[2]);
      ch.distance[n] = Math.hypot(position[0] - target[0], position[2] - target[2]);
      ch.height[n] = position[1];
    }
    if (position[1] > CAMERA_MAX_HEIGHT + 1e-9) { heightClamped++; position = [position[0], CAMERA_MAX_HEIGHT, position[2]]; ch.height[n] = CAMERA_MAX_HEIGHT; }
    samples[n] = { position, target, fov: fovAt(n), energy: energyAtFrame(drive, n) };
  }
  // Beat Path: the camera never loses the subject (camera-guard.ts).
  if (config.keepInFrame) {
    const subject: Vec3[] = [];
    for (let n = 0; n < total; n++) { const r = rootAt(recipe, beatAtSeconds(g, n * dt), drive); subject.push([r.x, r.y + SUBJECT_CENTRE, r.z]); }
    guardFraming(samples, subject);
  }
  for (let n = 1; n < total; n++) {
    // Unwrap yaw recomputed by atan2 so it stays continuous.
    while (ch.yaw[n] - ch.yaw[n - 1] > Math.PI) ch.yaw[n] -= 2 * Math.PI;
    while (ch.yaw[n] - ch.yaw[n - 1] < -Math.PI) ch.yaw[n] += 2 * Math.PI;
  }
  return { fps, frames: total, config, samples, accents, channels: ch, programmed: prog, heightClamped };
}

/** The camera at a frame (clamped to the plan). */
export function cameraAtFrame(plan: CameraPlan, frame: number): CameraSample {
  return plan.samples[clamp(Math.round(frame), 0, plan.frames - 1)];
}

/** The camera at a time, interpolated between frames for a smooth preview. */
export function cameraAtSeconds(plan: CameraPlan, seconds: number): CameraSample {
  const x = clamp(seconds * plan.fps, 0, plan.frames - 1), i = Math.floor(x), f = x - i;
  const a = plan.samples[i], b = plan.samples[Math.min(plan.frames - 1, i + 1)];
  const mix = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target), fov: a.fov + (b.fov - a.fov) * f, energy: a.energy + (b.energy - a.energy) * f };
}

/** Vertical fov that keeps the 16:9 horizontal coverage at narrower aspects (portrait). */
export function fovForAspect(fov16x9: number, aspect: number): number {
  if (aspect >= 16 / 9) return fov16x9;
  const halfW = Math.tan(fov16x9 * Math.PI / 360) * 16 / 9;
  return Math.min(100, 2 * Math.atan(halfW / aspect) * 180 / Math.PI);
}
