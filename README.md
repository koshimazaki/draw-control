# Motion Studio

A browser motion studio: a neutral mannequin dances to your track, an agent edits the moves phase by phase, and the result exports as a guide clip that video models can follow.

Status: first working slice plus the timeline editor, the audio-reactive layer, the CLI and the MCP server (11 November 2026). See [what is built](#what-is-built) and [next](#next).

- [Product requirements](docs/PRD.md)
- [Implementation plan and current state](docs/plan.md)
- [Agents: CLI and MCP, with a worked example](docs/agents.md)
- [Recipe format](docs/recipe.md)

Companion repo: **model-arena**, which plays a guide's results from several video models side by side. The two share files (the guide bundle), not code.

## From a music file to a guide bundle in five minutes

You need Node 24 and a current Chrome or Edge (the export uses WebCodecs). Nothing is uploaded: the track and any character stay in your browser.

```bash
git clone <this repo> motion-studio && cd motion-studio
nvm use            # Node 24, from .nvmrc
npm install
npm run dev        # open http://127.0.0.1:5180
```

1. **Track.** Drop your music file anywhere on the page (or *Load music*). The studio detects the BPM and the first beat; check by ear and correct the numbers if needed. Press *Fit to track* to make the recipe as long as the song.
2. **Moves.** Type a beat in *Add at beat*, then click a move (Bounce, Clap, Kick, Walk…). The cursor jumps a bar on, so clicking four moves fills four bars. Click the strip under the viewport to seek and select a move; change its amplitude, blend or preview fps.
3. **View.** Keep *Front* for most video models; Side, Top, Orbit and Isometric are there too. Press *Play* to watch it against the track.
4. **Export.** Size is 1280×720 by default (1920×1080 and 720×1280 portrait are offered). To export only part of the song, set *Start* and *Length* in beats or seconds; leave them empty for the whole recipe. A yellow note appears if the size or the clip length is outside what the target video model accepts (700–4553 px per side, 3–30 s); it is a warning, and the export still runs.
5. Press *Export bundle (.zip)*. You get `guide-bundle.zip`; unzip it and send `guide.mp4` (with `frame0.png` if your model takes a first frame) to the video model.

Own character: drop a skinned `.glb` or `.fbx` (Mixamo bone names recognised) and set its licence. It plays its own embedded clips, listed under *Moves*. Library moves do not drive a loaded rig yet, so the studio asks, inline, whether to clear them from the recipe.

## The guide bundle

| File | Content |
| --- | --- |
| `guide.mp4` | H.264, 24 fps, frame count 8k+1, rendered frame by frame; AAC audio muxed in when the browser can encode it |
| `audio.wav` | the track, trimmed to the exported range |
| `frame0.png` | frame 0 of the export |
| `beats.json` | BPM, beat and downbeat times, and (0.3.0) kick, snare and hat onsets and amplitude peaks, re-based so 0 is the export's first frame |
| `recipe.json` | the recipe that produced it |
| `meta.json` | width, height, fps, frames, view, character, generator, licence per asset; a mid-track range is named in the video asset |
| `bundle.json` | manifest pointing at the files above |

The JSON Schema is in [`schema/guide-bundle.schema.json`](schema/guide-bundle.schema.json). It is a pinned local copy: `model-arena/packages/core` owns the schema, and this copy is to be re-synced with it whenever its version changes. The target model limits live in `packages/core/src/export-target.ts`, re-synced with the per-model spec database in `model-arena`.

## Development

```bash
npm test           # vitest: recipe, engine, beat grid, commands, bundle schema, export range and limits
npm run typecheck
npm run lint
npm run smoke      # real headless Chrome: synthetic click and drum tracks, a generated skinned character; band markers, block drags, the envelope pencil, a walk path, a camera move on a snare and three exports checked with ffprobe; output in out/smoke/
npm run cli -- commands   # the motion-studio CLI (docs/agents.md); npm run mcp starts the MCP server
```

`packages/core` is pure TypeScript (recipe, validator, `frameAt`, beat analysis, commands, bundle builders), no DOM or Three.js. `packages/studio` is the Vite + Three.js app (no React Three Fiber).

## Editing on the timeline

Under the viewport, top to bottom on one beat axis:
- **phases** of the accents (wind-up, strike, recover) on the hit markers;
- **moves** as blocks: drag to move, drag an edge to lengthen (plays slower) or shorten (faster); *Snap* picks beats, half beats, kicks, snares or hats (Alt: free); *Paint* paints the brush instead; the side panel edits start, length, speed and amplitude (0–3), starts the move on the nearest kick or snare, or places it on every Nth one;
- the **amplitude envelope** (0–3 per frame): *Pencil* draws, *Points* drags breakpoints, *Start* fills it from the loudness or a band's onsets;
- **amplitude per step**, the **energy** graph with the hit markers, and the **audio lane**: the waveform, beat and bar ticks, kicks (red), snares (yellow) and hats (cyan), peaks as dots.

Camera rig panel: follow from the front, three-quarter, side or behind, top, fixed, orbit, push and rise; *Start [mode] on [snare] N*. Floor path: *Draw walk path* in the top view over a range of beats, with a walk or run block. *Floor grid* and *Grid in export* in the View panel. Characters: the rigged mannequin, and the procedural mannequin, block, stick and capsule figures. *Command log* lists each edit as a command to replay with the CLI or MCP.

## What is built

- Recipe v2: moves made of phases (name, caption, pose, amplitude, length in beats or frames, preview fps, optional `expression`), root path, jumps, beat grid, character and audio references with licences; strict validator.
- Deterministic `frameAt(recipe, n)`: no wall clock; phases land on the beat grid; cross-fades between moves; clip layers for loaded characters; pose speed typed hold, move or fast.
- Beat grid from the track: RMS envelope, BPM and offset estimate, downbeats.
- Characters: procedural jointed mannequin (light limbs, dark joints, framed to fit any aspect ratio), block figure, local GLB/FBX playing its own clips.
- One command entry point for every edit (`applyMotionCommand`; `npm run cli -- commands` lists them), with the `motion-studio` CLI and an MCP server ([agents.md](docs/agents.md)).
- Drum-band analysis: kick, snare and hat onsets with strengths, amplitude peaks; exported in `beats.json` (schema 0.3.0).
- Export of the bundle via WebCodecs and `mp4-muxer` (MIT): preset or custom size, any section of the recipe, inline warnings against the target model's limits.
- Inline confirm when a character switch leaves moves the new character cannot play.

## Next

Not built yet:

- Previous/new comparison with accept or revert; a camera lane on the timeline (camera ranges are set from the panel or by command).
- Drum-band detection checked on real music (it is tested on synthetic patterns only).
- Foot locking on walk paths; an energy-driven walking speed.
- Recipe poses driving a loaded Mixamo rig (needs rest-pose retargeting); IK and foot locking.
- Facial expressions: the `expression` field is validated and exported, not yet rendered.
- Pose and expression extracted from a video into a recipe; MotionBricks as a serverless generator; MS-6 providers.

## Levels

| Level | What you do | Needs |
| --- | --- | --- |
| L0 | Open the page, pick a move, play, export the guide | nothing |
| L1 | Load your track for the beat grid, edit phases on the timeline, let an agent edit the recipe | an agent (CLI or MCP) |
| L2 | Send the guide to video models | your own provider key |
| L3 | Generate motion with MotionBricks on serverless GPUs; import a dancer from video | a serverless account |

Licence: MIT. No Mixamo files, motion datasets or body models ship in this repo; you load your own. Test fixtures are generated. The seed engine, validator and preview come from the Motion Studio MVP kit.
