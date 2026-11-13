# Motion Studio

A browser studio where a neutral figure moves to your music, beat by beat, under a camera that moves with it.
You (or an agent, by command or by a plain-text shot script) edit the moves and the camera on a timeline.
The result exports as a guide clip, with its beats and camera path, for video models to follow.

Status: working studio, CLI and MCP server, 11 November 2026. What is not done is [at the end](#not-done). Detail: [PRD](docs/PRD.md) · [plan and current state](docs/plan.md) · [agents: CLI and MCP](docs/agents.md) · [recipe and shot script format](docs/recipe.md).

## Beat Path (start here)

The lean demo: **draw a path on a map, add music, and the movement and the camera lock to the beat; export a guide clip for video models.** One screen, an abstract figure, a handful of controls.

```bash
nvm use && npm install && npm run dev   # open http://127.0.0.1:5180/path.html  (Runware look: /path.html?theme=runware)
```

It opens with a generated drum track, the "car on a road" example, the figure locked to the kicks: press **Play**. Below the editor, **Generate** and **Gallery** are reserved sections (their panels mount later; `window.beatPath.exportGuideInMemory()` hands them the bundle as Blobs). The page's name is one constant, `packages/studio/src/beat-path/name.ts` (plus this heading).

- **Map** (left): *Subject path* or *Camera path*, *Top* or *Side* (heights: drag a point up to fly or leap). *Edit points* (the default) only moves points: drag one, Delete removes the selected one; a stray click never draws. *Draw new* arms the pen: drag a stroke or click to place points; Escape stops. *Corners* goes from sharp (hard turns) to round. The camera's track is drawn block by block with labels, dots on every beat and a ring where the camera is on each of its hits.
- **Lanes** (under the music strip): *Character* (glide, hover, spin, jump, freeze) and *Camera* (follow behind, follow side, orbit, top, my path, push in). Click a block for its words, a line saying what its shape is, a text field for typed direction (`over shoulder`, `go above then dolly in 2m`, `push in fast`, `orbit 180 slow`; invalid words show the valid ones), split and remove. Drag an edge: *Snap to beats* on snaps to beats and hits, off moves by single frames. Delete removes the selected block; Cmd/Ctrl-Z undoes, Shift redoes.
- **Lock chips** in the lane gutters: each lane has its own source (off, beat, kick, snare) and strength, so the figure can land on kicks while the camera moves on snares; the camera's chip also sets what it does on each hit (keeps moving, holds, punches in) and *Next move on each hit*.
- **Music strip**: click a kick or snare marker to switch it off for every lock (again to restore; *Reset markers*). *Sound on/off* mutes the music; *Remove* plays without a track (a plain timed clip on a time ruler). **Clip** 5 s or 8 s (121 or 193 frames).
- **Guide**: *Grid*, *Landmarks in export*, the figure's two colours (body, head), **Export guide** (the bundle zip at 1280×720, 24 fps). **Shot**: subject, environment and action, with a legend line built from the figure's colours; stored in the recipe (`shot`) and the script, and in `recipe.json` of the bundle. *Copy prompt* joins them.
- **Copy script** / **Paste script** (or drop a `.txt`): the page state *is* a shot script, so an agent writes one and the CLI or MCP server renders the same thing without the page: `motion-studio new --character glider --clip 8 --analysis a.json --out base.json`, then `motion-studio script base.json examples/scripts/beat-path-road-bend.txt --analysis a.json`.
- **Examples**: seven scripts in `examples/scripts/beat-path-*.txt` (a car on a road, a runner leaping, something flying, a dancer spinning, kicks for the figure and snares for the camera, over the shoulder then above, free flow with no lock), each with its shot description; `voice-freeze-orbit.txt` is the worked voice example (a freeze mid-air while the camera orbits).
- **The camera never loses the subject**: a framing guard turns the aim towards the figure only when it nears the frame's edge (tested on every frame of every example and of stress recipes).

**Colours in the guide** (so a prompt can name them; the figure's colours can be changed, the legend line follows): the **orange figure** is the subject (a pyramid with a sphere floating above it); **white** marks its front (the front face and the sphere's nose); the **dark ground with lighter grid lines** is the floor (1 m cells, bolder every 4 m, fading into a dark horizon; *Grid* turns it off); the **grey blocks** (boxes, tall pillars, low walls) are landmarks placed clear of both paths so travel and parallax read in every still (*Landmarks in export* turns them off; `landmarks: off` in a script). Nothing else is in frame. Design tokens, the two themes and the sources of the Runware values: [docs/design.md](docs/design.md).

## Five-minute quickstart

You need Node 24 (`.nvmrc`) and Google Chrome or Edge (the export uses WebCodecs). Everything runs locally; nothing is uploaded.

```bash
git clone <this repo> motion-studio && cd motion-studio
nvm use && npm install
npm run check          # typecheck, lint, unit tests (about 10 s)
npm run dev            # open http://127.0.0.1:5180
```

**Load demo** (top of the page) needs nothing else: it generates a drum track in the browser (8 bars at 120 BPM, the same synth as `npm run drums`), applies [`examples/scripts/glide-path.txt`](examples/scripts/glide-path.txt) (a figure glides an L-shaped path, stopping on each kick, while the camera follows and then flies its own path) and switches to the *Camera rig* view. Press *Play*. Everything the quickstart uses is in the repo or generated: the character (`assets/characters/`), the demo track, the example scripts. No download, no file from another project.

With your own music (or `npm run drums`, which writes the same generated track to `out/drums-120.wav`):

1. **Track.** Drop a music file (WAV, MP3, M4A, OGG, FLAC) anywhere on the page. The studio finds the tempo, the first beat and the kicks, snares and hats. Press *Fit to track*.
2. **Script.** Open *Shot script* in the side panel, paste [`examples/scripts/glide-path.txt`](examples/scripts/glide-path.txt) and press *Apply script*. The rows land on the timeline as the **Action** track (what the figure does) and the **Camera** track (how the camera moves).
3. **Fine-tune.** Drag blocks and their edges on either track (they snap to beats, kicks or snares), pick a camera block to edit its shot, amount and beat lock, or open a camera lane (*Show: Distance, Height, Yaw, FOV*) and draw on it. Cmd/Ctrl-Z undoes.
4. **Export.** Pick the *Camera rig* view, set a size (1280×720 by default) and optionally a range, and press *Export bundle (.zip)*: `guide.mp4`, `frame0.png`, `audio.wav`, `beats.json`, `camera.json`, `recipe.json`, `meta.json`.

## CLI

`cli/`, run with `npm run cli -- <command>` or `node cli/bin/motion-studio.mjs <command>`. No build step.

```bash
npm run drums                                                   # out/drums-120.wav, a generated drum track
M() { node cli/bin/motion-studio.mjs "$@"; }
M analyse out/drums-120.wav --out out/analysis.json            # tempo, kicks, snares, hats, peaks
M new --analysis out/analysis.json --out out/recipe.json        # rigged mannequin, fitted to the track
M script out/recipe.json examples/scripts/glide-path.txt --analysis out/analysis.json --out out/shot.json
M describe out/shot.json --analysis out/analysis.json --script  # the tracks as a shot script again
M render out/shot.json --audio out/drums-120.wav --out out/bundle --start 0 --length 16 --unit beats
```

Also `apply` (a list of JSON commands), `set` (any field by path) and `commands` (every command with its arguments). `render` drives the studio in headless Chrome.

## MCP server

`mcp/`, an MCP server over stdio (official TypeScript SDK). Register it with any MCP client as:

```json
{ "mcpServers": { "motion-studio": { "command": "node", "args": ["/absolute/path/to/motion-studio/mcp/bin/motion-studio-mcp.mjs"] } } }
```

Tools: `analyse_audio`, `new_recipe`, `load_recipe`, `save_recipe`, `get_recipe`, `describe`, `get_script`, `apply_script`, `apply`, `set`, `undo`, `list_commands`, `render`. A session holds one recipe and one analysis. `npm run mcp-check` starts the server over stdio, applies `glide-path.txt` and renders a bundle to `out/mcp-check/`.

## Folders

```
packages/core/     the engine: recipe format and validator, frameAt, beat and drum analysis, edit commands,
                   shot script, describe, camera rig, bundle builders. Pure TypeScript, no DOM, no dependencies.
packages/studio/   the Vite + Three.js app (timeline, viewport, characters, export). Not imported by anything else.
cli/               the motion-studio CLI (imports the core's public entry; `render` serves the studio to headless Chrome)
mcp/               the MCP server (the same commands; reuses the CLI's analysis and render)
schema/            guide-bundle JSON Schema 0.5.0 (pinned copy; the owner is the model-arena repo)
examples/          recipes/ (example sequences), scripts/ (shot scripts); bundles/ is generated, not committed
scripts/           smoke (real headless Chrome), mcp-check, examples, peek (screenshots), drums, mixamo-check, analyse-clips
docs/              PRD, plan, agents (CLI, MCP, worked examples), recipe format, costs, friction log
assets/characters/ the bundled rigged mannequin (licences below)
```

| `npm run` | What it does |
| --- | --- |
| `dev`, `build` | the studio on http://127.0.0.1:5180, or a static build in `packages/studio/dist/` |
| `check` | `typecheck` (core, studio, CLI, MCP) + `lint` + `test` (vitest) |
| `smoke` | real headless Chrome through the studio: tracks, drags, lanes, a script, recording, four exports checked with ffprobe; then the Beat Path page (a drawn path, lock on kick, a lane menu, a pasted script, an export validated against the schema); `out/smoke/` |
| `mcp-check` | the MCP server over stdio: `apply_script` and `render`; `out/mcp-check/` |
| `drums` | a generated 120 BPM drum track, `out/drums-120.wav` |
| `examples` | regenerate the example bundles in `examples/bundles/` |
| `peek`, `mixamo-check` | screenshots of the views; a check of your own Mixamo clips in `assets-local/mixamo/` |
| `cli`, `mcp` | the CLI, or the MCP server on stdio |

## Using `packages/core` from another app

`@motion-studio/core` is TypeScript source with an `exports` map: `.` is the public entry ([`src/index.ts`](packages/core/src/index.ts), the recipe types and validator, `frameAt`, commands, the shot script, `describeRecipe`, beats and onsets, the camera rig, the bundle builders); `./internal` is every module, for the studio. It has no runtime dependencies and needs no Three.js. In a Vite or React Three Fiber app, link it and import it; Vite compiles the TypeScript:

```bash
npm install ../motion-studio/packages/core      # or "@motion-studio/core": "file:../motion-studio/packages/core"
```

```ts
import { validateRecipe, frameAt, planCamera, cameraAtSeconds } from "@motion-studio/core";
const recipe = validateRecipe(json), plan = planCamera(recipe);   // planCamera(recipe, drive) for the music-driven camera
useFrame(({ clock, camera }) => {
  const t = clock.elapsedTime, f = frameAt(recipe, Math.floor(t * recipe.fps));
  figure.current.position.set(f.root.x, f.root.y, f.root.z); figure.current.rotation.y = f.root.yawRadians;
  // f.pose: joint angles (procedural figures); f.layers: clip name, time and weight for an AnimationMixer (rigged mannequin)
  const c = cameraAtSeconds(plan, t); camera.position.set(...c.position); camera.lookAt(...c.target);
});
```

Every frame is a pure function of (recipe, audio drive, frame), so it can be seeked and rendered out of order. The figures themselves (the procedural mannequin and the rigged mannequin's clip mixer) are drawn by the studio in `packages/studio/src/characters/`; copy what you need. Plain Node needs a loader for the extensionless TypeScript imports (Node 24 strips types): see `cli/bin/motion-studio.mjs`. `packages/core/test/public-api.test.ts` imports only the public entry by package name and computes frames and a camera with no DOM.

## Licences

- Code: MIT ([LICENSE](LICENSE)).
- `assets/characters/AnimationLibrary.glb`: from Ecctrl, MIT (copyright Erdong Chen, [ECCTRL-LICENSE.txt](assets/characters/ECCTRL-LICENSE.txt)); animations based on the Quaternius Universal Animation Library, CC0. See [NOTICE.md](assets/characters/NOTICE.md). Every export lists the character's licence in `meta.json`.
- The ground grid shader (`packages/studio/src/ground-grid.ts`) adapts the `Grid` shader of [@react-three/drei](https://github.com/pmndrs/drei) (MIT, copyright (c) 2020 react-spring); the licence text is in that file.
- Libraries: Three.js (MIT), mp4-muxer (MIT), fflate (MIT), the MCP TypeScript SDK (MIT), zod (MIT); dev only: Vite, vitest, ESLint, TypeScript, Playwright core, ajv.
- Test and demo tracks are generated (`packages/core/test/drum-synth.ts`). No Mixamo files, motion datasets or body models ship; your own Mixamo clips stay in `assets-local/` (git-ignored).

## Not done

- No foot locking or IK: feet can slide, most with the procedural walk and run (a rigged gait plays at the path's speed).
- Recipe poses do not drive a loaded GLB/FBX rig (no rest-pose retargeting); a loaded character plays its own clips.
- There is no fall move; facial expressions are stored, not rendered.
- Drum detection is tested on synthetic patterns only, not on real mixes.
- Recording a camera lane by dragging the camera in the viewport; driving the figure from the keyboard; voice input.
- Previous/new comparison with accept or revert; range preview and looping in the player.
- MotionBricks, pose input from video and the provider interface (see [plan](docs/plan.md)).
- The bundle schema 0.5.0 (0.4.0's camera modes, 0.5.0's character kind `glider`) still has to be taken into model-arena.
