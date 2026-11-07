---
tags: [prd, motion-studio]
summary: Product requirements for Motion Studio, a browser motion studio that turns an agent-edited, beat-driven mannequin performance into a guide clip for video models.
---

# Motion Studio: product requirements

Status: planning, 7 November 2026. Owner: Koshi.

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

## Features, first milestone (preview 12 November)

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
  - an H.264 MP4 at 24 fps with a frame count on the 8k+1 grid;
  - the audio;
  - a frame-0 PNG;
  - beats JSON;
  - recipe JSON;
  - meta with asset licences.
- **F8 Providers:** a `MotionGenerator` interface, with the local time-stretch generator as the default.

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

- **Video models.**
  - MiniMax H3 and Seedance 2.5 on Magnific refuse a start frame together with reference videos, so a pose-locked still goes in as an image reference there.
  - Kling 4.0 on Magnific takes no references; its reference-video lane is the Runware API.
  - Each provider's per-model schema is the contract.
- **MotionBricks** is an early preview in NVIDIA's robot project. Unknown: its output skeleton, its weight terms, and whether it accepts SOMA.
- **GEM-X** and MotionBricks need CUDA, so local runs happen on an NVIDIA box and hosted runs on serverless.

## Open questions

1. CLI only, or CLI and MCP, for the first milestone?
2. Does the first milestone carry a depth pass?
3. MotionBricks: which skeleton, which input format, which licence? (The spike answers these.)
4. Does Runware accept `frameImages` together with `referenceVideos` for Seedance 2.5 and H3?

## Credits and references

- Tariq (@trq212) for the phase-timeline idea.
- ComfyUI-PoseTracks and Yedp Action Director as prior art.
- NVIDIA MotionBricks and GEM-X.
- The seed engine, recipe validator and Three.js preview come from the Motion Studio MVP kit designed with Astra.
