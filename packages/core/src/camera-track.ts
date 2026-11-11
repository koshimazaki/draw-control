/**
 * The camera track written into a guide bundle (`camera.json`): one camera per exported
 * frame (position, target, vertical fov), re-based to the clip's frame 0, plus a
 * suggested LTX `settings.cameraMovement` value for models that take a preset rather
 * than a path.
 *
 * LTX values are the ones model-arena lists for LTX on Runware
 * (model-arena providers/runware-api/models.ts, LTX_CAMERA). The suggestion is the
 * nearest single preset to the whole path, so it is always an approximation. model-arena
 * also notes that LTX refuses cameraMovement when inputs.audio is sent.
 */
import { fovForAspect, type CameraPlan, type Vec3 } from "./camera-rig";
import type { CameraSegment } from "./camera";
import type { Recipe } from "./recipe";

export const LTX_CAMERA_MOVEMENTS = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"] as const;
export type LtxCameraMovement = (typeof LTX_CAMERA_MOVEMENTS)[number];
export type LtxSuggestion = {
  settings: { cameraMovement: LtxCameraMovement };
  approximate: true;
  /** Metres of travel behind each candidate (dolly in/out, sideways, jib). */
  scores: { dolly: number; lateral: number; jib: number };
  note: string;
};
export type CameraTrackFrame = { frame: number; position: Vec3; target: Vec3; fov: number; energy: number };
export type CameraTrackJson = {
  schemaVersion: string;
  fps: number; frames: number;
  /** Recipe frame of the clip's frame 0. */
  startFrame: number;
  aspect: number;
  fovAxis: "vertical";
  units: "metres";
  axes: string;
  intensity: number;
  modes: CameraSegment[];
  /** Beat accents inside the clip, seconds from its frame 0. */
  accents: { seconds: number; downbeat: boolean }[];
  track: CameraTrackFrame[];
  ltx: LtxSuggestion;
};

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const v4 = (v: Vec3): Vec3 => [r4(v[0]), r4(v[1]), r4(v[2])];
const STILL_METRES = 0.2;

/** The single LTX preset nearest to the camera's travel over a clip. */
export function suggestLtxCameraMovement(plan: CameraPlan, startFrame: number, frames: number): LtxSuggestion {
  const ch = plan.channels, last = Math.min(plan.frames - 1, startFrame + frames - 1), first = Math.min(startFrame, last);
  let lateral = 0, forward = 0;
  for (let n = first + 1; n <= last; n++) {
    lateral += (ch.yaw[n] - ch.yaw[n - 1]) * (ch.distance[n] + ch.distance[n - 1]) / 2;
    // Centre travel along the camera's forward axis (towards the subject = forward).
    const dx = ch.cx[n] - ch.cx[n - 1], dz = ch.cz[n] - ch.cz[n - 1];
    forward += -(Math.sin(ch.yaw[n]) * dx + Math.cos(ch.yaw[n]) * dz);
  }
  const dolly = (ch.distance[first] - ch.distance[last]) + forward;   // > 0: moving in
  const jib = ch.height[last] - ch.height[first];
  const scores = { dolly: r4(dolly), lateral: r4(lateral), jib: r4(jib) };
  const best = Math.max(Math.abs(dolly), Math.abs(lateral), Math.abs(jib));
  let cameraMovement: LtxCameraMovement = "static";
  if (best >= STILL_METRES) {
    if (best === Math.abs(dolly)) cameraMovement = dolly > 0 ? "dolly_in" : "dolly_out";
    else if (best === Math.abs(lateral)) cameraMovement = lateral > 0 ? "dolly_right" : "dolly_left";
    else cameraMovement = jib > 0 ? "jib_up" : "jib_down";
  }
  return {
    settings: { cameraMovement }, approximate: true, scores,
    note: "Nearest single LTX preset to the whole camera path: an approximation (an orbit maps to dolly_left or dolly_right; focus_shift is never chosen, the rig has no focus). LTX refuses cameraMovement when inputs.audio is sent.",
  };
}

export function buildCameraTrack(plan: CameraPlan, recipe: Recipe, startFrame: number, frames: number, aspect: number, schemaVersion: string): CameraTrackJson {
  const track: CameraTrackFrame[] = [];
  for (let n = 0; n < frames; n++) {
    const s = plan.samples[Math.min(plan.frames - 1, startFrame + n)];
    track.push({ frame: n, position: v4(s.position), target: v4(s.target), fov: r4(fovForAspect(s.fov, aspect)), energy: r4(s.energy) });
  }
  const from = startFrame / recipe.fps, to = (startFrame + frames) / recipe.fps;
  return {
    schemaVersion, fps: recipe.fps, frames, startFrame, aspect: r4(aspect), fovAxis: "vertical", units: "metres",
    axes: "Y up, right-handed; the character faces +Z at yaw 0; position and target in world metres",
    intensity: plan.config.intensity, // The bundle schema carries a range's beats and modes; shots, amounts and locks are already in the per-frame track.
    modes: plan.config.segments.map(s => ({ fromBeat: s.fromBeat, toBeat: s.toBeat, modes: [...s.modes] })),
    accents: plan.accents.filter(a => a.seconds >= from && a.seconds < to).map(a => ({ seconds: r4(a.seconds - from), downbeat: a.downbeat })),
    track, ltx: suggestLtxCameraMovement(plan, startFrame, frames),
  };
}
