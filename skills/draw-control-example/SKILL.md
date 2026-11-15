---
name: draw-control-example
description: Make a new Draw Control example (or any shot) from a plain-language brief - subject, path, blocks, camera views and transitions on the music - through the motion-studio CLI, verified by render. Use when asked to create, add or modify an example, a template or a shot, or to place the camera in a view (isometric, top, side, behind, front) and move between views smoothly.
license: MIT
compatibility: Node 24; the motion-studio CLI (cli/bin/motion-studio.mjs) or MCP server; ffmpeg for contact sheets
metadata:
  repo: motion-studio
  version: 0.1.0
---

# Making a Draw Control example

A shot is a **shot script**: settings lines plus one row per block. You write it, apply it to
a base recipe, read it back, render the guide, and **look at the frames**. Follow the steps in
order; every trap below cost a real render once.

Grammar: `docs/recipe.md#shot-script` (rows, camera words, and every settings line: `rig:`, `box:`,
`scenery:`, `figure:`, `shot …:`). Working examples: `examples/scripts/beat-path-ex*.txt`;
`beat-path-ex4-drone.txt` is the worked answer to an isometric → pan → top → side brief.

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

- Clip beats = seconds × BPM / 60 (8 s at 100 BPM ≈ 13.3 beats). Rows may run past the clip end.
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
- Path: `walk on path (x,z,height) … corners 0.9` in the first row's action; x right, z towards
  the front camera; height for a hovering subject. `corners 0.8–0.9` gives smooth curves.
- Use `walk on path` for anything that travels. `glide on path` **holds the figure's opening
  facing** (yaw 0, towards +z) and slides it sideways along the path, which also changes what
  `follow side` means (side of the facing, not of the travel). Use glide only for a path that
  runs along +z, or for a deliberate slide.
- Weave by alternating z around the boxes. Clearance is from the **figure's edge**, not the path
  centre: the flyer's wingspan is about 3.8 m, so keep the path centre ~2 m from each box edge.
- Placed boxes have no collision with the camera, only the line of sight matters to you: a box
  in the camera's arc fills a corner of the frame or puts the camera on its roof. Check the
  camera's track (`camera.json`) against each box before you settle the layout.
- `shot subject|environment|action|legend:` lines describe what the model should draw.

## 3. Camera: views

**Left and right** are the subject's own, and the map, the script and the video agree (checked
15 Nov 2026, map screenshot against a top render). World: x right, z towards the front camera,
y up. The page's map is a true top view: x to the right, **z downwards**. So for a subject
moving right on the map (+x), its **right is the bottom of the map (+z)** and its left is the
top (−z). `follow side` (left) puts the camera on −z, `follow side right` on +z; a `box:` with
z > 0 sits on the subject's right while it travels +x. Turn the rule round when the path runs
the other way. Check it on the map (the camera blocks are labelled there) or in `camera.json`.


Frame 0 is the **rig start**, not the first block. Each block starts where the block before it ended: a follow offset (distance, height; it wins over a shot preset), a shot preset, a fov and the end of a programmed dolly, push, pull or rise carry on into every later block until another block changes them; a block that sets none of them keeps what it started with. The camera word top (or above) is the exception: it lifts the camera overhead from those values without changing them, so the block after it comes back to the distance and height from before it (a fov set on it carries on).
(Pinned by `packages/core/test/camera-carry.test.ts`.) So set the rig to the opening view:

```
rig: distance 8m height 5m fov 30 yaw 45           # the opening framing (frame 0)
```

| View | Camera cell | Notes |
| --- | --- | --- |
| Isometric (3/4 from above) | `three-quarter distance 8m height 5m fov 30` + matching `rig:` | narrow fov flattens it; height ≈ 0.6 × distance |
| Pan round | `orbit 70 slow lock snare 1 hold` | keeps the distance/height it starts with (the block before's offset or preset, else the rig): set those high for a high pan |
| Top | `above fov 70` | the preset is 1.4 m from the subject: a wide fov makes it readable. Over a hovering subject the 8 m ceiling makes it a steep oblique (~80°), not straight down |
| Side | `follow side distance 6m height 1.6m fov 35` (left) / `follow side right …` | `right` = the other side |
| Behind / front | `follow behind …` / `follow front …` | |

- `three-quarter` takes `distance / height / angle` **directly**; `three-quarter follow …` is an
  error. `follow` only prefixes `side`, `behind`, `front`.
- With a hovering subject, heights count **from the subject** (it flies at 2.6 m: `height 5m`
  puts the camera at 7.6 m). The camera stops at 8 m: `describe` says "height clamped … on N frames".
- `fov`, offsets and presets carry on into later blocks (top/above excepted, above): give **every** block its own `fov` and offsets when the next view should differ.

## 4. Camera: smooth transitions

- A shot or offset eases in over the block's first beat, but a **follow swing** (top → side,
  behind → front) is a spring: a 150–180° swing takes about **2 s**. Give a follow block at least
  2 s plus a settled tail (start the final side block ~3 s before the end).
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

- Always `--grid`: without ground lines nothing shows the subject moving.
- The guide must be 193 frames for 8 s (24N+1). **Never trim or edit a rendered file**: change
  the script and render again.
- Look at the contact sheet (open the PNG). Check each view against the brief, frame by frame.
- To check where the camera really is: `out/x/v1/camera.json` → `track[n].position` and
  `.target` in metres (y up; the subject faces +Z at yaw 0). "Side view" means the camera is
  level with the subject along its direction of travel and offset sideways.
- Iterate: one change per render, note what it fixed. Six or seven renders is normal for a new shot.
- Fast loop for one stretch: `--start 6 --length 2 --unit seconds` renders just that tail (it warns
  it is under a model's 3 s minimum; fine for checking). Its `camera.json` track starts at
  `startFrame`, so add that offset when you match frame numbers.
- `describe --script` prints the script back in canonical form (`above` → `top`, `follow side
  right` → `side right`, settings reordered): the same shot, not the same text.

## 6. Ship it as a page example

The page reads the script into its own state and prints it back, so write the file in the page's form:
- block edges on half beats (see step 1);
- every camera cell carries the camera lane's lock (`… lock snare 1 hold`), because the page applies one lock to all;
- `shot: -` on camera blocks keeps the carried framing (a preset like `wide` overrides it, and carries on after);
- `# track: <groove> <bars> bars` names the music, e.g. `# track: laidback 6 bars`.

1. `examples/scripts/beat-path-ex<N>-<id>.txt` with `# track:` and `# clip:` header lines.
2. `packages/studio/src/beat-path/examples.ts` (EXAMPLES, TEMPO), `tracks.ts` (EXAMPLE_TRACKS,
   `ExampleId`), the example switcher in `layout.ts`, and anything else that lists the ids
   (`git grep -n -E '"drone"|drone:|ExampleId'` shows every place example 4 touched).
3. Check it in the page the way the smoke does: `window.__beatPath.recipe().camera.segments`
   for the ranges and `cameraAt(0)` for frame 0, against your CLI render's `camera.json`.
4. `npm run check` and `npm run smoke`; open the page and play the example.

## Report

Name the script, what `describe` said, the render folder, the contact sheet, every trap you hit
and how you got past it. Say which model did the work. A person still judges the motion and
the music: do not claim it looks or sounds good.
