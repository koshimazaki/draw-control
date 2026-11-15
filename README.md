# Motion Studio

A browser studio where a neutral figure moves to your music, beat by beat, under a camera that moves with it.
You (or an agent, by command or by a plain-text shot script) edit the moves and the camera on a timeline.
The result exports as a guide clip, with its beats and camera path, for video models to follow.

Status: working studio, CLI and MCP server, 11 November 2026. What is not done is [at the end](#not-done). Detail: [PRD](docs/PRD.md) · [plan and current state](docs/plan.md) · [agents: CLI and MCP](docs/agents.md) · [Hermes on Runware](docs/hermes.md) · [recipe and shot script format](docs/recipe.md) · [video models: length and frame rate](docs/models.md).

## Beat Path (start here)

The lean demo: **draw a path on a map, add music, and the movement and the camera lock to the beat; export a guide clip for video models.** One screen, an abstract figure, a handful of controls.
Changing the page (developers and agents): [docs/beat-path.md](docs/beat-path.md) says how to run and check it and which file owns each control.

```bash
nvm use && npm install && npm run dev   # open http://127.0.0.1:5180/path.html  (Runware look: /path.html?theme=runware)
```

It opens on **Example 1** (a flying car among city towers) with its own music: press **Play**. *Example 2* is a runner on a city street filmed from beyond a colonnade (the columns pass between camera and runner for a moment at a time), *Example 3* a car on a coastal bend, *Your own* starts from a plain path; each keeps its edits and brings its own figure shape, scenery, camera and generated track (100, 120 or 140 BPM; the example-to-track table is `packages/studio/src/beat-path/tracks.ts`, your own files go in `packages/studio/public/tracks/`).

- **Map** (left): *Subject*, *Camera* or *Blocks*; *Top* or *Side* (heights); *Edit* (default; a stray click never draws) or *Draw new* (drag a stroke or click points; Escape stops); *Corners*. Pan with a scroll, a middle-button drag or a drag with Space held; zoom with ctrl/cmd + wheel or a pinch; *+*, *−*, *Fit* (every example loads framed). The camera's track is drawn block by block with labels, beat dots and hit rings; with no camera path the map says the camera follows the Camera lane, and a path drawn new flies the selected camera block. **Blocks**: click to select, drag to move, drag a corner to resize, a height field, *Draw new* drags a rectangle, Cmd/Ctrl-D duplicates, Cmd/Ctrl-C and -V copy and paste at the pointer, Delete removes; a block that would swallow the path is nudged off it.
- **Preview** (right), and once something is generated, the **output** beside it on the same playhead and music: drag the divider (double-click resets), swap the sides.
- **Shot**: subject, environment, action; optional *Character* and *Environment* images; the prompt the chosen model will get is shown beneath. **Model** (Kling 4.0, Seedance 2.5, MiniMax H3) and **Generate**: with your Runware key (*Add your Runware API key*, top right) it renders the guide in memory, asks you to confirm the estimated cost, and shows progress and the result beside the preview; *Add to gallery* keeps it. Swapping the asset and generating your own is two clicks from any example.
- **Music strip and lanes** (bottom): click a kick or snare marker to switch it off for every lock; *Sound on/off*, *Your track*, *No music*. *Character* lane (glide, hover, spin, jump, freeze) and *Camera* lane (follow behind, follow side, orbit, top, my path, push in, or a typed direction such as `over shoulder then go above`); their lock chips set what each lands on.
- **Settings** (closed): clip length (whole seconds, 3 to 30), locks, snap, ground grid, scenery (none, scatter, street, city), figure shape and colours, *Download guide (.zip)*.
- **The camera never loses the subject**: a framing guard turns the aim towards the figure only when it nears the frame's edge (tested on every frame).
- **Gallery** (scroll down): one row per example: its path, its guide (rendered in the browser when the row comes into view), the reference images, the shot description and prompt, and a clip per model, on one playhead with the example's music; your added runs form a last row. **Open source**: the footer links the code (MIT); it runs in your browser with your own Runware key.

Generation uses the vendored Model Arena embed (`npm run vendor:arena` copies it into `packages/studio/public/vendor/`); in development, or with `?fake=1`, a local fake provider answers instead of Runware so the layout can be judged with no key and no cost. A model receives only the guide video (with its music), the reference images and the prompt from the shot description, never the script. Agents still drive everything through the shot script (CLI, MCP, `examples/scripts/`), which does not show on the page. Static deploy (Cloudflare Pages or any host): [docs/deploy.md](docs/deploy.md). The page's name is one constant, `packages/studio/src/beat-path/name.ts`.

**Colours in the guide** (so a prompt can name them; the figure's colours can be changed, the legend line follows): the **orange figure** is the subject, shaped like it (a flyer, a runner, a car, or a pyramid with a sphere); **white** marks its front (nose, chest marker, headlights); the **dark ground with lighter grid lines** is the floor (1 m cells, bolder every 4 m, fading into a dark horizon; *Grid* turns it off); the **grey blocks** are the scenery (a scatter of boxes, a street of buildings, or a city grid), placed clear of both paths and the line of sight so travel and parallax read in every still. Nothing else is in frame. Design tokens, the two themes and the sources of the Runware values: [docs/design.md](docs/design.md).

## Five-minute quickstart

You need Node 24 (`.nvmrc`) and Google Chrome or Edge (the export uses WebCodecs). Everything runs locally; nothing is uploaded.

```bash
git clone <this repo> motion-studio && cd motion-studio
nvm use && npm install
npm run check          # typecheck, lint, unit tests (about 30 s)
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
