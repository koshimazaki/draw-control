---
tags: [prd, motion-studio]
summary: Product requirements for Motion Studio, a browser motion studio that turns an agent-edited, beat-driven mannequin performance into a guide clip for video models.
---

# Motion Studio: product requirements

Status: first working slice built, 10 November 2026; the owner's six asks (audio lane, clip editing, envelope, camera and paths, CLI and MCP, abstract figures) built 11 November (written 7 November). Owner: Koshi. What is built and how it was verified: [plan, State](plan.md#state-10-november-2026).

## One line

A neutral mannequin dances to your track, an agent edits the moves phase by phase, and the result exports as a guide clip that any video model can follow.

## Problem

Video models follow motion badly when it is described in words. A reference video helps a lot, but making a precise reference is the hard part:
- it has to land on the beats;
- it must carry no style of its own;
- someone has to be able to adjust it move by move.

Existing tools each solve part of this:

| Tool | What it does | What it leaves open |
| --- | --- | --- |
| ComfyUI-PoseTracks (MIT) | Fires hand-made poses on detected beats, adds physics, renders a cylinder stick skeleton for LTX IC-LoRA | Tuning is global knobs only: no per-move edits, no agent, no mannequin mesh |
| Yedp Action Director (MIT) | Three.js viewport in ComfyUI, Mixamo-rigged characters, sequenced mocap, seven render passes, a manual mocap editor | No audio or beat logic, no agent |
| Scenario Blender plugin (GPL-3.0) | Render and film tasks in Blender, a humanoid retargeter | Tied to Blender and Scenario's cloud |
| Tariq's Kesar tool ([post](https://x.com/trq212/status/2105849295580889208)) | A phase timeline for game-character animation: named phases typed hold, fast or move, pose-speed curve, before and after, several cameras | Built for one styled game character; no audio-driven guide output |

Nobody offers a per-beat recipe that an agent edits move by move and renders as a model-ready guide. That is this product.

## Users

- **Creative technologists** making music videos, dance pieces and user-generated content with video models.
- **Game developers** prototyping character moves, using the isometric view and sprite frame rates.
- **Agents** (Claude Code, Codex and others) driving it through the CLI or MCP.

## Principles

- **Neutral asset first.** The mannequin carries no style, so the video model takes style only from the image and the prompt.
- **Deterministic.** The same recipe gives the same frames.
- **Agent-first recipe.** Every edit a person can make on the timeline is also a recipe command.
- **Progressive disclosure.** L0 needs nothing; depth is there for developers who want it (see the README levels).
- **Provider-agnostic.** Motion generation and any cloud call sit behind adapters in `providers/`.
- **Licence-clean.** No Mixamo files, SMPL, AIST++ or other restricted data in the repo. Every exported guide records the licence of each asset it used.

## State, 11 November 2026

| Feature | State |
| --- | --- |
| F1 Characters | Built. Rigged mannequin (default), procedural mannequin, block, stick and capsule figures, loaded GLB browser-verified; FBX built, not verified by an automated run |
| F2 Beat grid | Built and browser-verified on a click track; editable by hand |
| F3 Phase recipe | Built; validator and engine unit-tested. `expression` stored and exported, not rendered |
| F4 Agent edit loop | Built: one command entry point for every UI edit, the `motion-studio` CLI (with a headless `render`) and an MCP server; see [agents.md](agents.md) |
| F5 Timeline | Built: phases, move blocks (drag, edges, snap to beats, kicks or snares), amplitude envelope, steps, energy, and an audio lane with the waveform and kick, snare and hat markers |
| F6 Views | Built; all five browser-verified by screenshot |
| F7 Export | Built and browser-verified, including size, range and target warnings |
| F8 Providers | Not built |

Gaps: library moves do not drive a loaded rig (it plays its own clips only); no IK or foot locking (feet slide when a walk path's speed differs from the clip's); the `expression` field is not rendered; drum-band detection is checked on synthetic patterns only. Detail: [plan](plan.md#owners-six-asks-after-trying-the-studio-11-november-branch-featms-core).

## Features, first milestone (final 14 November)

- **F1 Characters:** the procedural mannequin; a primitive block figure; the user's own GLB or FBX with a skeleton (Mixamo naming supported). Local files only.
- **F2 Beat grid:** BPM and beat detection from the user's track, editable, with downbeats.
- **F3 Phase recipe:** a move is a sequence of named phases. Each phase has:
  - a caption;
  - an amplitude ("volume", how big the move is);
  - a length in frames or beats;
  - a preview frame rate.
  The recipe also carries a root path, facing, and scheduled jumps.
- **F4 Agent edit loop:** commands through `applyMotionCommand`:
  - insert a move at beat N;
  - extend or shorten a phase;
  - hold on a marker;
  - swap a move;
  - set amplitude.
  Each command re-renders deterministically. Available from a CLI first, MCP next.
- **F5 Timeline:**
  - phase blocks typed hold, fast or move from pose speed, with beat and downbeat ticks over them;
  - a pose-speed curve;
  - previous, new or both after each edit, with accept or revert;
  - frame step, 1/4 and 1/8 playback, previews at 12, 18, 30 and 60 fps.
- **F6 Views:** Side, Front, Top, Orbit, and an isometric game camera (orthographic, about 35° pitch, 45° yaw).
- **F7 Export:** a guide bundle in the format `model-arena` reads:
  - an H.264 MP4 at 24 fps with a frame count on the 8k+1 grid, 1280×720 by default (also 1920×1080, 720×1280 portrait, or a custom size);
  - any section of the track: a start and a length in beats or seconds;
  - an inline warning, never a blocker, when the size or clip length falls outside the target model's limits;
  - the audio, trimmed to the section;
  - a frame-0 PNG;
  - beats JSON, re-based to the section;
  - recipe JSON;
  - meta with asset licences.
- **F8 Providers:** a `MotionGenerator` interface, with the local time-stretch generator as the default.

## Next (not built)

None of this exists yet. It is the direction after the first milestone.

- **Facial expressions.** Render the per-phase `expression` field (neutral, smile, surprised, angry, sad, focused) on the mannequin's head, kept abstract enough that the figure stays a neutral placeholder.
- **Pose and expression from video.** Extract body pose and facial expression from a reference video into a recipe: phases, poses, amplitudes and expressions on the beat grid, editable like any other recipe.
- **MotionBricks on serverless.** MotionBricks as a `MotionGenerator`: keyframes and a root path go in, continuous motion comes out, run on serverless GPUs with one batch call per move set.

## Later

- **MotionBricks generator.** Keyframes and a root path go in, continuous motion comes out. It runs on serverless GPUs, batching one move set per call.
- **Pose input.** 2D via DWPose or RTMPose; 3D via GEM-X, onto the SOMA body model, then retargeted to the mannequin.
- **Two-stage dancer route.** GEM-X keyframes go into the recipe, and MotionBricks regenerates the motion between them.
- **Game outputs.** Sprite-sheet bake from the isometric view; onion skin, arcs and smears; a VRM creature.
- **Genobi.** Adaptation as a Genobi module.

## Non-goals

- Recording or video editing; that stays in Genobi.
- Calling video models with a comparison UI; that is `model-arena`.
- Shipping motion libraries, datasets or rigged commercial characters.

## Success measures

- L0 runs in under a minute from clone: install, run, pick a move, export.
- A three-command agent edit script produces identical frames on two runs.
- An exported guide bundle validates against the `model-arena` schema and runs in an Arena record.
- **First-frame test.** Run three variants per model:
  - A: the raw frame 0;
  - B: a still restyled from frame 0 with the pose kept;
  - C: no first frame.
  Measure extra-limb artefacts for each.
- Someone outside the project makes their own guide from the README alone.

## Known constraints

- **Target model limits.** The reference video must be 700–4553 px on each side, 24–60 fps and 3–30 s long. These sit in one small table in `packages/core/src/export-target.ts`; `model-arena` holds the full per-model spec database and the table is re-synced with it.
- **Video models.**
  - MiniMax H3 and Seedance 2.5 on Magnific refuse a start frame together with reference videos, so a pose-locked still goes in as an image reference there.
  - Kling 4.0 on Magnific takes no references; its reference-video lane is the Runware API.
  - Each provider's per-model schema is the contract.
- **MotionBricks** is an early preview in NVIDIA's robot project. Unknown: its output skeleton, its weight terms, and whether it accepts SOMA.
- **GEM-X** and MotionBricks need CUDA, so local runs happen on an NVIDIA box and hosted runs on serverless.

## Open questions

1. Answered 11 November: both, the CLI and the MCP server are built.
2. Does the first milestone carry a depth pass?
3. MotionBricks: which skeleton, which input format, which licence? (The spike answers these.)
4. Should the guide-bundle schema gain `meta.range { startFrame, startSeconds }`? Until it does, a mid-track range is recorded in the video asset's name.
5. Does Runware accept `frameImages` together with `referenceVideos` for Seedance 2.5 and H3?

## Credits and references

- Tariq (@trq212) for the phase-timeline idea.
- ComfyUI-PoseTracks and Yedp Action Director as prior art.
- NVIDIA MotionBricks and GEM-X.
- The seed engine, recipe validator and Three.js preview come from the Motion Studio MVP kit designed with Astra.
