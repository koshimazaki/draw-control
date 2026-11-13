/**
 * @motion-studio/core, the public entry: everything another app needs to read, edit and
 * play a Motion Studio recipe without a browser. Pure TypeScript, no DOM, no Three.js, no
 * dependencies; every frame is a pure function of (recipe, audio drive, frame).
 *
 *   import { validateRecipe, frameAt, applyScript, planCamera } from "@motion-studio/core";
 *
 * The studio uses `@motion-studio/core/internal` (every module); names only there may change.
 */

// Recipe: the format, its validator and starting points (docs/recipe.md).
export {
  RECIPE_VERSION, CHARACTER_KINDS, PROCEDURAL_KINDS, AMPLITUDE_MAX, SPEED_RANGE, RecipeError, validateRecipe, recipeSeconds, secondsPerBeat,
  FIGURE_SHAPES, type FigureShape, type SceneryBox, type Recipe, type RootShape, type ShotDescription, type Move, type Phase, type BeatGrid, type CharacterRef, type CharacterKind, type RootPoint, type Jump,
} from "./recipe";
export { DEFAULT_RECIPE, MOVE_KEYS, MOVE_LIBRARY, makeMove, type MoveKey } from "./moves";
export { defaultRiggedRecipe } from "./examples";
export { beatPathBase, clipBeats, BEAT_PATH_RIG, GLIDER_CHARACTER } from "./beat-path";
export { LOOP_CLIPS, RIGGED_CHARACTER } from "./clip-library";
export { ACCENT_KEYS, isAccentKey, type AccentKey } from "./accents";

// Frames: the figure's state on any frame (pose angles, clip layers, root, accents).
export { frameAt, poseSpeed } from "./perform";
export type { FrameState, ClipLayer, ActivePhase } from "./engine";
export { POSES, JOINTS, mixPoses, scalePose, type Pose, type PoseName, type JointName, type Euler3 } from "./poses";
export { rootAt, travelRange, travelStations } from "./root-travel";
export { cornerPath, polylineSpline } from "./corners";
export { frozenBeat, type Freeze } from "./freeze";
export { placeLandmarks, sceneryOf, footprintDistance, scenePaths, LANDMARKS, DEFAULT_LANDMARKS, SCENERY, BUILDINGS, PASSES, Occlusion, hiddenSamples, type Landmark, type LandmarkKind, type Scenery } from "./landmarks";
export { exportFrameCount } from "./bundle";

// Beats, audio analysis and onsets (kicks, snares, hats, peaks).
export { beatAtSeconds, secondsAtBeat, analyseSamples, type AudioFeatures } from "./beats";
export { buildDrive, flatDrive, energyAtFrame, energyAtSeconds, type AudioDrive } from "./audio-drive";
export { bandOnsets, type BandAnalysis, type BandOnset } from "./audio-bands";
export { onsetBeats, snapBeat, type SnapTarget } from "./move-edits";

// Edits: one command entry point shared with the studio, the CLI and the MCP server.
export { applyMotionCommand, applyCommands, commandHelp, type MotionCommand, type CommandContext } from "./commands";

// The shot script and the timeline as text.
export { printScript, cameraWords } from "./shot-script";
export { applyScript, parseRows, parseSettings } from "./script-apply";
export { ACTION_WORDS, CAMERA_WORDS } from "./shot-script";
export { describeRecipe } from "./describe";

// Camera rig: shots, programmed moves, beat locks, automation lanes, the per-frame plan.
export {
  CAMERA_MODES, CAMERA_MAX_HEIGHT, FOLLOW_LIMITS, FOLLOW_MODES, DEFAULT_CAMERA, SHOTS, SHOT_PRESETS,
  type CameraConfig, type CameraSegment, type CameraMode, type FollowOffset, type Shot,
} from "./camera";
export { planCamera, cameraAtFrame, cameraAtSeconds, fovForAspect, type CameraPlan, type CameraSample, type Vec3 } from "./camera-rig";
export { CAMERA_LANES, LANE_SPECS, laneAt, type CameraLane, type Envelope, type EnvelopePoint } from "./automation";
export { LOCK_TARGETS, type LockTarget } from "./lock";

// Guide bundle (the export model-arena reads; schema/guide-bundle.schema.json).
export { GROOVES, grooveTimes, synthDrums, type GrooveStyle, type DrumPattern } from "./drum-synth";
export { BUNDLE_SCHEMA_VERSION, buildBeats, buildManifest, buildMeta, encodeWav } from "./bundle";
export { buildCameraTrack, type CameraTrackJson } from "./camera-track";
