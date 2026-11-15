---
tags: [beat-path, agents, onboarding, motion-studio]
summary: The first file to open for the Beat Path page - what it is for, how to run and check it, which file owns each control, the state model, the rules a change must keep, and how to add something small.
---

# Beat Path for developers and agents

Beat Path is a one-screen page in this repo: **draw a path on the map, set it to music, generate a video.** You draw where the subject travels, the movement and the camera lock to the beat of a track, and the page renders a guide clip (a plain orange figure among grey blocks) that a video model follows when it makes the real shot.

What a user sees and does is in the [README](../README.md#beat-path-start-here). The design system and the log of UI rounds are in [design.md](design.md), the shot script grammar in [recipe.md](recipe.md#shot-script), the CLI and the MCP server in [agents.md](agents.md), the static build in [deploy.md](deploy.md), the models' limits in [models.md](models.md). This file does not repeat them.

## Run it and see it

```bash
nvm use && npm install     # Node 24 (.nvmrc)
npm run dev                # then open http://127.0.0.1:5180/path.html
```

`/` on the same server is the full studio, a different page; Beat Path is `path.html`. If port 5180 is taken, Vite moves to the next free port and prints it. `?theme=runware` switches to the Runware look. The page opens on Example 1 with its own generated music: press Play, or click the picture.

**No key and no charge in development.** While `npm run dev` serves the page (or with `?fake=1` on any build), Generate uses a local fake provider (`fakeFetch` in `arena.ts`) as long as no Runware key is connected. It answers the Runware API locally and hands back the guide itself as the "result", so the whole flow (cost question, progress, the output beside the preview, Runs, the gallery) can be tried with nothing sent and nothing charged. **Connecting a real key switches the fake off, in development too:** from then on Generate is a paid call. Do not connect one unless the owner has approved the spend (see [plan.md](plan.md#agent-rules) and [costs.md](costs.md)).

The Model Arena embed that draws the key panel and runs the generation is vendored and committed in `packages/studio/public/vendor/model-arena/`. Do not edit it here; `npm run vendor:arena` copies a new version from the sibling repository.

## Check a change

| Command | What it proves | Time on the owner's machine (15 Nov 2026) |
| --- | --- | --- |
| `npm run check` | TypeScript in core, studio, CLI and MCP; ESLint; every vitest unit test (the page's pure parts: script round trips, lane cuts and moves, the cost dialog queue, the run log, result playback, Slice) | about 30 s |
| `node scripts/smoke-beat-path.mjs` | The Beat Path page alone in headless Chrome against its own dev server: drawing, locks, lane menus and drags, examples, the guide export validated against the schema, Slice and Export, Generate with the fake provider (cancel, Stop, a switch refused during the render, two questions in turn), the gallery; any console error or warning fails it | 1 min 45 s |
| `npm run smoke` | The studio first, then the same Beat Path step | about 2 min on a quiet machine |

Both smoke commands need Google Chrome (or `CHROME_PATH`) and write screenshots to `out/`. The times grow when the machine is busy; the clip-rendering steps are the slow part.

The smoke scripts find most controls by element id, so renaming a button's text does not break them. A few lane-menu items are found by their visible text (`git grep -n "has-text" scripts`), and some steps match status messages (for example "Sliced to" after Slice): change those words and update the script in the same commit.

## Where things live

All paths below are in `packages/studio/src/beat-path/` unless they say otherwise. The page's markup, every element id and every button label are in one file, `layout.ts`.

| What the user sees | File | Responsible for |
| --- | --- | --- |
| The whole page | `main.ts`, `page.ts` | Entry and theme; `page.ts` holds the state, undo, the rebuild, the clock and the example switcher |
| Buttons, menus, keyboard | `page-actions.ts` | Binds Settings, the lane menus and lock chips, the shot fields, Download guide, every keyboard shortcut |
| The map and its tools | `map.ts` | The canvas: Top and Side views, the pen (draw, click points, drag, Escape), live markers |
| Picking several points, Smooth | `map-select.ts` | Box and whole-path selection, moving a group, the stroke simplifier, `smoothPoints` |
| The Blocks tool | `map-blocks.ts` | Scenery boxes: select, move, resize, draw, duplicate, copy and paste |
| Dragging a follow camera | `map-follow.ts`, `page-follow.ts` | The follow block's offset from a drag on the map, and the Left/Right, Dist, Height, Angle fields |
| The Character and Camera lanes | `lanes.ts`, `lane-cuts.ts` | Blocks, edge drags, body drags and the block menu (`lanes.ts`); split, move and "Moves on hits" as pure functions (`lane-cuts.ts`) |
| The music strip | `strip.ts` | The clip's waveform, beat grid, kick/snare/hat ticks; click to seek or mute a hit, Alt-click to add a marker |
| The track overview and slicer | `overview.ts`, `page-slice.ts`, `track-cut.ts` | The whole-track window, its typed start, your markers, Sensitivity, and the Slice and Export buttons (`page-slice.ts`); the sample maths and the WAV (`track-cut.ts`) |
| Example music | `tracks.ts`, `examples.ts` | Which generated groove each example plays; the three examples, read from `examples/scripts/beat-path-ex*.txt` |
| The preview | `../viewport.ts`, `../characters/glider.ts` | The shared Three.js viewport and the figure shapes |
| Download guide (.zip) and the in-memory guide | `page-actions.ts`, `page-generate.ts`, `recipe-map.ts`, `../export/bundle.ts` | The zip export button; `exportGuideInMemory()` for Generate; `exportRange`; the bundle builder |
| Settings › Setup: Save (.json), Load file…, Folder… | `page-setup.ts`, `setup-file.ts`, `setup-source.ts`, `page.ts` (`loadSetup`) | The buttons (`page-setup.ts`); the file format and its reader (`setup-file.ts`); finding setup.json in a zip or folder, and the music a setup brings (`setup-source.ts`) |
| Shot fields, model, Generate | `page-generate.ts`, `generate.ts` | The run: guide render, cost question, progress, result (`page-generate.ts`); the models, the 3 USD limit, clip limits per model and error wording (`generate.ts`) |
| The cost question | `cost-dialog.ts` | One question at a time; Stop answers it; a held key or a click in the first 300 ms never confirms |
| The key panel and the embed | `arena.ts` | Loads the vendored embed; the fake provider |
| The result player | `result-sync.ts`, `result-fetch.ts` | The clip plays from a copy in the tab and follows the page's clock; one download per file |
| Runs and saved files | `page-history.ts`, `run-log.ts`, `run-assets.ts` | The Runs list in the header; the log in `localStorage` (`beatPath.runs`, 40 entries); copies of finished files in Cache Storage, retried |
| Reference images | `page-refs.ts`, `ref-store.ts`, `page-image.ts`, `image-panel.ts` | The Character and Environment drops, "Use as reference", and generating a reference with an image model |
| The gallery | `gallery.ts` | One row per example plus "Your runs" (those rows are held in memory only and are gone after a reload; Runs keeps the history) |
| The shot script | `script.ts`, `recipe-map.ts` | `toScript` and `fromScript` between the page state and the script; the state to a recipe |
| Name, styles | `name.ts`, `beat-path.css`, `ui/components.css`, `themes/` | The page name; layout; components; the two themes ([design.md](design.md)) |

The engine is `packages/core` (the recipe, the shot script grammar in `shot-script.ts`, camera rig, `beatPathBase` in `beat-path.ts`, the glider's smoothed heading and lean in `glide-heading.ts`). The page imports it and never changes it.

## The state model

- **The page state is a shot script.** `page.ts` holds one `BeatPathState` (its type is in `script.ts`): the clip length, the subject and camera paths, the two lanes, the locks, markers and muted hits, the slice, figure, scenery and shot description.
- **An edit becomes a recipe** in one way: `update(next, final)` stores the new state and schedules `rebuild()`, which calls `beatPathRecipe` (`recipe-map.ts`): `toScript(state)` applied with the core's `applyScript` command on top of `beatPathBase`. The CLI (`new --character glider`, then `script`) and the MCP server (`new_recipe`, then `apply_script`) run the same two steps, so an agent that writes the script gets the page's recipe without the page (tested in `mcp/test/beat-path-parity.test.ts`). The script is never shown on the page; in development `window.__beatPath.script()` prints it.
- **Undo lives in `page.ts`**: `past` and `future` lists of whole states, 200 steps. A drag calls `update(next, false)` while it moves and `update(next, true)` once at the end, so a whole drag is one step. Switching examples clears the history (each example keeps its own state). Slice and loading a track are not undo steps; Slice moves every state in the history onto the cut.
- **`busy` is true while a guide renders** into the shared viewport, for Generate or for Download guide. While it is set, `update`, `undo`, `setSelection`, `switchSlot`, `useFile`, `removeTrack` and `useCut` are refused with "The guide is rendering…", a rebuild waits until the render ends, playback will not start, and the three shot fields are disabled. After the render, during the upload and the wait, editing is allowed again: the run already holds its guide, model and shot.

## The setup file

The whole page (paths, lanes, locks, markers, slice, figure, scenery, boxes, shot description) as one JSON file, so a rough draft can be saved and loaded back. **Settings › Setup** has three controls: **Save (.json)** downloads `draw-control-setup.json` at once (no render); **Load file…** takes a setup `.json` or a downloaded guide `.zip`; **Folder…** takes an unzipped guide's folder. Every guide zip from **Download guide** carries the same file as `setup.json`, beside the guide's files. It is not listed in `bundle.json`: that manifest follows the pinned guide schema (`schema/guide-bundle.schema.json`, `additionalProperties: false`), which model-arena owns.

```json
{
  "kind": "beat-path-setup", "version": 1, "saved": "2026-11-15T10:00:00.000Z",
  "music": { "name": "song.mp3", "licence": "unspecified", "bpm": 128, "offsetSeconds": 0.32, "lengthSeconds": 201.4 },
  "state": { "clip": 8, "subject": [{ "x": -6, "z": 3 }], "character": [{ "from": 0, "to": 17, "word": "glide" }], "…": "the whole BeatPathState" },
  "script": "# clip: 8 s · …\nbeats 0-17 | action: walk on path … | camera: follow behind\n"
}
```

- **`state` is what loads**; `script` (`toScript(state)`) is for people and agents, and the CLI's `script` command takes the setup file in place of a script. `music` says what the lanes were timed to (`null`: no track).
- **The reader never throws** (`readSetup` in `setup-file.ts`). Not JSON, another `kind`, a newer `version` or no `state` is refused with a sentence. Anything else is read field by field: a field it cannot use keeps the blank page's value (`BLANK_STATE`), values are clamped as the page clamps them (clip 3 to 30 s, points within ±60 m and 16 to a path, boxes as the recipe takes them, follow offsets to `FOLLOW_LIMITS`), lists are capped, and the status line says what was dropped. Last, the state must build a recipe; a typed camera direction the engine refuses is dropped with a note.
- **Loading is one undo step** (`loadSetup` in `page.ts`, through `update`), into the example slot showing, framed on the map, refused while a guide renders. The music it brings (`planMusic` in `setup-source.ts`): an example's own music comes back with the example; from a guide zip or folder, its `audio.wav` (the music in the clip window) becomes the track as a cut, as Slice makes one, with the markers moved onto it; the user's own file is kept if it is the one loaded (same name, tempo and length), otherwise the page has no track and says "load it again". Loading that file again (Your track, or a drop) brings back the setup's slice and markers, and its lanes if they were not edited meanwhile. Loading the music is not part of the undo step, as with any track.
- The smoke step is `scripts/smoke-beat-path-setup.mjs`; the unit tests are `packages/studio/test/beat-path-setup.test.ts`.

## Rules a change must keep

| Rule | Why | Guarded by |
| --- | --- | --- |
| No paid call before the cost question is answered OK | Every run spends the visitor's money. The embed checks the estimate against `MAX_PRICE` (3 USD, `generate.ts`), then calls the page's `confirm`, and only after OK sends anything | `beat-path-cost-dialog.test.ts`; the smoke's Generate passes (Escape cancels, two questions in turn) |
| Never store or log the Runware key | It is the visitor's credential. The key lives in the embed's key panel (`<arena-key>`); the page hands that element to the embed's generate calls and reads the key itself only to ask Runware about a logged run (`checkRun` in `run-log.ts`); the run log stores ids, links, costs and times, never the key or the prompt; the page code has no console logging | `beat-path-runs.test.ts` checks the stored log holds neither |
| One video run at a time | A second click must not start a second paid run. While a run is going the Generate button is Stop (`running` in `page-generate.ts`). The image panel's runs are separate and their questions queue behind the same dialog | The smoke's paid-run pass |
| No edits, switches or new tracks while the guide renders | The render reads the rig, figure and scenery between frames; an edit then would send a guide made of two shots | `refused()` in `page.ts`; the smoke checks a switch during the render is refused and the run keeps Example 1's shot |
| A stopped or timed-out run says whether it was submitted | Once Runware has the task it may still finish and bill; the reader must not send it twice | `runErrorText` in `generate.ts`, `beat-path-run-errors.test.ts` |
| The run log never drops a paid run still processing | Its task id is the only way to fetch its result | `trimRuns` in `run-log.ts`, `beat-path-runs.test.ts` |
| Lanes tile from beat 0 to the clip's end, no gaps or overlaps, each block at least one beat | The script turns block edges into rows; a gap or overlap would not print as the lanes show | `fitLanes` (`script.ts`), `moveBlock` and `splitBlockAt` (`lane-cuts.ts`); `beat-path.test.ts`, `beat-path-lane-cuts.test.ts`, `beat-path-lane-move.test.ts`; the smoke's lane drag |
| A lane edit the engine refuses is said, not stored | The camera holds at most 32 ranges; a split or "Moves on hits" past that gets a plain "Not applied" | `refusal()` in `page-actions.ts` |
| Every element id in the markup is unique | `$()` returns the first match, so a repeated id silently rewires another control | `beat-path-layout.test.ts` |
| A model gets only the guide video, the reference images and the prompt from the shot description | Coordinates, lock words and amounts mean nothing to a model and leak the script | Built in `exportGuideInMemory` and the run in `page-generate.ts`; the smoke checks the prompt sent carries the shot's words. No test checks that nothing else is sent |

House conventions: aim for at most 500 lines per file and split by topic before one grows (the "Split from page.ts" notes at the top of several files are that; `map.ts` is already 519, so do not add to it). Nothing enforces this in tooling. UK English in docs. No paid call without the owner's approval; a real run is a row in [costs.md](costs.md), a platform problem a row in [friction.md](friction.md). Commit messages follow `git log` (`docs: …`, `fix(beat-path): …`, `feat(core): …`).

## How to add something small

**Change a button's label (for example Slice).** The text and its tooltip are in `layout.ts` (`id="sliceTrack"`, inside `.track-acts`). The status line it writes afterwards ("Sliced to …") is in `page-slice.ts`. Then `npm run check` and `node scripts/smoke-beat-path.mjs`; the smoke clicks `#sliceTrack` by id but matches "Sliced to" in the status.

**Add a button to the track panel** (the box under Sensitivity, beside Slice and Export):
1. `layout.ts`: a `<button type="button" id="…" class="btn outline tip-end" data-tip="…">` in `.track-acts`, with an icon from `ui/icons.ts` if it needs one (`icon("download")`). Pick an id no other element has.
2. `page-slice.ts`, in `bindSlice`: set its `onclick` beside `sliceButton` and `exportButton`, and its `disabled` state in `sync()`, which runs after every rebuild.
3. If it changes the page state, go through `p.update(...)`: that makes it one undo step and refuses it while a guide renders. Anything that replaces the track goes through `p.useCut`, which refuses on its own.
4. Add a unit test beside `packages/studio/test/beat-path-track-cut.test.ts` for any pure part, and a step in `smokeTrackActions` (`scripts/smoke-beat-path.mjs`) if it downloads or changes the track.

**Add a camera move to the Camera lane** (a new lane word, for a move the core's script grammar already has; a new kind of camera move is first a core change in `packages/core/src/shot-script.ts` and the rig):
1. `script.ts`: add the word to `CAMERA_WORDS` and to `LABELS.camera`; in `toScript`, the camera words' text (the object with `behind`, `side`, `orbit`, …) and the `shot` it prints; in `fromScript`, the test that reads that text back to the word.
2. `page.ts`: add it to the list passed to `lane<CameraWord>("laneCamera", …)`, which is what the block menu offers.
3. `page-actions.ts`: its sentence in `CAMERA_NOTES`, and `wordOf` if a typed phrase should read as it.
4. `lane-cuts.ts`: its plain names in `ALIASES` (used by "Moves on hits"), and the list in `parseMoves`'s error message.
5. `beat-path.css`: the `.block.w-<word>` colour rule.
6. `packages/studio/test/beat-path.test.ts`: extend "camera words map to rig modes" and the round trip.

`npm run check` fails if `LABELS.camera` or `CAMERA_NOTES` lacks the new word (both are typed as a record over the word type); nothing checks the other places, so trace each one.

## Deliberately not there

Keep the page simple: draw, set to music, generate. These were left out or taken out on purpose; do not add them back without the owner asking.
- **No move palette.** The studio has a library of moves to place; the Character lane has five words (glide, hover, spin, jump, freeze) and the Camera lane six.
- **No second layer on the drawing.** The map edits one path at a time; there is no extra path, overlay or follower figure.
- **No script on the page.** The shot script is for agents and files (CLI, MCP, `examples/scripts/`); its copy and paste, its file drop and the link to the full studio were removed.
- **No Generate keyboard shortcut, no big Play overlay, no Runware logo or wordmark** ([design.md](design.md)).
- **No server.** The page is static files ([deploy.md](deploy.md)); generation runs in the visitor's browser with their own key.
