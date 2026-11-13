---
tags: [agents, cli, mcp, motion-studio]
summary: How an agent or a script drives Motion Studio without the UI, through the motion-studio CLI and the MCP server, with a worked example.
---

# Motion Studio for agents: CLI and MCP

Everything a person does in the studio is a command in `packages/core/src/commands.ts` (`applyMotionCommand`, with the command table in `command-table.ts`). The timeline, the side panels, the CLI and the MCP server all call the same commands. The studio's *Command log* panel shows the commands behind each edit, so a session in the browser can be replayed by a script.

Both tools run the TypeScript sources directly on Node 24 (no build step). Everything stays on this machine; the only network use is `npm install`.

## CLI

```bash
nvm use                                   # Node 24
npm install
npm run cli -- commands                   # or: node cli/bin/motion-studio.mjs commands
```

| Command | What it does |
| --- | --- |
| `analyse <audio> --out analysis.json` | Tempo, first beat, kick, snare and hat onsets with strengths, amplitude peaks, and the loudness envelopes. WAV is read directly; MP3, M4A, FLAC and OGG need ffmpeg. |
| `new [--character rigged\|mannequin\|block\|stick\|blob\|glider] [--clip 5\|8] [--analysis a.json] --out recipe.json` | A starting recipe (the rigged mannequin dancing), fitted to the track's tempo and length. `glider` starts the Beat Path base instead: a clip of `--clip` seconds from beat 0 with the page's camera rig, ready for a Beat Path script (`examples/scripts/beat-path-*.txt`). |
| `apply <recipe.json> <commands.json> [--analysis a.json] [--out next.json]` | Apply a list of commands in order. All or nothing: a refused command names its index and the reason. |
| `set <recipe.json> <path> <value> [--out next.json]` | Set any recipe field by path: `beatGrid.bpm 98`, `moves#Dance_Loop-4.speed 2`, `moves[0].phases[0].amplitude 2.5`, `camera.distance 5`, `reactive.amplitude 1`. The value is JSON when it parses, text otherwise; `null` deletes the field. |
| `describe <recipe.json> [--analysis a.json] [--script]` | The timeline as text: move blocks with start, end, speed, amplitude and lock, rests, hit markers, the camera ranges (with shots, amounts and locks), the camera lanes and paths, the walk path and its lock, the envelope, and the kicks, snares and hats in beats. With `--script` (put it last): the shot script instead. |
| `script <recipe.json> <script.txt> [--analysis a.json] [--out next.json]` | Apply a shot script ([recipe.md](recipe.md#shot-script)): the Action and Camera tracks from its rows. `@kick N` and `@snare N` need `--analysis`. |
| `render <recipe.json> [--audio track.wav] --out bundle/` | The guide bundle, rendered in headless Chrome through the studio (as `npm run smoke` does). Options: `--view rig\|front\|side\|top\|orbit\|iso` (default: `rig` when the recipe has a camera rig), `--size 1280x720`, `--start 8 --length 8 --unit beats\|seconds`, `--grid` (render the ground grid). Needs Google Chrome (or `CHROME_PATH`). |
| `commands` | Every command type with its arguments. |

Without `--analysis`, commands that read the music (kicks, snares, the loudness) fail with a clear message.

### Commands, by area

Run `npm run cli -- commands` for the full list with arguments. In short:

- **Shot script:** `applyScript` (`{ script }`, the same as `motion-studio script`).
- **Blocks on the move track:** `moveMoveTo`, `resizeMove` (an edge; a longer block plays slower), `setMoveFields` (start, length, speed, amplitude, `lock` off/beat/kick/snare/hat, `strength`), `snapMoveTo` (nearest or Nth kick, snare or hat), `placeOnEvery` (a move or an accent on every Nth kick or snare), `insertMove`, `swapMove`, `removeMove`, `deleteMove`, `setMoveAtBeat`, `setMoveBlend`, `setAmplitude`, `extendPhase`.
- **Automation lanes** (the amplitude envelope, 0–3 per frame scaling every move, and the camera lanes `distance`, `height`, `yaw`, `fov`): `paintEnvelope`, `drawEnvelope` (one value per frame), `setEnvelopePoints`, `setEnvelopePoint`, `removeEnvelopePoint`, `clearEnvelope`, each with `lane` (default `amplitude`); `envelopeFromAudio` (loudness, kick, snare, hat or peaks) for the amplitude envelope. A camera lane overrides its parameter where it has points (yaw adds an offset); see [recipe.md](recipe.md#camerasegments-shot-amount-lock) for which wins.
- **Camera:** `setCamera` (distance, height, fov, intensity, orbit speed), `setCameraModes` (static, orbit, pushIn, pullOut, rise, truck, lead, threeQuarter, side, chase, top, fixed, path, on a beat range), `startCameraMove` (on the Nth kick or snare), `setCameraSegment` (a block's modes, `shot`, `cut`, `amount`, `from`, `to`, `lock`, `strength`, `onHit`, `punch`; `null` clears), `moveCameraSegment`, `resizeCameraSegment` (the timeline's drags), `setCameraPath`, `clearCameraPath`.
- **Walk path:** `setRootPath` (a drawn floor path over a beat range, smoothed, steady speed; `gait` adds a walk or run block at the path's speed, `gait: "glide"` slides with no gait; points may carry a height `y`; `lock`, `strength`), `setTravelLock` (stations on each locked hit), `clearRootPath`.
- **Music-driven layer:** `addMarker`, `removeMarker`, `moveMarker`, `setMarkerAccent`, `retimePhase`, `setImpact`, `setAnticipation`, `deletePhase`, `restorePhase`, `setStepAmplitude`, `clearSteps`, `deleteStep`, `paintEnergy`, `clearEnergyCurve`.
- **Anything else:** `set` by path.

What is not a recipe command: the preview view, the export size, the export range and whether the grid is rendered are options of `render`; the character's own GLB or FBX file is browser-only.

## MCP server

```bash
node mcp/bin/motion-studio-mcp.mjs        # stdio; or: npm run mcp
```

Register it with any MCP client as a stdio server with that command (absolute path). It uses the official TypeScript SDK (`@modelcontextprotocol/sdk`, MIT). A session holds one working recipe and one analysis.

| Tool | Arguments |
| --- | --- |
| `analyse_audio` | `path`, `out?` (also writes analysis.json) |
| `load_analysis` | `path` |
| `new_recipe` | `character?` (`glider`: the Beat Path base), `clip?` (seconds, with `glider`) |
| `load_recipe`, `save_recipe` | `path` |
| `get_recipe`, `describe`, `get_script`, `list_commands`, `undo` | none |
| `apply_script` | `script` (returns the script as it now reads) |
| `apply` | `commands`: the same list as a commands.json |
| `set` | `path`, `value` |
| `render` | `out`, `audio?`, `view?`, `size?`, `start?`, `length?`, `unit?`, `grid?` |

A refused command comes back as a tool error and leaves the recipe as it was.

## Worked example

Analyse a track, put a jump on every second kick, start a camera push on the first snare, check the timeline, render.

```bash
mkdir -p out/demo && cd out/demo
node ../../scripts/drum-fixture.mjs drums.wav 120 8     # or use your own track
M() { node ../../cli/bin/motion-studio.mjs "$@"; }
M analyse drums.wav --out analysis.json
# drums.wav: 16.6 s, 120 BPM, first beat 0.093 s; 20 kicks, 16 snares, 48 hats, 36 peaks
M new --analysis analysis.json --out recipe.json
cat > commands.json <<'JSON'
[
  { "type": "placeOnEvery", "move": "jump", "target": "kick", "every": 2, "replace": true },
  { "type": "setCameraModes", "modes": ["orbit"] },
  { "type": "startCameraMove", "modes": ["pushIn"], "target": "snare", "index": 0, "lengthBeats": 4 }
]
JSON
M apply recipe.json commands.json --analysis analysis.json --out recipe.next.json
M describe recipe.next.json --analysis analysis.json
# Hit markers (10, edited): jump@0.01, jump@4.01, jump@6.52, jump@10, … (beats).
# Camera rig: …  ranges: orbit 0–1.02; pushIn 1.02–5.02; orbit 5.02–33.
M render recipe.next.json --audio drums.wav --out bundle --start 0 --length 8 --unit beats
# wrote 8 files to bundle: audio.wav, beats.json, bundle.json, camera.json, frame0.png, guide.mp4, meta.json, recipe.json
```

A jump is an accent, so `placeOnEvery` writes hit markers (the jump lands on each kick); a loop move such as `Dance_Loop` or `Walk_Loop` would become blocks starting on each kick instead. Over MCP the same three commands go to `apply` after `analyse_audio` and `new_recipe`.

The same example runs as a test: `cli/test/cli.test.ts` and `mcp/test/mcp.test.ts`.

## Worked example: directing a clip by speaking

The owner says: *"Camera follows; the character jumps and the camera moves around it; it falls and the camera goes to the top; then it follows behind."* An agent writes that as a shot script, one row per block ([grammar](recipe.md#shot-script)). There is no fall move in the library, so the agent rests the figure under the overhead shot and says so. The script is committed as `examples/scripts/follow-jump-top.txt`:

```
beats 0-8   | action: run on path lock kick 0.5 | camera: chase     | shot: wide
beats 8-10  | action: jump @snare 1            | camera: orbit 360 | shot: medium
beats 10-12 | action: rest                     | camera: top       | shot: wide
beats 12-16 | action: run                      | camera: chase     | shot: close
```

`on path` needs a walk path, so one is drawn first (by command here; in the studio, *Draw walk path*). By CLI:

```bash
cd out/demo                                              # after the example above: drums.wav, analysis.json, recipe.json
M() { node ../../cli/bin/motion-studio.mjs "$@"; }
cat > path.json <<'JSON'
[{ "type": "setRootPath", "points": [{ "x": 0, "z": 0 }, { "x": 2, "z": -3 }, { "x": 5, "z": -5 }, { "x": 8, "z": -5 }], "fromBeat": 0, "toBeat": 8 }]
JSON
M apply recipe.json path.json --out recipe.path.json
M script recipe.path.json ../../examples/scripts/follow-jump-top.txt --analysis analysis.json --out recipe.shot.json
M describe recipe.shot.json --analysis analysis.json --script
# beats 0-8   | action: run on path (0,0) (1.13,-1.86) (1.71,-2.64) … (6.06,-4.99) (8,-5) lock kick 0.5 | camera: chase | shot: wide
# beats 8-10  | action: jump @snare 1                            | camera: orbit 360 | shot: medium
# beats 10-12 | action: rest                                     | camera: top       | shot: wide
# beats 12-16 | action: run                                      | camera: chase     | shot: close
# beats 16-33 | action: rest                                     | camera: static    | shot: -
M render recipe.shot.json --audio drums.wav --out bundle-shot --start 0 --length 16 --unit beats
```

The printed script carries the walk path's points (the smoothed path, thinned to 12 points here), so it can be applied to any recipe, drawn path or not. The run block plays at the speed that matches the path (×0.91 here), its travel arrives on each kick (half stepped, strength 0.5), the jump lands on the first snare of beats 8–10, and the orbit turns exactly 360° in two beats. A word the studio does not know fails with the list it does know:

```bash
printf 'beats 0-4 | action: fall\n' > fall.txt && M script recipe.path.json fall.txt
# motion-studio script: Recipe: command 0 ("applyScript"): script line 1: unknown action "fall" for the rigged character: use one of walk, run, jog, …
```

Over MCP: `analyse_audio` (the track), `new_recipe`, `apply` with the `setRootPath` command above, then `apply_script` with the script's text; it returns the script as the recipe now reads, and `get_script` prints it again at any time. Then fine-tune by hand in the studio: load `recipe.shot.json` (*Upload*), drag the camera blocks on the Camera track, open the Distance lane and draw over the orbit, or arm a lane and record it while playing. Both routes run as tests (`cli/test/cli.test.ts`, `mcp/test/mcp.test.ts`).

## Worked example: paths without drawing

A script can give the walk path and the camera path in metres, so an agent never has to draw. `examples/scripts/glide-path.txt`:

```
beats 0-4   | action: idle                                              | camera: chase                             | shot: medium
beats 4-12  | action: glide on path (0,0) (2,0) (2,3,0.5) lock kick 0.8 | camera: chase                             | shot: wide
beats 12-16 | action: dance                                             | camera: path (6,3,1.8) (2,8,2.2) (-3,4,1.8) | shot: -
```

Points are `(x,z)` or `(x,z,height)`: x to the right, z towards the front camera, height above the floor (the glide rises half a metre on its last leg; the camera path's heights are the camera's). By CLI, on a fresh recipe:

```bash
M new --analysis analysis.json --out fresh.json
M script fresh.json ../../examples/scripts/glide-path.txt --analysis analysis.json --out glide.json
M describe glide.json --analysis analysis.json --script    # prints the same rows, points included
M render glide.json --audio drums.wav --out bundle-glide --start 0 --length 16 --unit beats
```

Over MCP the same text goes to `apply_script`, then `render`. `npm run mcp-check` does exactly that against the real server over stdio (`node mcp/bin/motion-studio-mcp.mjs`, as an MCP client starts it): `analyse_audio`, `new_recipe`, `apply_script` with this file, `render` to `out/mcp-check/bundle/` in headless Chrome (about 3–5 s for 193 frames on this machine), and checks the bundle's files.

## Worked example: voice to a Beat Path script, no page needed

Spoken: *"The character runs; the camera goes over her shoulder; she jumps and the camera rises above; she freezes mid-air while the camera circles her; she lands; the camera cranes down from high to low, then dollies in; she moves on."* An agent writes [`examples/scripts/voice-freeze-orbit.txt`](../examples/scripts/voice-freeze-orbit.txt):

```
shot subject: a dancer in an orange jumpsuit (the orange figure; white marks her front)
shot environment: a rooftop at dusk (the grey blocks are chimneys and vents)
shot action: she runs, leaps, hangs frozen mid-air while the camera circles her, lands and runs on
shot legend: the orange figure is the character; grey blocks are placeholders for the environment
beats 0-4      | action: walk on path (-7,3) (-3,1) (1,0) (5,-1) (8,-3) corners 0.8 | camera: follow behind | shot: wide
beats 4-7      | action: continue           | camera: over shoulder  | shot: wide
beats 7-8.5    | action: continue           | camera: go above       | shot: top
beats 8.5-10.5 | action: freeze, jump @beat 8.9 | camera: orbit 180 | shot: wide
beats 10.5-13  | action: continue           | camera: rise 6m to 1m  | shot: wide
beats 13-17    | action: continue           | camera: dolly in 2m    | shot: wide
```

Then, with the CLI: `motion-studio analyse track.wav --out a.json`, `motion-studio new --character glider --clip 8 --analysis a.json --out base.json`, `motion-studio script base.json examples/scripts/voice-freeze-orbit.txt --analysis a.json --out shot.json`, `motion-studio render shot.json --audio track.wav --out bundle`. Over MCP: `analyse_audio` (or `load_analysis`), `new_recipe { character: "glider", clip: 8 }`, `apply_script`, `render`. Both give the same recipe (`mcp/test/voice-freeze.test.ts`, which also checks the figure hangs in the air through the freeze, lands after it, and the camera circles meanwhile). `rise 6m to 1m` cranes down: rise takes descending heights. Commands for agents added with Beat Path: `setLandmarks`, `setScenery` ("put it in a big city": `{ "type": "setScenery", "preset": "city" }` or the script line `scenery: city`), `muteHit`, `resetMutedHits`, `setFigure` (`shape`: glider, car, flyer, runner), `setShot`; the camera grammar (`over shoulder`, `above`, `slow|even|fast`, `then`, `at 2s`) and the settings lines are in [recipe.md](recipe.md#shot-script).

