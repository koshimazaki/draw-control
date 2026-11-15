---
tags: [beat-path, agents, onboarding, motion-studio]
summary: The first file to open for the Draw Control page - what it is for, how to run and check it, which file owns each control, the state model, the rules a change must keep, and how to add something small.
---

# Draw Control for developers and agents

Draw Control is a one-screen page in this repo, "draw control of camera and character": **draw a path on the map, set it to music, generate a video.** You draw where the subject travels, the movement and the camera lock to the beat of a track, and the page renders a guide clip (a plain orange figure among grey blocks) that a video model follows when it makes the real shot.

What a user sees and does is in the [README](../README.md#draw-control-start-here). The design system and the log of UI rounds are in [design.md](design.md), the shot script grammar in [recipe.md](recipe.md#shot-script), the CLI and the MCP server in [agents.md](agents.md), the static build in [deploy.md](deploy.md), the models' limits in [models.md](models.md). This file does not repeat them.

The page was first called Beat Path, and the code keeps that name: the folder `packages/studio/src/beat-path/`, the `beat-path` build mode and npm scripts, the CSS classes, the TypeScript symbols (`BeatPathState`, `beatPathBase`), the Hermes profile and the skill (`beat-path`), and this file's name. Only what a user reads says Draw Control.

## Run it and see it

```bash
nvm use && npm install     # Node 24 (.nvmrc)
npm run dev                # then open http://127.0.0.1:5180/path.html
```

`/` on the same server is the full studio, a different page; Draw Control is `path.html`. If port 5180 is taken, Vite moves to the next free port and prints it. It opens in the Runware look (green accent, light grey map); `?theme=neutral` switches to the neutral palette. The page opens on Example 1 with its own music, the owner's loop (`public/tracks/neon-rain-loop.mp3`): press Play, or click the picture.

**No key and no charge in development.** While `npm run dev` serves the page (or with `?fake=1` on any build), Generate uses a local fake provider (`fakeFetch` in `arena.ts`) as long as no Runware key is connected. It answers the Runware API locally and hands back the guide itself as the "result", so the whole flow (cost question, progress, the output beside the preview, Runs, the gallery) can be tried with nothing sent and nothing charged. **Connecting a real key switches the fake off, in development too:** from then on Generate is a paid call. Do not connect one unless the owner has approved the spend (see [plan.md](plan.md#agent-rules) and [costs.md](costs.md)).

The Model Arena embed that draws the key panel and runs the generation is vendored and committed in `packages/studio/public/vendor/model-arena/`. Do not edit it here; `npm run vendor:arena` copies a new version from the sibling repository.

## Check a change

| Command | What it proves | Time on the owner's machine (15 Nov 2026) |
| --- | --- | --- |
| `npm run check` | TypeScript in core, studio, CLI and MCP; ESLint; every vitest unit test (the page's pure parts: script round trips, lane cuts and moves, the cost dialog queue, the run log, result playback, Slice) | about 30 s |
| `node scripts/smoke-beat-path.mjs` | The Draw Control page alone in headless Chrome against its own dev server: drawing, locks, lane menus and drags, examples, the guide export validated against the schema, Slice and Export, slicing again for a loop (8 s, then 4 s), zoom before and after slicing, the playhead clicked and dragged, Generate with the fake provider (cancel, Stop, a switch refused during the render, two questions in turn), the gallery; any console error or warning fails it | 1 min 45 s |
| `npm run smoke` | The studio first, then the same Draw Control step | about 2 min on a quiet machine |

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
| The music strip | `strip.ts` | The clip's waveform, beat grid, kick/snare/hat ticks; click or drag to seek (the playhead line grabs over a hit), click a hit to mute it, Alt-click to add a marker |
| The playhead over the lanes | `playhead.ts` | The playhead line across both lanes; a click or drag on a lane's empty space seeks |
| The track overview and slicer | `overview.ts`, `page-slice.ts`, `track-cut.ts` | The whole-track window (move it, resize it by a bracket, zoom with the timeline), its typed start, your markers, Sensitivity, and the Slice and Export buttons; when the overview shows and Slice cuts (`page-slice.ts`); the sample maths and the WAV (`track-cut.ts`) |
| Example music | `tracks.ts`, `examples.ts`, `example-music.ts` | Which music each example plays: Example 1 the file `public/tracks/neon-rain-loop.mp3`, the owner's loop (glitchcandies, made with Suno, used with permission; its comment reads `# track: file neon-rain-loop.mp3`), Example 2 the file `public/tracks/drum-n-bass.mp3`, the owner's drum and bass loop (used with permission; 11.04 s, eight bars at 174 BPM, `# track: file drum-n-bass.mp3`), Examples 3 and 4 a generated groove (they share the laidback groove at 8 and 6 bars, so the `# track:` comment reads `laidback 6 bars` for Example 4). A file entry may give its beat grid (`grid`): Example 1's is 107.5 BPM with beat 0 at the file's start, so the guide starts where the music does (the finish step needs that; the analysis puts the first beat at 0.081 s). Every track is decoded at 44.1 kHz (`DECODE_RATE` in `audio.ts`), as the CLI does: the analysis is not rate-independent (this loop reads 122.9 BPM at 48 kHz and loses five kicks; `cli/test/music-rate.test.ts`). If the file cannot load, the page and the Gallery play the generated groove under its own name, licence and tempo (`generated-straight-120.wav`, MIT, 120 BPM; the lanes refit to it), and the status says so. Example 2's loop reads 69.7 BPM to the tempo estimate, which nothing in it plays: its kicks and snares sit within 15 ms of a 174 BPM half-beat grid (32 beats in the file), so its `grid` is 174 BPM from the file's start. Examples 1 and 2 hold on no hit (no camera or travel lock): hit response is the Sensitivity control's. Its one reaction is written as blocks, not a lock: a closer three-quarter block over beats 6–7 zooms in on the kick at 3.43 s (beat 6.15) as the ship passes between the first pair of towers, and the next block eases back out (a lock would be the lane's, on every block). Example 1's clip is 14 s and its music 13.488 s: playback runs on in silence for the last half second and wraps at 14 s, the guide's audio has the same silent tail, and Seedance 2.5 is refused at 14 s by the page's 3 USD limit (Kling 4.0 and MiniMax H3 take it). The editor and the Gallery both load the file (`example-music.ts`). The four examples are read from `examples/scripts/beat-path-ex*.txt`. An example that opens in its own view (Example 4, isometric) sets the rig with the script's `rig:` line, carried in the state as `rig` (no Settings control yet) |
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

## Slicing a loop, zoom and the playhead

- **The overview** (the whole-track strip above the music strip) shows whenever a track longer than the shortest clip (3 s, plus half a second) is loaded, sliced or not (`overviewShows` in `page-slice.ts`). Its bracketed window is the clip: drag its middle to move it (snapped to the beat with Snap on), drag either bracket to change its length like a loop region. The length is whole seconds, 3 s at least, at most the rest of the track (and 30 s), the other end held (`resizeWindow`). A resize sets `state.clip`, the same value as the Settings clip fader, refits the lanes and is one undo step per drag.
- **Slice cuts only a window shorter than the track** (`sliceable`: the track runs more than half a second past the window). Right after a slice the track is the clip, the window covers all of it, and Slice only says "Nothing to slice": drag a bracket inward and Slice again, as often as you like, for a loop. Every slice moves the state and the whole undo history onto the cut (`moveOntoCut`), refits the lanes (`fitLanes`) and says the new length ("Sliced to 4 s"). A loop is whole seconds, so the recipe, the export range (`exportRange`: 97 frames for 4 s), the guide's audio and the clip Generate sends are that length. Undo across a slice stays on the cut track: a step from before a resize can bring back a longer clip than the loop, which then runs past the music's end (silence), until the window is resized again.
- **Timeline zoom** (+/− beside Music, or Cmd/Ctrl-scroll over the timeline or the overview, one step per gesture) stretches the music strip and both lanes 1× to 8×, and zooms the overview with it, its window kept in view (a sideways or Shift-scroll pans the overview when zoomed). On a long track the overview is what shows the whole music, so it zooms too: at 1× a three-minute track gives a second about 4 px.
- **The playhead moves by hand**: click or drag on the music strip (the playhead line itself grabs even over a detected hit; elsewhere a click on a hit still switches it off, Alt-click still adds a marker, your marker still drags), on a lane's empty space, or on the playhead line in the overview. Every move goes through the page's one clock (`seek` in `page.ts`), so the audio, the preview, the map's figure and a result video follow it, playing or paused; playing carries on from there, and the clock stays inside the clip window while it loops. Left and Right step it a frame when paused (Shift: a beat).

## Finishing a generated clip

Example 1's guide and generation run 14 s; its music is 13.488 s, so the guide's last half second is silent. Example 2 runs 12 s on 11.04 s of music. After a model has made the clip (offline, not in the page):

```bash
npm run finish -- ~/Downloads/kling-take.mp4 packages/studio/public/tracks/neon-rain-loop.mp3 --out out/finished.mp4
# video 14.042 s, audio 13.488 s → out/finished.mp4: video 13.500 s, audio 13.488 s
npm run finish -- ~/Downloads/runner-take.mp4 packages/studio/public/tracks/drum-n-bass.mp3 --out out/runner.mp4
# video 12.042 s, audio 11.040 s → out/runner.mp4: video 11.042 s, audio 11.040 s
```

`scripts/finish-clip.mjs` lays the original audio over the video and cuts the video to the audio's length. It re-encodes the video (H.264, CRF 16, `--crf` to change) so the cut lands on a frame rather than the next keyframe a stream copy would need; the result is within one frame of the music (13.500 s of video at 24 fps for 13.488 s of audio). Beat 0 of Example 1 is the file's start (its `grid` in `tracks.ts`), so frame 0 of the clip and the start of the music line up with no offset. Both inputs must be local files; it needs ffmpeg and ffprobe.

## One guide, three subjects (Example 2)

Example 2 (`examples/scripts/beat-path-ex2-runner.txt`) is one street guide made to serve any travelling subject, so one guide can be cut into a video of three looks: a realistic runner, then an anime skater, then a forklift in a factory. Only the shot description and the references change; the path, the camera, the timing and the music stay.

What makes it work for a person and a vehicle alike:
- **A neutral, person-sized figure** (the runner shape: an upright capsule 1.55 m tall with a white chest marker). It reads as a runner or a skater, and as a forklift's upright mast and cab; a car shape would push a model towards a vehicle in the two people versions.
- **One steady travelling path**: a straight line down the street at 4 m/s, no turn, trick or travel lock, a speed a runner, a skater and a forklift can all hold. One small **hop** (0.28 m) lands on the kick at 6.636 s (beat 19.24) while the travel runs on, in the gap between the first two blocks, so it is seen; each action line names it (a hop over a puddle, an ollie, a bump over a floor plate). It is the Character lane's **Hop** block (beats 19–35; the script row `continue, jump @kick 1`): a small jump on the first kick of the block's first row, without ending the glide. With no kick in the row (none there, or before the track is analysed) it lands on the row's start; that rule is the core's (`applyScript`), so the CLI and MCP land it the same, and `describe` with the hits marks it `(on no hit)`. A row written with another anchor (`continue, jump @beat 19.5`, `@snare 2`) reads as Hop and keeps that anchor (the block's `at`), so it prints back where it was.
- **Three camera blocks, each starting on a hit, unbroken between them** (no `lock … hold`): low and close on the feet on the first kick (`follow side distance 2.5m height 0.3m aim 0.3m fov 32`: the shoe, the board, the wheel); a pull back alongside as the subject passes behind the row of blocks and shows through the gaps, on the snare at beat 9 (`follow side height 1.6m aim 1m fov 36 + pull out to 13m`); a rise to a high three-quarter view of the whole street (the factory floor), on the snare at beat 21 (`three-quarter distance 13m aim 1m fov 42 + rise to 8m`), held to the end. The two later moves ease over their whole block, so nothing jumps at 174 BPM, where an offset's one-beat ease is only 0.34 s.
- **The blocks are generic**: three low blocks between camera and subject (shopfronts, cafés, the factory's pillars and machines) and a row of tall ones beyond it (buildings across the street, the factory wall).

The runner is the example's default shot. The other two, ready to paste over the three shot lines (the Subject, Environment and Action fields under the preview on the page, or the script); the legend line stays, the page builds it from the figure's colours:

```
# Anime skater
shot subject: an anime-style skateboarder in a loose hoodie and sneakers, drawn with clean outlines and flat colours (the orange figure; white marks the chest)
shot environment: an anime city street in the afternoon, shops and cafés along the pavement, cel-shaded, soft sky
shot action: close on the skateboard's wheels and deck as they push along, then alongside them as they pass behind the shopfronts and show through the gaps, an ollie in a gap, then a high view of the whole street

# Factory forklift
shot subject: an industrial forklift carrying a pallet, yellow and black (the orange figure; white marks its front)
shot environment: a car factory floor, the grey blocks are its steel pillars and machines, car bodies on the line, robot arms, overhead lights
shot action: close on its front wheel as it drives along, then alongside it as it passes behind the factory pillars and between the stations, a bump over a floor plate in a gap, then a high view of the whole factory floor
```

The same lines are comments at the top of the script. Give each subject its own character and environment references; the guide is the same file for all three. After each generation, `npm run finish` (above) trims the 12 s clip to the music's 11.04 s.

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
- **The reader never throws** (`readSetup` in `setup-file.ts`). Not JSON, another `kind`, a newer `version` or no `state` is refused with a sentence. Anything else is read field by field: a field it cannot use keeps the blank page's value (`BLANK_STATE`), values are clamped as the page and the recipe take them (clip 3 to 30 s; points within ±60 m and 16 to a path, the subject's height 0–30 m and the camera's to `CAMERA_MAX_HEIGHT`; boxes as `recipe.ts` takes them; the camera lane to the rig's 32 ranges, the status line counting the blocks dropped and their typed directions, the last block kept running to the end; follow offsets to `FOLLOW_LIMITS`; at most 512 switched-off hits, rounded to the millisecond and each once, and 512 markers; shot fields one line of 300 characters without links or `<>{}\`), and the status line says what was changed or dropped. A value past a limit is never a reason to refuse the whole file. Last, the state must build a recipe (`readSetup(text, ctx)`; the page passes no track's hits, so the answer never depends on whatever track happens to be loaded). "Next move on each hit" anchors camera blocks on hits, so without its track it cannot resolve; that never refuses the file: the state keeps it, and the page decides after loading its music. A typed camera direction the engine refuses is dropped with a note.
- **A zip is read in two passes** (`fromZip` in `setup-source.ts`), because the unzipper allocates each accepted entry at the size it declares: the first lists the entries and decompresses none (more than 1000 is refused), the second decompresses only the shallowest `setup.json` and the `audio.wav` beside it, each within its cap (2 MB, 60 MB). Before any of that, a picked file is refused on its size, unread: a `.json` over 2 MB, a zip over 62 MB (the two caps together, which also holds a 30 s guide video); a folder's setup.json the same.
- **A shot that does not build is never exported.** When the state's recipe does not build (`rebuild` in `page.ts`; for a setup, typically Next move on each hit without its track), the page keeps showing the last recipe that built and records why in `p.unbuilt`, cleared by the next build. Until then Download guide, Generate and `exportGuideInMemory` refuse up front, before the cost question, the render or any request, with "The shot is not built yet: <reason>. Load its track, or turn off Next move on each hit" (`shotRefusal` in `page-setup.ts`); a load that leaves the page so says that first, ahead of "Loaded the setup". Image generation does not use the guide, so it is not affected.
- **The page, not the music, is one undo step** (`loadSetup` in `page.ts`, through `update`): loading goes into the example slot showing, framed on the map, refused while a guide renders. When the load changed the music, the status line says "Undo puts back the page, not the music". Undo also forgets a pending "load your track again". The music it brings (`planMusic` in `setup-source.ts`): an example's own music comes back with the example; from a guide zip or folder, its `audio.wav` (the music in the clip window) becomes the track as a cut, as Slice makes one, with the markers moved onto it; the user's own file is kept if it is the one loaded (same name, tempo and length), otherwise the page has no track and says "load it again". Loading that file again (Your track, or a drop) brings back the setup's slice and markers, and its lanes if they were not edited meanwhile. A guide audio that cannot be decoded leaves the setup on the music already loaded, its lanes fitted to it, and its slice cleared if the clip would run past that music's end, and says so. Older undo steps are not moved onto a guide-audio cut (Slice moves them, since they shared its track; steps from before a load belong to the music that was loaded then).
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
