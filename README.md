# Motion Studio

A browser motion studio: a neutral mannequin dances to your track, an agent edits the moves phase by phase, and the result exports as a guide clip that video models can follow.

Status: first working slice (MS-0, MS-1, MS-2, MS-5, and the pure edit commands of MS-4). See [what is built](#what-is-built) and [next](#next).

- [Product requirements](docs/PRD.md)
- [Implementation plan](docs/plan.md)

Companion repo: **model-arena**, which plays a guide's results from several video models side by side. The two share files (the guide bundle), not code.

## Quick start

Node 24 (`nvm use`), a current Chrome or Edge (WebCodecs).

```bash
npm install
npm run dev        # http://127.0.0.1:5180
```

From a music file to a guide bundle:

1. **Track:** load or drop your music file. BPM and the first-beat offset are detected (approximately); correct them by hand if needed, set the length in beats, or press *Fit to track*.
2. **Character:** pick *Mannequin* or *Block figure*, or load your own skinned `.glb`/`.fbx` (Mixamo bone names recognised). Set its licence.
3. **Moves:** set *Add at beat*, click a move (Bounce, Clap, Kick, Walk, Run…). For a loaded file, click its embedded clips instead; they are time-stretched to whole beats and cross-faded. Click the beat strip to seek and select a move; adjust amplitude, blend, preview fps.
4. **View:** Front, Side, Top, Orbit or Isometric; mid-grey or dark background.
5. **Export:** pick a size and press *Export bundle*. You get `guide-bundle.zip`.

## The guide bundle

| File | Content |
| --- | --- |
| `guide.mp4` | H.264, 24 fps, frame count 8k+1, rendered frame by frame; AAC audio muxed in when the browser can encode it |
| `audio.wav` | the track, trimmed to the clip |
| `frame0.png` | frame 0 |
| `beats.json` | BPM, offset, beat and downbeat times |
| `recipe.json` | the recipe that produced it |
| `meta.json` | width, height, fps, frames, view, character, generator, licence per asset |
| `bundle.json` | manifest pointing at the files above |

The JSON Schema is in [`schema/guide-bundle.schema.json`](schema/guide-bundle.schema.json). It is a pinned local copy: `model-arena/packages/core` owns the schema, and this copy is to be re-synced with it whenever its version changes.

## Development

```bash
npm test           # vitest: recipe, engine, beat grid, commands, bundle schema
npm run typecheck
npm run lint
npm run smoke      # real headless Chrome: synthetic click track + generated skinned character → two bundles, checked with ffprobe
```

`packages/core` is pure TypeScript (recipe, validator, `frameAt`, beat analysis, commands, bundle builders), no DOM or Three.js. `packages/studio` is the Vite + Three.js app (no React Three Fiber).

## What is built

- Recipe v2: moves made of phases (name, caption, pose, amplitude, length in beats or frames, preview fps, optional `expression`), root path, jumps, beat grid, character and audio references with licences; strict validator.
- Deterministic `frameAt(recipe, n)`: no wall clock; phases land on the beat grid; cross-fades between moves; clip layers for loaded characters; pose speed typed hold, move or fast.
- Beat grid from the track: RMS envelope, BPM and offset estimate, downbeats.
- Characters: procedural jointed mannequin, block figure, local GLB/FBX playing its own clips.
- Pure edit commands: `insertMove`, `swapMove`, `removeMove`, `setAmplitude`, `extendPhase`, `applyMotionCommand`.
- Export of the full bundle via WebCodecs and `mp4-muxer` (MIT).

## Next

- MS-3 timeline: phase blocks typed by speed, pose-speed curve, previous/new comparison, drag to edit (a simple beat strip stands in today).
- MS-4 agent loop: CLI (`apply`, `render`) and MCP over the existing commands; `holdAt`, `setPhaseFps`.
- Recipe poses driving a loaded Mixamo rig (needs rest-pose retargeting); IK and foot locking.
- Facial expressions: the `expression` field is validated and exported, not yet rendered.
- MS-6 providers, MS-7 MotionBricks, MS-8 pose input from video.

## Levels

| Level | What you do | Needs |
| --- | --- | --- |
| L0 | Open the page, pick a move, play, export the guide | nothing |
| L1 | Load your track for the beat grid, edit phases on the timeline, let an agent edit the recipe | an agent (CLI or MCP) |
| L2 | Send the guide to video models | your own provider key |
| L3 | Generate motion with MotionBricks on serverless GPUs; import a dancer from video | a serverless account |

Licence: MIT. No Mixamo files, motion datasets or body models ship in this repo; you load your own. Test fixtures are generated. The seed engine, validator and preview come from the Motion Studio MVP kit.
