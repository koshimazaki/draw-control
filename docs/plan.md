---
tags: [plan, motion-studio, agents]
summary: Implementation plan for Motion Studio as work packages MS-0 to MS-8, with the real state on 10 November 2026, the remaining packages for 11–14 November and a cut line.
---

# Motion Studio: implementation plan

Written 7 November 2026, brought up to date 10 November 2026. Product scope is in [PRD.md](PRD.md). The cross-repo overview, covering both this repo and `model-arena`, is kept privately by the owner. This file is the build plan for this repo.

## Milestones

| Date | State |
| --- | --- |
| Sun 8 Nov | Done: repo scaffolded; guide-bundle format written down (pinned schema 0.1.0) |
| Tue 10 Nov | Done: MS-0, MS-1, MS-2, MS-5 and the pure commands of MS-4; export size, range and target warnings; legible mannequin |
| Wed 11 Nov | MS-4 CLI `apply`; MS-6 providers interface |
| Thu 12 Nov | Preview: MS-3 phase blocks with drag-to-edit; repo public, README runnable in five minutes |
| Fri 13 Nov | MS-4 `render` CLI and the remaining commands; schema re-sync with `model-arena` |
| Sat 14 Nov | Final for the first milestone: a bundle loads in a `model-arena` record |
| After | Everything below the cut line, then [Next](PRD.md#next-not-built) |

## Stack and layout

TypeScript, Vite, Three.js (no React Three Fiber), vitest, ESLint. Node 24.

```
packages/core/        recipe and validator, poses and move library, deterministic engine, beat analysis,
                      edit commands, bundle builders, export range and target model constraints
packages/studio/      Vite app: viewport, characters, views, beat strip, export (MP4, WAV, zip)
schema/               pinned copy of the guide-bundle JSON Schema (owner: model-arena)
scripts/smoke.mjs     real headless Chrome run, ffprobe checks
providers/            (MS-6, not yet) MotionGenerator interface; local time-stretch default
cli/, mcp/            (MS-4, not yet) agent edit loop over the same commands
docs/                 PRD, plan, friction.md, costs.md
```

## The guide bundle (contract with model-arena)

`model-arena/packages/core` owns the JSON Schema. This repo validates against a pinned copy, `schema/guide-bundle.schema.json` (version 0.1.0, written here from this table on 10 November 2026 while `model-arena` was being scaffolded). **To do:** re-sync it once that schema exists.

| Field | Meaning |
| --- | --- |
| `video` | MP4, H.264, 24 fps, frame count 8k+1; 1280×720 by default |
| `audio` | the track, trimmed to the exported range |
| `firstFrame` | PNG of frame 0 of the export; optional `firstFrameStyled` |
| `beats` | beat and downbeat times and BPM, re-based so times count from the export's frame 0 |
| `recipe` | the recipe that produced it (whole recipe, not trimmed) |
| `meta` | width, height, fps, frames, view, character, generator, licence per asset, `audioInVideo` |

The bundle also carries `bundle.json`, a manifest naming each file. **Schema gap:** the schema has no field for the exported section of the recipe, so a mid-track range is written into the video asset's `name` ("Rendered guide, recipe frames 107-211 (4.458-8.833 s)"). Proposal for the next schema version: `meta.range { startFrame, startSeconds }`.

**Target model constraints** (700–4553 px per side, 24–60 fps, 3–30 s) sit in one small table in `packages/core/src/export-target.ts`. The sibling repo `model-arena` holds the full per-model spec database; re-sync the table with it.

## State, 10 November 2026

Branch `feat/ms-core`. Three levels of evidence:

**Built and browser-verified** (`npm run smoke`: real headless Chrome, synthetic fixtures, ffprobe):
- loading a WAV track; BPM and first-beat detection (112.1 BPM, 0.20 s on a 112 BPM click track);
- placing library moves on beats from the palette; the five views render (screenshots);
- export at the 1280×720 default; a mid-track range (beats 8–16 of 20): 105 frames, H.264 1280×720 at 24 fps, AAC muxed, `audio.wav` trimmed so its first click lands on the first beat of the re-based `beats.json`;
- the inline size warning (832×480) and clip-length warning (under 3 s), neither blocking the export;
- portrait framing (720×1280) keeps outstretched arms in frame (screenshot, checked by eye);
- loading a generated skinned GLB with three embedded clips; Mixamo bone names recognised; clips sequenced on beats and exported;
- the inline confirm on switching to the loaded character: *Keep* leaves the library moves, *Clear* removes them; no browser dialog appears.

**Unit-test-only** (`npm test`, 46 tests):
- recipe validation and round trip; engine determinism and phase timing on the beat grid; pose speed classes;
- the edit commands `insertMove`, `swapMove`, `removeMove`, `setAmplitude`, `extendPhase`, `applyMotionCommand` (the UI calls them, but the smoke run drives only `insertMove`);
- beat analysis on synthetic click tracks; bundle JSON against the pinned schema; WAV encoding;
- export range resolution and 8k+1 snapping; target constraint warnings; move compatibility on a character switch.

**Built, not verified by any automated run:** FBX loading; drag and drop; audio playback; editing a selected move (amplitude, fps, blend, expression, swap, remove); applying recipe JSON by hand; the block figure; the dark background; exporting at 1920×1080 or 720×1280; custom sizes above 1920×1080 (H.264 level 5.1 is tried, untested).

**Gaps:**
- Library moves do not drive a loaded rig: recipe poses need rest-pose retargeting onto the file's skeleton. A loaded character plays only its own embedded clips; the switch confirm offers to clear the library moves.
- No IK and no foot locking: feet can slide or sink slightly during blends; the bounce pose is solved by hand so the feet stay put.
- The `expression` field is validated, stored and exported, not rendered.
- MS-3 is a simple beat strip; there is no phase-block timeline, speed curve or before/after comparison yet.
- No CLI or MCP yet; the commands are a library.
- The range is not previewed: playback runs over the whole recipe.

## Work packages

Rules for every package:
- one worktree, one branch `feat/ms-<n>-<slug>`, one PR;
- commits by Koshi only, no attribution lines;
- typecheck, lint, tests and the smoke run green;
- a docs section;
- a hand-back of at most ten lines.

### Done: MS-0 scaffold, MS-1 core, MS-2 viewport and characters, MS-5 export

As specified on 7 November, with these changes:
- MS-1: `phase.ts` folded into `recipe.ts`; `expression` added per phase.
- MS-2: the procedural mannequin is the default guide figure: light limbs, dark slate joints, a plié bounce that reads from the front, framing that fits any aspect ratio.
- MS-5: sizes 1280×720 (default), 1920×1080, 720×1280 and custom; export range; inline target warnings.

### MS-4a, CLI `apply` (Wed 11 Nov)

Files: `cli/`, `packages/core/src/commands.ts`.
- `motion-studio apply recipe.json commands.json --out recipe.next.json`, over `applyMotionCommand`.
- Add `shortenPhase` (sugar for a negative `extendPhase`), `holdAt {moveId, phase, beats}` and `setPhaseFps`.
- Tests: each new command alone; a three-command script run twice gives identical frames; invalid commands refused with a clear message.

### MS-6, providers interface (Wed 11 Nov, small)

- The `MotionGenerator` interface takes a recipe, beat keyframes and a root path, and returns a clip.
- The local time-stretch generator implements it.
- Folders for `runware-serverless` and `runpod` with README stubs only.

### MS-3, timeline (Thu 12 Nov)

Files: `packages/studio/src/timeline/`.
- Phase blocks coloured by speed class (hold, move, fast), beat and downbeat ticks over them, the active caption in the viewport.
- Drag a block edge: the phase length changes through `extendPhase`, the same command the agent uses (acceptance).
- The export range shown on the strip.
- Reference: Tariq's Kesar tool ([post](https://x.com/trq212/status/2105849295580889208)). Credit him in the docs; copy none of his assets.

### MS-4b, CLI `render` and schema re-sync (Fri 13 Nov)

- `motion-studio render recipe.json --out bundle/ [--size 1280x720] [--start 8 --length 8 --unit beats]`, driving the studio in headless Chrome as the smoke run does.
- Re-sync `schema/guide-bundle.schema.json` with `model-arena/packages/core`; propose `meta.range`.
- The target constraint table re-synced with the `model-arena` spec database.

### Final (Sat 14 Nov)

- A 1280×720 mannequin bundle loads in a `model-arena` record.
- README walkthrough tried from a clean clone by someone outside the project.

### Cut line

Everything above is the first milestone. **Below the line, not in the first milestone:**
- MS-3 pose-speed curve, previous/new/both comparison with accept or revert, 1/4 and 1/8 playback;
- MCP server over the commands;
- range preview and looping in the player;
- recipe poses driving a loaded rig (rest-pose retargeting); IK and foot locking;
- MS-7 MotionBricks and MS-8 pose input (below), and the [Next](PRD.md#next-not-built) items in the PRD.

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
