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
| `new [--character rigged\|mannequin\|block] [--analysis a.json] --out recipe.json` | A starting recipe (the rigged mannequin dancing), fitted to the track's tempo and length. |
| `apply <recipe.json> <commands.json> [--analysis a.json] [--out next.json]` | Apply a list of commands in order. All or nothing: a refused command names its index and the reason. |
| `set <recipe.json> <path> <value> [--out next.json]` | Set any recipe field by path: `beatGrid.bpm 98`, `moves#Dance_Loop-4.speed 2`, `moves[0].phases[0].amplitude 2.5`, `camera.distance 5`, `reactive.amplitude 1`. The value is JSON when it parses, text otherwise; `null` deletes the field. |
| `describe <recipe.json> [--analysis a.json]` | The timeline as text: move blocks with start, end, speed and amplitude, rests, hit markers, the camera ranges and paths, the walk path, the envelope, and the kicks, snares and hats in beats. |
| `render <recipe.json> [--audio track.wav] --out bundle/` | The guide bundle, rendered in headless Chrome through the studio (as `npm run smoke` does). Options: `--view rig\|front\|side\|top\|orbit\|iso` (default: `rig` when the recipe has a camera rig), `--size 1280x720`, `--start 8 --length 8 --unit beats\|seconds`, `--grid` (render the ground grid). Needs Google Chrome (or `CHROME_PATH`). |
| `commands` | Every command type with its arguments. |

Without `--analysis`, commands that read the music (kicks, snares, the loudness) fail with a clear message.

### Commands, by area

Run `npm run cli -- commands` for the full list with arguments. In short:

- **Blocks on the move track:** `moveMoveTo`, `resizeMove` (an edge; a longer block plays slower), `setMoveFields` (start, length, speed, amplitude), `snapMoveTo` (nearest or Nth kick, snare or hat), `placeOnEvery` (a move or an accent on every Nth kick or snare), `insertMove`, `swapMove`, `removeMove`, `deleteMove`, `setMoveAtBeat`, `setMoveBlend`, `setAmplitude`, `extendPhase`.
- **Amplitude envelope** (0–3 per frame, scaling every move): `paintEnvelope`, `drawEnvelope` (one value per frame), `setEnvelopePoints`, `setEnvelopePoint`, `removeEnvelopePoint`, `envelopeFromAudio` (loudness, kick, snare, hat or peaks), `clearEnvelope`.
- **Camera:** `setCamera` (distance, height, fov, intensity, orbit speed), `setCameraModes` (static, orbit, pushIn, pullOut, rise, lead, threeQuarter, side, chase, top, fixed, path, on a beat range), `startCameraMove` (on the Nth kick or snare), `setCameraPath`, `clearCameraPath`.
- **Walk path:** `setRootPath` (a drawn floor path over a beat range, smoothed, steady speed, facing along it; `gait` adds a walk or run block), `clearRootPath`.
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
| `new_recipe` | `character?` |
| `load_recipe`, `save_recipe` | `path` |
| `get_recipe`, `describe`, `list_commands`, `undo` | none |
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
