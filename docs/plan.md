---
tags: [plan, motion-studio, agents]
summary: Implementation plan for Motion Studio as work packages MS-0 to MS-8, with files, tests and acceptance, for builder agents.
---

# Motion Studio: implementation plan

Written 7 November 2026. Product scope is in [PRD.md](PRD.md). The cross-repo overview, covering both this repo and `model-arena`, is kept privately by the owner. This file is the build plan for this repo.

## Milestones

| Date | State |
| --- | --- |
| Sun 8 Nov | Repo scaffolded; the guide-bundle format agreed with `model-arena` |
| Tue 10 Nov | MS-1 to MS-5 done: a mannequin guide edited by three agent commands, exported as a bundle |
| Thu 12 Nov | Preview: repo public, README runnable in five minutes |
| Sat 14 Nov | Final for the first milestone |
| After | MS-7 MotionBricks (on a spike yes), MS-8 pose input, Genobi adaptation |

## Stack and layout

TypeScript, Vite, Three.js (no React Three Fiber dependency in core), vitest. Node 24.

```
packages/core/        recipe schema and validator, phase model, deterministic engine, applyMotionCommand
packages/studio/      Vite app: viewport, timeline, views, export
providers/            MotionGenerator interface; local (time-stretch, default); later motionbricks, runware-serverless, runpod
serverless/motionbricks/   container.yaml, Dockerfile, batch handler (MS-7)
cli/                  agent edit loop
mcp/                  MCP server over the same commands (if time)
examples/             mannequin move sets, an own-music beat track, sample bundles
docs/                 PRD, plan, friction.md, costs.md, levels
```

## Seed code

The Motion Studio MVP kit at `~/Downloads/genobi-motion-studio-mvp`: 12 files, 1,452 lines.
- **Contents:** recipe validator, deterministic engine, RMS/BPM analysis, Three.js preview with GLB/FBX import, control surface, vitest tests.
- **How to use it:** mount it in this repo's Vite app. Do not run its Genobi installer.
- **Known gaps:**
  - no IK or foot locking;
  - no cross-rig retargeting (an animation-only FBX will not import; it needs a skinned export);
  - limbs react to energy only on the procedural mannequin;
  - the PNG export is capped at 120 frames, and there is no MP4.

## The guide bundle (contract with model-arena)

`model-arena/packages/core` owns the JSON Schema. This repo's export tests validate against a pinned copy, re-synced whenever the schema version changes.

| Field | Meaning |
| --- | --- |
| `video` | MP4, H.264, 24 fps, frame count 8k+1 |
| `audio` | the track |
| `firstFrame` | PNG of frame 0; optional `firstFrameStyled` |
| `beats` | beat and downbeat times, BPM |
| `recipe` | the recipe that produced it |
| `meta` | width, height, fps, frames, character, generator, licence per asset |

## Work packages

Rules for every package:
- one worktree, one branch `feat/ms-<n>-<slug>`, one PR;
- commits by Koshi only, no attribution lines;
- typecheck and tests green;
- a docs section;
- a hand-back of at most ten lines.

### MS-0, scaffold (Sun 8 Nov, half a day)

- Vite, TypeScript and vitest workspace with `packages/core` and `packages/studio`; lint; `npm test` and `npm run dev` scripts.
- `docs/friction.md` and `docs/costs.md`, each an empty table.
- A pinned copy of the guide-bundle schema.
- Acceptance: `npm test` green; `npm run dev` shows an empty viewport.

### MS-1, core: recipe, phases, engine (Mon 9 Nov)

Files: `packages/core/src/recipe.ts`, `phase.ts`, `engine.ts`, `commands.ts`, plus tests.

- **Recipe schema.**
  - Moves are made of phases. Each phase has a name, a caption, an amplitude, a length (frames or beats) and a preview fps.
  - The recipe also holds a root path (x, z, yaw), scheduled jumps, the beat grid reference and the character reference.
- **Validator** taken from the kit, extended for phases.
- **Engine.** `frameAt(recipe, n)` returns the pose for any frame, deterministically, with no wall clock.
- **Pose speed per frame**, which drives the hold, fast or move typing.
- **Tests:** schema round trip, determinism (two renders give identical pose arrays), phase timing against the beat grid.

### MS-2, studio: viewport, characters, views (Mon 9 Nov)

Files: `packages/studio/src/viewport.ts`, `characters/`, `views.ts`.

- Characters: the procedural mannequin, a block figure, and a local GLB or FBX with a skeleton (Mixamo bone names mapped). Nothing is bundled.
- Views: Side, Front, Top, Orbit, and isometric (orthographic, about 35° pitch, 45° yaw).
- Acceptance: each character plays a kit move in every view.

### MS-3, timeline UI (Tue 10 Nov)

Files: `packages/studio/src/timeline/`.

- **Phase blocks**, one per phase, coloured by type: hold, fast or move. Each phase's caption shows in the viewport while that phase plays.
- **Beat and downbeat ticks** over the blocks.
- **Pose-speed curve** under the blocks.
- **Previous, new, both** after an edit: the previous take beside the new one, both speed curves overlaid, then accept or revert.
- **Transport:** frame step, play and pause, 1×, 1/4 and 1/8 playback, previews at 12, 18, 30 and 60 fps, and a readout of frame and seconds.
- **Reference:** Tariq's Kesar tool ([post](https://x.com/trq212/status/2105849295580889208)). Credit him in the docs; copy none of his assets.
- **Acceptance:** dragging a block edge changes the phase length through the same command the agent uses.

### MS-4, agent edit loop (Tue 10 Nov)

Files: `packages/core/src/commands.ts`, `cli/`, and `mcp/` if time allows.

- **Commands:**
  - `insertMove {move, atBeat}`
  - `extendPhase {phase, by}` and `shortenPhase`
  - `holdAt {marker, frames}`
  - `swapMove {from, to}`
  - `setAmplitude {phase, value}`
  - `setPhaseFps`
- **CLI:** `motion-studio apply recipe.json commands.json --out recipe.next.json` and `motion-studio render recipe.json --out bundle/`.
- **Tests:** each command alone; a three-command script run twice gives identical frames; invalid commands are refused with a clear message.

### MS-5, export the guide bundle (Tue 10 Nov)

Files: `packages/studio/src/export/`.

- MP4 via WebCodecs plus an MIT-licensed muxer, at 24 fps with the frame count snapped to 8k+1. A frame-0 PNG. Beats, recipe and meta JSON.
- The licence of every asset goes into the meta.
- Acceptance: a 4 to 5 second mannequin bundle validates against the schema and loads in a `model-arena` record.

### MS-6, providers interface (Wed 11 Nov, small)

- The `MotionGenerator` interface takes a recipe, beat keyframes and a root path, and returns a clip.
- The local time-stretch generator implements it.
- Folders for `runware-serverless` and `runpod` with README stubs only.

### MS-7, MotionBricks (spike first; build only on a yes)

- **Spike:** two hours on an NVIDIA box. Does the early-preview code (GR00T-WholeBodyControl/motionbricks) run outside the robot stack? Which skeleton does it output, which input format does it take, does it accept SOMA, and what are the weight terms?
- **Generator:** `providers/motionbricks`. Beat keyframes in, clip out, retargeted in Three.js (`SkeletonUtils.retargetClip` or an Apache-licensed retargeter).
- **Serverless:** `serverless/motionbricks` as a custom container, with one batch endpoint per move set so a single cold start covers it.
- **Acceptance:** one agent-edited recipe rendered through MotionBricks, shown next to the time-stretch version.

### MS-8, pose input (after the first milestone)

- **2D:** DWPose or RTMPose (Apache), drawn in the OpenPose style.
- **3D:** GEM-X to SOMA, retargeted to Mixamo naming.
- **Two-stage route:** GEM-X keyframes go into the recipe and MotionBricks fills between them. Keyframe density is the fidelity dial.
- **Licence gate:** no SMPL, GVHMR, AIST++ or raw Mixamo files in the repo.

## Agent rules

- Builders are Opus at medium effort. UK English in docs.
- Read the PRD and this plan before writing code.
- A claim about a third-party model or API is written only after its schema or docs show it.
- No paid call without the owner's approval. Every real run is a row in `docs/costs.md`; every platform friction is a row in `docs/friction.md`.
- Hand-back: branch, head SHA, what was verified by which command, what was not run, open questions.

## Order and cut lines

- **Order:** MS-0 → MS-1 → MS-2 → MS-4 → MS-5 is the core. MS-3 makes it watchable. MS-6 is small.
- **MS-7 and MS-8** are next steps unless the spike lands early.
- **Not reached by Tuesday night?** The `model-arena` floor uses an existing guide clip, and this repo continues as "next".
