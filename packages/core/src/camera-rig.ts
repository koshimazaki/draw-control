/**
 * Audio-reactive camera rig: `planCamera` turns the recipe's camera timeline, the beat
 * grid and the audio drive into one camera sample per frame. The plan is built once and
 * then read per frame (`cameraAtFrame`), so any frame can be seeked and exported alone.
 *
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
import { modesAt, type CameraConfig } from "./camera";
import type { Recipe } from "./recipe";
import { subjectAt } from "./subject";

export type Vec3 = [number, number, number];
export type CameraSample = { position: Vec3; target: Vec3; /** vertical, degrees, at 16:9 */ fov: number; energy: number };
export type CameraAccent = { beat: number; seconds: number; downbeat: boolean; /** 0–1 after energy scaling */ amount: number };
export type CameraChannels = { yaw: Float64Array; distance: Float64Array; height: Float64Array; aimY: Float64Array; cx: Float64Array; cz: Float64Array };
export type CameraPlan = {
  fps: number; frames: number; config: CameraConfig;
  samples: CameraSample[]; accents: CameraAccent[]; channels: CameraChannels;
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
const DOWNBEAT_PUSH = 0.32, BEAT_PUSH_SHARE = 0.25, DOWNBEAT_YAW = 3.2 * Math.PI / 180;
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
  const subject = (n: number) => subjectAt(recipe, beatAtSeconds(g, n * dt));
  const d0 = config.distance, dMin = d0 * 0.55, dMax = d0 * 1.7;
  const hMin = 0.3, hMax = config.height + RISE_METRES + 1;
  // State: base yaw (follow), orbit yaw, dolly, crane, aim, centre.
  const s0 = subject(0);
  let followYaw = 0, followV = 0, orbit = 0, orbitRate = 0;
  let dolly = 0, dollyRate = 0, crane = 0, craneRate = 0, aim = 0, aimRate = 0;
  let cx = s0.x, cz = s0.z, cvx = 0, cvz = 0;
  const startModes = modesAt(config, beatAtSeconds(g, 0));
  const followOffset = (m: readonly string[]) => m.includes("lead") ? 0 : m.includes("chase") ? Math.PI : null;
  const yaw0 = config.startYaw * Math.PI / 180;
  const off0 = followOffset(startModes);
  if (off0 !== null) followYaw = s0.heading + off0 - yaw0;
  const rangeSeconds = (beat: number) => {
    const seg = config.segments.find(s => beat >= s.fromBeat && beat < s.toBeat);
    return seg ? (seg.toBeat - seg.fromBeat) * beatSeconds : Infinity;
  };
  const room = (x: number, dir: number, lo: number, hi: number, soft: number) => clamp((dir < 0 ? x - lo : hi - x) / soft, 0, 1);

  for (let n = 0; n < total; n++) {
    const beat = beatAtSeconds(g, n * dt);
    const modes = modesAt(config, beat);
    const e = energyAtFrame(drive, n);
    const k = speedFactor(config.intensity, e);
    const span = rangeSeconds(beat);
    if (n > 0) {
      // Orbit: yaw rate from the base speed and the energy, slew-limited.
      const orbitWant = modes.includes("orbit") ? config.orbitDegreesPerBeat * Math.PI / 180 / beatSeconds * k : 0;
      orbitRate = slew(orbitRate, orbitWant, CAMERA_LIMITS.yawAccel * dt);
      orbit += orbitRate * dt;
      // Dolly and crane: cover their distance over the range, faster when loud, easing off near the limits.
      const dir = modes.includes("pushIn") ? -1 : modes.includes("pullOut") ? 1 : 0;
      const dollyWant = dir === 0 ? 0 : dir * PUSH_FRACTION * d0 / span * k * room(d0 + dolly, dir, dMin, dMax, 0.8);
      dollyRate = slew(dollyRate, dollyWant, CAMERA_LIMITS.linearAccel * dt);
      dolly += dollyRate * dt;
      const rising = modes.includes("rise");
      const craneWant = rising ? RISE_METRES / span * k * room(config.height + crane, 1, hMin, hMax, 0.6) : 0;
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
      const off = followOffset(modes);
      if (off !== null) {
        let want = s.heading + off - yaw0 - orbit;
        want += 2 * Math.PI * Math.round((followYaw - want) / (2 * Math.PI));
        const headingV = (s.heading - sp.heading) / dt;
        [followYaw, followV] = followStep(followYaw, followV, want, headingV - orbitRate, 2.2, CAMERA_LIMITS.yawAccel, dt);
      } else {
        followV = slew(followV, 0, CAMERA_LIMITS.yawAccel * dt);
        followYaw += followV * dt;
      }
    }
    ch.yaw[n] = yaw0 + followYaw + orbit;
    ch.distance[n] = d0 + dolly;
    ch.height[n] = config.height + crane;
    ch.aimY[n] = AIM_Y + aim;
    ch.cx[n] = cx; ch.cz[n] = cz;
  }

  // Beat accents: a push and a yaw nudge on every beat, larger on downbeats, scaled by energy.
  const accents: CameraAccent[] = [];
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
        ch.distance[n] -= pushMax * p;
        ch.yaw[n] += yawMax * p * nudgeSign;
      }
    }
  }

  const samples: CameraSample[] = new Array(total);
  for (let n = 0; n < total; n++) {
    const yaw = ch.yaw[n], d = ch.distance[n];
    samples[n] = {
      position: [ch.cx[n] + Math.sin(yaw) * d, ch.height[n], ch.cz[n] + Math.cos(yaw) * d],
      target: [ch.cx[n], ch.aimY[n], ch.cz[n]],
      fov: config.fov,
      energy: energyAtFrame(drive, n),
    };
  }
  return { fps, frames: total, config, samples, accents, channels: ch };
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
