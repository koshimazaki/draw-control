---
name: draw-control-example
description: Make a new Draw Control example (or any shot) from a plain-language brief - subject, path, blocks, camera views and transitions on the music - through the motion-studio CLI, verified by render. Use when asked to create, add or modify an example, a template or a shot, or to place the camera in a view (isometric, top, side, behind, front) and move between views smoothly.
license: MIT
compatibility: Node 24; the motion-studio CLI (cli/bin/motion-studio.mjs) or MCP server; ffmpeg for contact sheets
metadata:
  repo: motion-studio
  version: 0.2.0
---

# Making a Draw Control example

A shot is a **shot script**: settings lines plus one row per block. You write it, apply it to
a base recipe, read it back, render the guide, and **look at the frames**. Follow the steps in
order; every trap below cost a real render once.

Grammar: `docs/recipe.md#shot-script` (rows, camera words, and every settings line: `rig:`, `box:`,
`scenery:`, `figure:`, `shot …:`). Working examples: `examples/scripts/beat-path-ex*.txt`;
`beat-path-ex4-drone.txt` is the worked answer to an isometric → pan → top → side brief;
`beat-path-ex2-runner.txt` to "one guide for a runner, a skater and a forklift" (step 8).

## 0. Setup

- Work in a git worktree with its **own** `npm ci`. Never symlink `node_modules` from another
  checkout: `@motion-studio/core` would resolve to that checkout and engine changes are ignored.
- Never edit files under a running `npm run dev` (the page reloads and loses its state).
- Put scratch files in `out/<name>/` (gitignored).
- Rendering is free (local). **Never start a paid generation**; propose it and wait for a yes.

```bash
ms() { node cli/bin/motion-studio.mjs "$@"; }   # zsh/bash: a function, not a variable
```

## 1. Music and the beat map

```bash
ms groove laidback --bars 6 --out out/x/m.wav        # straight 120 · drive 140 · laidback 100 BPM
ms analyse out/x/m.wav --out out/x/m.json
ms new --character glider --clip 8 --analysis out/x/m.json --out out/x/base.json
ms describe out/x/base.json --analysis out/x/m.json  # "Onsets in beats": kicks, snares, hats
```

- **Your own music file** instead of a groove: `ms analyse <file.mp3> --out out/x/m.json` (the CLI
  decodes at 44.1 kHz). **Check the tempo against what the owner says**: the estimate can depend on
  the sample rate (one loop read 107.5 BPM at 44.1 kHz and 122.9 BPM from a 48 kHz WAV, and lost
  five kicks). The CLI, the editor and the Gallery all decode at 44.1 kHz for that reason
  (`DECODE_RATE` in `packages/studio/src/audio.ts`); never analyse a WAV you resampled to 48 kHz.
- **Check the tempo against the hits, not only against the estimate.** A 174 BPM drum and bass loop
  read 69.7 BPM (the owner guessed 139, double the estimate; neither fits). Score candidate grids:
  `node skills/draw-control-example/scripts/beat-grid.mjs out/x/m.json 69.7 139.4 174` prints how
  close the strong kicks and snares land to each grid's half beats, how many beats fit the file
  (32.02 at 174 for 11.04 s: eight bars, the loop's real length), and the hits in beats on the best
  grid. Then set that grid in the CLI base (`ms set out/x/base.json beatGrid.bpm 174`) and in
  `tracks.ts`, and write a copy of the analysis with that `bpm` for `describe`.
- **Where beat 0 sits.** The page's clip window starts at beat 0. A loop that starts on its
  downbeat wants beat 0 at the file's start, so frame 0 of the guide is the music's start (the
  finish step, step 7, then needs no offset): `grid` offset 0 in `tracks.ts`, and in the CLI
  `ms set out/x/base.json beatGrid.offsetSeconds 0 --out out/x/base.json` after `ms new`. The hits
  then sit a little after the beat numbers (0.08 s here); half-beat edges land just before them.
  **Analyse again after any edit to the audio**: the hits move (rotating one loop by 0.37 s took
  its kicks from 24 to 8).
- **Music shorter than the clip** (a 13.488 s loop under a 14 s clip, because the model's length is
  in whole seconds): the page plays the music, runs on in silence to the clip's end and wraps; the
  guide's audio has the same silent tail. Finish the generated clip with step 7.
- `describe` lists the first 16 onsets per band only. The full list is in the analysis file:
  `bands.low|mid|high[].seconds`, and beat = (seconds − `offsetSeconds`) × `bpm` / 60. Pick the
  strong ones (`strength`): a syncopated kick track has many weak hits.
- Clip beats = seconds × BPM / 60 (8 s at 100 BPM ≈ 13.3 beats). Rows may run past the clip end
  in a CLI-only shot. For a **page example** the last row must end exactly at
  `ceil((seconds + 1/24) × BPM / 60)` (`clipBeats`: 8 s at 120 → 17, 14 s at 107.5 → 26): on
  loading the music the page rescales every lane so its last edge lands there, which moves every
  edge (and re-times the path) when the script ends anywhere else.
- **A paid model may refuse the length**: the page refuses any estimate over its 10 USD limit before
  the cost dialog (Seedance 2.5 at 14 s). Check each model's estimate for the clip in the page
  (Generate shows it; nothing is sent in dev) before you settle the length, and say which refuse.
- **Three sync points, not a station on every hit.** The owner's rule (15 Nov 2026): the motion starts
  on the first kick, one move starts around the middle, one more (the reveal or the push into the
  detail); each camera block starts on one of them and runs **unbroken** to the next. No
  `lock … hold` on the camera and no travel lock on the subject (he tunes hit response himself with
  Sensitivity in the page). Check for plateaus with `scripts/camera-speed.mjs` (step 5).
- Put camera changes **on snares** (or kicks). For a CLI-only shot, use the exact beat numbers
  (`3.03`). For a **page example**, round each edge to the nearest half beat (`3`, `7`, `9`): the
  page snaps lane edges to half beats, so exact edges would make the page and the CLI differ.

## 2. Scene: subject, path, blocks

```
landmarks: on seed 7
figure: shape flyer body #ff6a13 head #ffb27a      # glider | car | flyer | runner
scenery: street                                    # NEVER "none" when you place boxes
box: -10 2.5 2 2 3.2                               # x z width depth height (metres)
```

- `scenery: none` **and** `landmarks: off` each silently delete every `box:` line (the script
  applies cleanly and the field is empty). Keep `landmarks: on seed 7` and any preset
  (`scenery: street`): placed boxes replace the preset's own placement.
- Placed boxes are **never moved** out of the camera's way. Keep them lower than the camera
  (a hovering subject at 2.5 m between 3–3.5 m pillars, camera at 5 m+) or out of its arc.
- **Boxes taller than the 8 m ceiling** (city towers of 10–20 m) can never be seen over, and
  `sight passes` does not help: it only lets the *preset's* blocks cross the line of sight, never
  placed ones. Keep the whole camera track inside the open space: a follow or three-quarter
  camera sits `distance × sin(angle)` to the side of the subject, so a 9 m three-quarter is 6.4 m
  to the side and inside a tower on a 12 m street. Open a wide view where there are no boxes
  (before the street starts), go behind (sideways offset near 0) inside it, and run
  `scripts/camera-boxes.mjs` on every render (below).
- Path: `walk on path (x,z,height) … corners 0.9` in the first row's action; x right, z towards
  the front camera; height for a hovering subject. `corners 0.8–0.9` gives smooth curves, but a
  corner rounds only as far as its **shorter** neighbouring segment allows (up to half of it): a
  turn followed by a 2.5 m segment stays a 1 m kink at any `corners`. Make the segments either
  side of a turn long (the first point after it 9 m on) and put extra points further along.
- **Speed is one constant along the whole path** (spaced by 3D distance, height included); there
  is no word for accelerating from rest or slowing to a stop. A travel lock varies speed only by
  holding at every locked hit (stop-start). So: no `ease in`, no deceleration into the last point;
  the subject stops dead at the path's end. For a landing, shape the heights so the vertical speed
  shrinks (drops per metre decreasing: `(7.75,-9,1.4) (7.75,-12,0.9) (7.75,-14.5,0.6)
  (7.75,-17,0.45) (7.75,-18.5,0.4)`) and let the path end after the clip, so touchdown is soft
  and no stop is seen.
- **A turn on a hit**: the path is travelled at one average speed over the action block (the
  travel lock keeps the subject where steady travel would be on each locked hit), so a corner's
  middle lands at block length × (path length to the corner / whole length). Choose the legs so
  each corner lands on its kick (L1 : L2 : L3 = t1 : t2 − t1 : end − t2), then check with
  `node skills/draw-control-example/scripts/path-beats.mjs out/x/shot.json out/x/m.json 11.03,15.67`:
  the heading is half way round on the hit (yaw 45 between 90 and 0 for a right turn, 135 between 90 and 180 for a left). Lengthening any leg
  re-times every corner; corners 0.5 round a quarter of each leg. A short last leg after a late
  turn forces a slow subject everywhere (it is one speed): to land a subject, end the travel early
  with a `rest` row after it (`beats 23-26 | action: rest`: the walk block ends at 23 and the
  subject stays where the path ends; the page reads it as hover). `freeze` does **not** end the
  walk block: the path still runs to the last row.
- A gap between boxes must take the figure's wingspan (the flyer's is 3.8 m: a 5 m gap leaves
  0.6 m a side).
- **A two-point path needs `corners 0`** in a page example (`walk on path (-24,0) (24,0) corners 0`):
  the page stores every path with its corner rounding and the CLI only when the script gives one, so
  without it the MCP parity test sees a `rootShape` on one side only.
- Use `walk on path` for anything that travels. `glide on path` **holds the figure's opening
  facing** (yaw 0, towards +z) and slides it sideways along the path, which also changes what
  `follow side` means (side of the facing, not of the travel). Use glide only for a path that
  runs along +z, or for a deliberate slide.
- Weave by alternating z around the boxes. Clearance is from the **figure's edge**, not the path
  centre: the flyer's wingspan is about 3.8 m, so keep the path centre ~2 m from each box edge.
- Placed boxes have no collision with the camera, only the line of sight matters to you: a box
  in the camera's arc fills a corner of the frame or puts the camera on its roof. Check the
  camera's track (`camera.json`) against each box before you settle the layout.
- `shot subject|environment|action|legend:` lines describe what the model should draw. **The page
  builds the legend itself** from the figure's colours ("the orange figure is the character; grey
  blocks are placeholders for the environment"): write exactly that legend line, or the page and the
  CLI recipes differ; say what the blocks are in the environment line instead ("the grey blocks are
  its steel pillars").

## 3. Camera: views

**Left and right** are the subject's own, and the map, the script and the video agree (checked
15 Nov 2026, map screenshot against a top render). World: x right, z towards the front camera,
y up. The page's map is a true top view: x to the right, **z downwards**. So for a subject
moving right on the map (+x), its **right is the bottom of the map (+z)** and its left is the
top (−z). `follow side` (left) puts the camera on −z, `follow side right` on +z; a `box:` with
z > 0 sits on the subject's right while it travels +x. Turn the rule round when the path runs
the other way. Check it on the map (the camera blocks are labelled there) or in `camera.json`.


Frame 0 is the **rig start**, not the first block. Each block starts where the block before it ended: a follow offset (distance, height; it wins over a shot preset), a shot preset, a fov and the end of a programmed dolly, push, pull or rise carry on into every later block until another block changes them; a block that sets none of them keeps what it started with. The camera word top (or above) with `shot: -` is the exception: it lifts the camera overhead from those values without changing them, so the block after it comes back to the distance and height from before it (a fov set on it carries on). With the `top` shot preset (`top | shot: top`, what the page prints for a top block) it sets 1.4 m, 6.5 m and fov 45 like any preset, and those carry on.
(Pinned by `packages/core/test/camera-carry.test.ts`.) So set the rig to the opening view:

```
rig: distance 8m height 5m fov 30 yaw 45           # the opening framing (frame 0)
```

| View | Camera cell | Notes |
| --- | --- | --- |
| Isometric (3/4 from above) | `three-quarter distance 8m height 5m fov 30` + matching `rig:` | narrow fov flattens it; height ≈ 0.6 × distance |
| Pan round | `orbit 70 slow lock snare 1 hold` | keeps the distance/height it starts with (the block before's offset or preset, else the rig): set those high for a high pan |
| Top | `above fov 70 \| shot: -` | write `shot: -` when the next block should keep the framing from before the top: it lifts overhead from the carried values and the next block returns to them (the fov carries on); a wide fov makes it readable. `shot: top` instead sets the preset (1.4 m, 6.5 m, fov 45) and the next block keeps that; the page prints its own top blocks with `shot: top` unless the script gave `shot: -`. Over a hovering subject the 8 m ceiling makes it a steep oblique (~80°), not straight down |
| Side | `follow side distance 6m height 1.6m fov 35` (left) / `follow side right …` | `right` = the other side |
| Behind / front | `follow behind …` / `follow front …` | |

- `three-quarter` takes `distance / height / angle` **directly**; `three-quarter follow …` is an
  error. `follow` only prefixes `side`, `behind`, `front`.
- With a hovering subject, heights count **from the subject** (it flies at 2.6 m: `height 5m`
  puts the camera at 7.6 m). The camera stops at 8 m: `describe` says "height clamped … on N frames".
  Follow heights start 0.2 m above the subject, so **street level** means lowering the subject
  (a path point with a lower height, `(6.5,15.5,1.2)`), then `follow behind … height 0.3m`.
- `three-quarter` sits 45° off the subject's nose, on its left; `angle` turns it from there
  (`angle 90` = 135°, behind-left). A three-quarter block at beat 0 frames frame 0 at its own
  angle whatever the rig's yaw, so give the `rig:` the same (`yaw 135` with `angle 90`) for the map.
- A top view shows only the grid once the subject has left the boxes: keep it among them, and
  widen the fov (75) when the camera is 6 m above it so the boxes reach the frame's edge.
- **A detail shot (the feet, a board, a wheel)** needs `aim`: every follow camera looks at about 1 m on
  the subject (a preset at 1.1–1.35 m), so a low close camera frames the body, never the shoe.
  `follow side distance 2.5m height 0.3m aim 0.3m fov 32` frames the lower body and the ground. The
  aim carries on like a distance or height: give the next block `aim 1m`. A block at beat 0 with an
  aim starts on it (the rig has none). The framing guard still turns the aim up a little where the
  subject's centre nears the top of the frame (frame 0 looked at 0.6 m, then settled to 0.3 m).
- **Distance limits differ:** the `rig:` line takes 1.5–12 m, a follow block 1–30 m. A far opening
  view needs a block of its own, not the rig.
- `fov`, offsets and presets carry on into later blocks (top/above excepted, above): give **every** block its own `fov` and offsets when the next view should differ.

## 4. Camera: smooth transitions

- A shot or offset eases in over the block's first beat, but a **follow swing** (top → side,
  behind → front) is a spring: a 150–180° swing takes about **2 s**. Give a follow block at least
  2 s plus a settled tail (start the final side block ~3 s before the end).
- **Smooth by default: no locks.** `lock kick 1 hold` on every camera cell and `lock kick 0.8` on
  the path make the camera hold and the subject pulse on every kick, which reads as stop-start.
  Leave the locks out (the moves still start on their hits through the block edges); the owner
  tunes hit response with Sensitivity in the page. With no lock in the script the page carries
  none (`camLock` and `charLock` off) and prints none back.
- **One reaction on one hit** (a zoom on a single kick): write it as blocks, not a lock. The page
  keeps one camera lock for the whole lane, so `lock kick 1 punch` on one cell becomes a punch on
  every block. Instead: a one-beat block of the same view with a closer offset starting on the
  half beat at the kick (`beats 6-7 | camera: three-quarter distance 4.5m height 3m …`), then the
  original offset again (`beats 7-8 | … distance 7m height 5m …`). Offsets ease over a block's
  first beat, so it zooms in from the kick and eases back out. A closer view usually sits lower
  too: Example 1's accent takes distance 7 → 4.5 m and height 5 → 3 m, so in `camera.json` the
  distance dips once (8.06 → 4.92 → 8.06 m over frames 81–100) and the camera drops 2 m and comes
  back (8 → 6 → 8 m); the view, angle and fov stay. Keep the height if only the distance should move.
- Measure smoothness from `camera.json`, not by eye: the camera's heading yaw per frame (rate,
  and acceleration over 3 frames; skip frames looking within 1 m of straight down), and its speed
  per frame inside each block (a hold shows as speed near 0 at each hit). Example 1 went from a
  65°/s peak turn rate and 0 m/s holds to 57.5°/s and no dip with corners 0.9 and no locks.
- **A zoom from the top under the 8 m ceiling**: `above + push in to 1m even` in a block that
  starts on a hit. The push shows only once the asked height drops under 8 m (until then the
  ceiling holds the camera), so ask for a close target (1 m) to make it start near the block's
  edge; `fast` finishes early and holds, `even` keeps growing the subject through the landing.
- A follow camera trails wide through a sharp turn, wider the larger its distance: a follow
  block of 9 m starting as the subject turned out of an alley swung into the corner tower for
  5 frames; 6 m cleared it. Keep follow distances short through turns between boxes.
- **At a fast tempo an offset is a whip.** A follow offset, a preset or a fov eases in over the block's
  first beat (`slow`: 2.5 beats at most): 0.34 s at 174 BPM, so pulling a camera from 2.5 m to 11 m
  moved it at 39 m/s. Put the big change in a **programmed move**, which eases over the whole block:
  `follow side height 1.6m aim 1m + pull out to 13m`, `three-quarter distance 13m + rise to 8m` (one
  amount move per block: pull or rise, the other through the offset, kept small). Peak speed fell
  to 7–12 m/s.
- `slow` arrives late, `fast` early, `even` in between. A `slow` block that starts in the last
  ~1.5 s barely shows: start it earlier or use `even`.
- `lock snare 1 hold` on a moving block pauses it on each snare (stations), still ending on its amount.
- `A then B` chains up to four moves inside one block.

## 5. Apply, read back, render, look

```bash
ms script out/x/base.json out/x/shot.txt --analysis out/x/m.json --out out/x/shot.json
ms describe out/x/shot.json --analysis out/x/m.json         # "ranges", "height clamped", walk path
ms render out/x/shot.json --audio out/x/m.wav --out out/x/v1 --grid --start 0 --length 8 --unit seconds
ffmpeg -v error -y -i out/x/v1/guide.mp4 -vf "select='not(mod(n\,16))',scale=320:-1,tile=4x3" -frames:v 1 out/x/v1.png
```

- For a longer clip change `--length` and the sheet: 14 s is 337 frames, `select='not(mod(n\,21))'` and `tile=4x4`.
- With `box:` lines, check the camera against them on every render:
  `node skills/draw-control-example/scripts/camera-boxes.mjs out/x/v1/camera.json out/x/shot.txt`
  (camera inside a box, within 0.75 m, or a box between camera and target; exit 1 when inside).
- Always `--grid`: without ground lines nothing shows the subject moving.
- The guide must be 193 frames for 8 s (24N+1). **Never trim or edit a rendered file**: change
  the script and render again.
- Look at the contact sheet (open the PNG). Check each view against the brief, frame by frame.
- To check where the camera really is: `out/x/v1/camera.json` → `track[n].position` and
  `.target` in metres (y up; the subject faces +Z at yaw 0). "Side view" means the camera is
  level with the subject along its direction of travel and offset sideways.
- Check the camera's speed per block on every render:
  `node skills/draw-control-example/scripts/camera-speed.mjs out/x/v1/camera.json 0,9,21,35 174`
  (edges in beats, then the BPM). A plateau (speed near 0 at each hit inside a block) is a lock the
  owner did not want; a peak far above the subject's speed is a whip (step 4).
- **A camera that moves through a row of blocks** (a pull out from beside the subject to beyond the
  row) crosses the row's depth at some point along the street: find that frame in `camera.json`,
  and leave a gap in the row there (`camera-boxes.mjs` reports "within 0.75 m").
- A camera close to a row of blocks sees one block fill the frame: keep blocks narrow (3 m) with
  gaps as wide, and the camera 6–8 m beyond them, so a block and a gap share the frame.
- Iterate: one change per render, note what it fixed. Six or seven renders is normal for a new shot.
- Fast loop for one stretch: `--start 6 --length 2 --unit seconds` renders just that tail (it warns
  it is under a model's 3 s minimum; fine for checking). Its `camera.json` track starts at
  `startFrame`, so add that offset when you match frame numbers.
- `describe --script` prints the script back in canonical form (`above` → `top`, `follow side
  right` → `side right`, settings reordered): the same shot, not the same text.

## 6. Ship it as a page example

The page reads the script into its own state and prints it back, so write the file in the page's form:
- block edges on half beats (see step 1);
- every camera cell carries the camera lane's lock, or none (the page applies one lock to all; Example 1 has none);
- `shot: -` on camera blocks keeps the carried framing (a preset like `wide` or `top` overrides it, and carries on after). The page prints a top block it made itself as `top | shot: top`, so a following orbit then runs at 1.4 m / 6.5 m / fov 45; write `shot: -` on the top block (the page keeps it) when the next block should come back to the earlier framing;
- the last row ends at the page's clip beats (step 1), or loading the music moves every edge;
- `# track: <groove> <bars> bars` names the music, e.g. `# track: laidback 6 bars`; a music file
  is `# track: file <name>` (Example 1), with the file in `packages/studio/public/tracks/`
  (compressed, a few hundred KB; `*.mp3` is gitignored, so add a `!` line for it) and its entry in
  `tracks.ts` with `file`, its `grid` (step 1), a `licence` exactly as the owner gave it, and a
  fallback `groove`.

1. `examples/scripts/beat-path-ex<N>-<id>.txt` with `# track:` and `# clip:` header lines.
2. `packages/studio/src/beat-path/examples.ts` (EXAMPLES, TEMPO), `tracks.ts` (EXAMPLE_TRACKS,
   `ExampleId`), the example switcher in `layout.ts`, and anything else that lists the ids
   (`git grep -n -E '"drone"|drone:|ExampleId'` shows every place example 4 touched; the
   switcher in `layout.ts`, the smoke's example loops and the MCP parity test's script count are
   not in that grep: `git grep -n -E 'Example 4|"3", "0"|toBe\(1[0-9]\)'`).
   **Replacing an example** (as Examples 1 and 2 were; the old ones are `beat-path-avenue-cross.txt` and
   `beat-path-skate-rail.txt`, and the smokes that need an 8 s clip with music longer than it now use Example 3): the tests and smokes that used it as a generic
   fixture break (a two-block snare-locked lane, an 8 s clip, music longer than the clip, slicing
   it). Keep the old script under a new name (`beat-path-avenue-cross.txt`, read by
   `packages/studio/test/avenue.ts`) and point those tests at it; move the smokes that slice or
   assume 8 s to another example; keep the published-clip ids.
3. Check it in the page the way the smoke does: `window.__beatPath.recipe().camera.segments`
   for the ranges, the lane edges unchanged after the music loads, and `cameraAt(0)` for frame 0
   against your CLI render's `camera.json` `track[0].position` (they agree to the millimetre when
   the script is in page form). For a file track also check `trackLength()` against the clip and
   that playback wraps at the clip's end.
   **Tests that load file-track examples on a generated groove** (the MCP parity test, the in-frame test)
   must use the track's given grid (`tracks.ts`), or a 12 s clip at 120 BPM has 25 beats and a script
   running to beat 35 is refused. Both now look the grid up by the `# track: file` name.
4. **Look at the map**: the subject path and every camera block drawn and labelled. A Playwright
   screenshot of `#map` (`const { chromium } = await import("playwright-core")`, a Vite server on
   `packages/studio/`, wait for `window.__beatPath.trackName()`), checked against the contact
   sheet: a left turn of a subject travelling +x goes **up** the map.
5. `npm run check`, `npm run smoke` and `npm run mcp-check`; open the page and play the example.

## 7. Finishing a generated clip

When the clip is longer than the music (a model's length is whole seconds), finish the model's
video offline: `npm run finish -- <video.mp4> <music> --out <file.mp4>` lays the original music
over it and cuts the video to the music's length, re-encoded so the cut lands on a frame (within
one frame: 13.500 s of video at 24 fps for 13.488 s of music). It needs beat 0 at the music's
start (step 1), or the music lands early by the offset. Try it on your rendered guide first:
`npm run finish -- out/x/v3/guide.mp4 <music> --out out/x/finished.mp4`, and check both durations
it prints.

## 8. One guide, many subjects

When the owner wants one guide cut into several looks (a realistic runner, an anime skater, a forklift
in a factory: Example 2), only the shot description and the references change. Make the guide
neutral on purpose:
- **Figure**: a person-sized, upright, neutral shape (`runner`: a 1.55 m capsule with a chest marker).
  It reads as a person or a skater, and as a forklift's upright mast and cab; a `car` shape would pull
  the people versions towards a vehicle, and a `flyer` reads as aircraft.
- **One accent on the music, without breaking the travel**: the owner wanted "a little more movement
  with the audio". A hop on one kick (`beats 19-21 | action: continue, jump @kick 1`; the page's
  Character lane **Hop** block) lifts 0.28 m and lands on the kick while the walk runs on. A page
  `jump` block is `rest, jump @beat mid`, which ends the travel: use Hop. Put it where it is seen (a
  gap between blocks in the running view, not in the close detail, where it leaves the frame) and
  name it in every subject's action line (a hop, an ollie, a bump over a floor plate). Check the
  marker's seconds in the recipe and the lift with `frameAt` against `camera.json`.
- **Path**: straight and steady, no ramp, rail, trick or travel lock, at a speed every subject can
  hold (4 m/s: a jog, a push on a board, a brisk forklift). A ramp was dropped because it would crash
  the runner and the forklift.
- **Blocks**: generic boxes that each version can name (shopfronts and cafés; the factory's pillars and
  machines); low ones between camera and subject, tall ones beyond as the far side or the wall.
- **Camera**: framings that mean the same thing for each subject. A low close detail reads as "the
  shoe", "the deck", "the wheel" when the action line says which.
- **Shot lines**: the runner (say) as the script's own `shot` lines; the others ready to paste, as
  comment lines at the top of the script (`#   shot subject: …`, ignored by every reader) and in
  `docs/beat-path.md`. Only subject, environment and action differ; the legend line is the page's.
- **Avoid brand names** in the shot lines ("shot like a running-shoe advert", not the brand): a model
  may refuse or copy a logo.
- Make each look differ from the other examples' camera order (Example 1 ends zooming in from the top;
  Example 2 opens on the detail and ends on the wide view), so a reel of examples shows the range.

## Report

Name the script, what `describe` said, the render folder, the contact sheet, every trap you hit
and how you got past it. Say which model did the work. A person still judges the motion and
the music: do not claim it looks or sounds good.
