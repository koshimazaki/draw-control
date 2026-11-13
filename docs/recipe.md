---
tags: [recipe, motion-studio, format]
summary: Every field of the Motion Studio recipe (version 2), its units, limits and what it does, plus how sequences are saved and reloaded.
---

# Recipe format (version 2)

A recipe is the whole performance: one JSON object that the studio, an agent and the export all read. Frames are a pure function of (recipe, audio drive, frame number), so the same recipe with the same track always renders the same frames. The validator (`packages/core/src/recipe.ts`, `validateRecipe`) is strict: it refuses unknown keys, values out of range, URLs and anything executable, and returns a fresh copy.

Units: metres, seconds, musical beats. Frame rate is fixed at 24.

## Sequences: save, load, share

- A **sequence** is the recipe JSON itself. The studio's Sequence panel saves it by name in this browser's local storage (key `motion-studio.sequences.v1`), loads it back, downloads it as `<name>.recipe.json` and uploads one. Dropping a `.json` on the page loads it too. Loading is an ordinary edit, so Cmd-Z undoes it.
- Committed sequences live in `examples/recipes/`: the camera examples A, C, D, D8 (written by `npm run examples`) and the named sequences `fight-combo` and `gait-change` (from `packages/core/src/sequences.ts`; `UPDATE_SEQUENCES=1 npx vitest run` rewrites them). The studio lists them under "Examples".
- **Reload is exact.** `packages/core/test/sequences.test.ts` checks that every committed recipe survives JSON out and JSON in with identical frames. Only the audio is outside the recipe: `audio` names the track, so load the same track to get the same audio-driven energy and onsets. A hand-drawn `energyCurve` and edited `reactive.markers` are inside the recipe and need no track.

## Top level

| Field | Type, limits | Meaning |
| --- | --- | --- |
| `version` | `2` | Recipe format version. |
| `fps` | `24` | Frame rate. Fixed. |
| `durationBeats` | whole number, 1–512 | Length in beats. Frame count = (offset + beats × 60 / bpm) × 24. |
| `beatGrid` | object | Tempo and phase of the beat grid (below). |
| `character` | object | Who performs (below). |
| `energy` | 0–3 | Global multiplier on every move's amplitude (every character). |
| `moves` | list, up to 128 | Moves on the beat grid, in strictly increasing `atBeat` (below). |
| `rootPath` | list, 1–64 points | Where the character stands and faces over time (below). |
| `jumps` | list, up to 64 | Programmed root lifts (below). Accent jumps on markers are separate. |
| `audio` | optional object | `name` (up to 120 characters) and `licence` of the track. The audio itself is never stored. |
| `camera` | optional object | The audio-reactive camera rig, used by the "rig" view and the export (below). |
| `reactive` | optional object | The audio-reactive animation layer and its hit markers (below). |
| `steps` | optional object | Amplitude per step for the rigged mannequin (below). |
| `energyCurve` | optional object | A hand-drawn energy curve that replaces the analysed one (below). |
| `landmarks` | optional object | `{ seed: whole number, on: true or false }`: grey landmark blocks (boxes, pillars, low walls) placed from the seed around the scene, clear of the subject's travel, the camera's path and the line of sight between them (`packages/core/src/landmarks.ts`); re-placed when a path changes. Command `setLandmarks { on?, seed? }`; the shot script's settings line `landmarks: on seed 7` or `landmarks: off`. Absent: none (the studio as before). |
| `mutedHits` | optional list | Onset times in seconds (up to 512) of kicks, snares or hats switched off: every lock skips them (stations, camera hits, move pulses); script anchors (`@kick 2`) still count them. Commands `muteHit { seconds, on? }` (toggles without `on`) and `resetMutedHits`; script settings line `muted: 1.6 2.35`. |
| `figure` | optional object | `{ shape?: glider|car|flyer|runner, body: "#rrggbb", head: "#rrggbb" }`: the guide figure's shape (under the `glider` kind, so the bundle schema is unchanged) and colours (the front marker stays white). Shapes lean into turns (`FrameState.root.bank`); nothing on any shape moves to the beat. Command `setFigure`; script line `figure: shape car body #e8632a head #f2a35e`. |
| `sceneryBoxes` | optional list | `[{ x, z, w, d, h, yaw? }]` (metres, up to 200): the scenery as explicit boxes, edited on the map (Blocks tool) or by an agent; they replace the preset's placement. Commands `setSceneryBoxes`, `addSceneryBox`, `removeSceneryBox`; script lines `box: x z width depth height [yaw]`. |
| `scenerySight` | optional, `passes` | Absent (`clear`): no block crosses the camera's line of sight. `passes`: a block may cross it briefly, a tracking shot through columns: the subject is hidden for at most 0.33 s at a time and 15 % of the clip in all (`PASSES` in `landmarks.ts`); a street adds a colonnade at the pavement's edge. Explicit boxes are not capped (your choice). Command `setScenerySight`; script `scenery: street sight passes`. |
| `scenery` | optional | `none`, `scatter` (the seeded blocks), `street` (buildings either side of the subject's path with a pavement's clearance) or `city` (a grid of blocks of varied heights with streets); every block clear of the subject, the camera and the line of sight. Absent: the scatter when `landmarks` is on. Command `setScenery { preset, seed? }`; script line `scenery: city`. |
| `freezes` | optional list | `[{ fromBeat, toBeat }]`, up to 32, in order: the character holds its position, height and pose (mid-air too) while the camera keeps moving; afterwards its motion carries on from where it stopped, re-timed to finish on the last beat (stations after a freeze land a little off their hits). Script action word `freeze`. |
| `shot` | optional object | `{ subject, environment, action, legend }` (each up to 300 characters): the shot description that travels with the guide in `recipe.json`. Command `setShot`; script lines `shot subject: …`, `shot environment: …`, `shot action: …`, `shot legend: …`. |
| `rootShape` | optional object | The walk path as given point by point with its corner rounding: `{ corners: 0–1, points: [{ x, z, y? }, …] }` (2–63 points). `rootPath` is built from it; the shot script prints these points and `corners N`. Set by `setRootPath` with `corners`; any other walk path edit removes it. |

### `beatGrid`

| Field | Limits | Meaning |
| --- | --- | --- |
| `bpm` | 40–240 | Tempo. |
| `offsetSeconds` | 0–60 | Time of beat 0 in the track. |
| `beatsPerBar` | whole, 1–16 | Bar length: downbeats, bar tempo levels, the grid in the timeline. |
| `source` | `manual` or `analysis` | Whether a person set it or beat detection did. |

### `character`

| Field | Meaning |
| --- | --- |
| `kind` | `rigged` (the bundled rigged mannequin, clip-driven, the default), the procedural figures on one skeleton `mannequin`, `block`, `stick` (lines and joint dots) and `blob` (capsules, no visible joints), `glider` (no limbs: an orange pyramid with a sphere floating above it and a white front marker; it travels and faces along the walk path and ignores poses; the Beat Path figure, added 12 November 2026) or `file` (a GLB or FBX loaded from disk, never bundled). Switching between the procedural figures keeps every move. |
| `name`, `licence` | Up to 120 characters each; travel into the bundle metadata. |

## `moves[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `id` | up to 40 characters, unique | Stable handle for edits and agents. |
| `name` | up to 60 characters | Shown on the move lane. |
| `atBeat` | a beat inside the recipe (fractional allowed, e.g. on a kick) | Where the block starts. |
| `lengthBeats` | optional, 0.125–512 | The block's length. Missing: the move plays until the next one starts. Present: it ends there (or where the next starts, if earlier) and the figure settles to rest in the gap. |
| `speed` | optional, 0.25–4 (default 1) | Playback rate of the phases or the clip. Dragging a block's edge rescales it with the length: twice as long plays at half the speed. |
| `blendBeats` | 0–8 | Crossfade from the move before, in beats. The rigged mannequin never blends faster than 6 frames (so 0 means "the shortest blend", not a cut); the move lane's handle and the inspector edit it in frames, 6–24. |
| `loop` | true or false | Repeat the phases until the next move. |
| `phases` | 1–32 | The move's phases (below). Clip moves carry one phase, the clip's cycle. |
| `clip` | optional, up to 120 characters | Clip name: a loop of the rigged mannequin (`Idle_Loop`, `Dance_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`, `Sword_Idle`, `Spell_Simple_Idle_Loop`) or an embedded clip of a loaded file. |
| `clipCycleBeats` | optional, 0.25–64 | Beats one pass of a file clip is stretched to. Loops of the rigged mannequin are time-warped so each step lands on a beat instead. |
| `lock`, `strength` | optional: `beat`, `kick`, `snare` or `hat`; 0–1 (default 1) | Beat lock. Inside the block the phases or the clip speed up into each locked hit and slow after it (playback rate 1 + strength·cos 2πu between hits), so the move reads as moving to the music at its normal average speed; every hit and both edges keep their beat. Strength 0 is exactly the unlocked move. `kick`, `snare` and `hat` read the analysed onsets (no track: no hits, no change). |

Transitions between rigged loops: a gait (walk, jog, sprint, crouch walk) that follows a gait starts on the foot the old one steps with next. See `packages/core/src/transitions.ts`.

### `moves[].phases[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `name`, `caption` | up to 40 and 120 characters | Shown in the caption and the beat strip. |
| `pose` | a pose name from `packages/core/src/poses.ts` | Target pose reached at the end of the phase (procedural figures). |
| `amplitude` | 0–3 | 0 rest, 1 as authored, 2 doubled. It scales the rigged mannequin's clip amplitude too (it was ignored there before 11 November). |
| `length` | `{ "beats": 0.125–64 }` or `{ "frames": 1–2400 }` | Phase length. |
| `previewFps` | 12, 18, 24, 30 or 60 | Below 24 the phase steps (held frames) for a stop-motion look. |
| `expression` | optional: neutral, smile, surprised, angry, sad, focused | Reserved for faces; validated and exported, not rendered yet. |

## `rootPath[]` and `jumps[]`

The walk path drawn in the top view (or `setRootPath`) is stored here: up to 48 points resampled evenly along a smoothed spline, so the speed along it is steady, each with a facing (`yaw`) along the path.


- `rootPath[]`: `{ beat, x, z, yaw, y? }`. Beats strictly increase, inside the recipe; `x` and `z` from -100 to 100 metres; `yaw` from -720 to 720 degrees; `y` (optional, 0–30 m) lifts the root, for a glide that rises. Linear between points, held after the last. The rigged mannequin's clips stay in place, so travel comes only from here.
- `setRootPath` with a gait (`Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`; `walk`, `run` on the procedural figures) adds a move block over the range, facing along the path. A rigged gait plays at the speed whose steps cover the path's speed (its authored travel speed, `travel` in `clip-library.ts`), so the feet slide less; the procedural gaits have no authored travel speed and keep theirs. There is no foot locking. `gait: "glide"` adds no block: the figure slides along the path (sideways, backwards, up where points carry `y`) holding its pose or whatever move is on the Action track, facing where it faced (`face: "path"` turns it along the path). It works on every figure.
- `travelLock` (optional): `{ lock: beat|kick|snare|hat, strength?: 0–1 }`. The travel (from the path's first move to its last point) is re-timed so the figure arrives at a station on each locked hit, placed where steady travel would be at that moment (so every leg has the same average speed and a short leg is never a dash; until 13 November stations were evenly spaced): it eases into the hit, holds for up to a quarter beat (a quarter of a short leg), and goes again. Strength blends with the steady speed; the start, the end and the range stay as drawn. The stations are drawn as red posts on the walk path in the top and orbit views.
- `jumps[]`: `{ atBeat, durationBeats 0.125–16, height 0–3 }`: a programmed lift of the root.

## `camera`

| Field | Limits | Meaning |
| --- | --- | --- |
| `segments[]` | 1–32, in order, not overlapping | `{ fromBeat, toBeat, modes, ...optional fields below }`, the blocks of the Camera track. Modes: `static`, `orbit`, `pushIn`, `pullOut`, `rise`, `truck` (sideways), the follow rigs `lead` (front), `threeQuarter`, `side` and `chase` (behind), `top` (overhead), `fixed` (a tripod that pans) and `path`. Several may share a range, except: `static`, `fixed` and `path` stand alone, one follow rig at a time, `pushIn` excludes `pullOut`. Beats outside every range hold. |
| `intensity` | 0–1 | How strongly the music drives speed and accents (0: a plain programmed move). |
| `orbitDegreesPerBeat` | -45 to 45 | Orbit speed at mid energy; the sign is the direction. |
| `distance` | 1.5–12 m | Starting distance from the subject. |
| `height` | 0.2–6 m | Starting camera height. |
| `fov` | 15–80 degrees | Vertical field of view at 16:9. |
| `startYaw` | -360 to 360 degrees | Starting angle around the subject (0 = in front, on +Z). |
| `path[]` | optional, 2–32 points | `{ x, y, z }` in metres (`y` 0.1–30, the camera height) for the `path` mode; required when a segment uses it. |
| `lanes` | optional | Automation lanes `distance`, `height`, `yaw`, `fov`, each `{ points: [[frame, value], ...] }` like the envelope (below). |
| `corners` | optional, 0–1 | Corner rounding of `path`: the camera flies straight segments between the points, each corner rounded by this amount (0 sharp, 1 round). Absent: the smooth spline through the points, as before. |
| `keepInFrame` | optional, `true` | The framing guard (`camera-guard.ts`): on every frame the subject's centre is measured in the 16:9 frame, and only where it nears the edge (past half the half-frame) the aim turns smoothly towards it, rising a few frames before it is needed; any frame still past 82 % aims straight at it. On in the Beat Path base. Absent: off (as before). |
| `followHeight` | optional, `true` | The camera rises and aims with the subject's height (the walk path's `y`), so a figure in flight stays framed. Absent: it does not (as before). |

### `camera.segments[]`: shot, amount, lock

| Field | Limits | Meaning |
| --- | --- | --- |
| `shot` | `wide`, `medium`, `close`, `low`, `top` | Framing preset for distance, height and fov (wide 7 m, 1.6 m, 40°; medium 4.2 m, 1.35 m, 35°; close 2.6 m, 1.5 m, 30°, aimed at the chest; low 3.4 m, 0.35 m, 42°; top 1.4 m, 6.5 m, 45°). Eased in over the block's first beat (half the block if shorter); a block without a shot keeps the values it started with, so nothing jumps. |
| `cut` | true | Switch to the shot (and a rise's start height) on the block's first frame instead of easing. |
| `amount` | orbit -1440 to 1440°; pushIn, pullOut 0–20 m; truck -20 to 20 m (+ right); rise -10 to 10 m (jib up or down) | A programmed move, eased in and out over the block, ignoring the energy: an orbit of 360 over 4 beats ends exactly 360° on. The block holds exactly one of orbit, pushIn, pullOut, truck, rise (a follow rig or top may share it). `truck` needs one. |
| `from`, `to` | rise: heights 0.05–30 m; pushIn, pullOut: `to` an end distance 0.5–30 m | Instead of an amount: rise from one height to another, or push in or pull out to a distance. |
| `lock`, `strength` | `beat`, `kick`, `snare`, `hat`; 0–1 (default 1) | Beat lock on the block. A programmed move arrives at evenly spaced stations on each locked hit and holds briefly, still ending on its exact amount; an energy-driven move stops for the hold instead, and so does a `path` block (since 12 November 2026; before, a lock on a path block did nothing). Strength 0 is exactly the unlocked block. A hit within a quarter beat of a block's edge is not a station (a block starting on a kick would otherwise jump). |
| `shoulder` | `true`, with `chase` | Over the shoulder: the chase angle turned 0.38 rad to one side, half the distance, 0.4 m higher, the aim 0.55 m aside (eased in and out). Script `over shoulder`. |
| `pace` | `slow` or `fast` (absent: even) | How quickly the block reaches its target: a programmed move or a shot eases in early with `fast` (on the first locked hit when it falls in the block's first part), late with `slow`; energy-driven rates and the follow swing scale too. Script words `slow`, `even`, `fast`. |
| `onHit`, `punch` | `hold` (default) or `punch`; 0–3 m (default 0.4) | With `punch` each locked hit pushes the camera in by `punch` metres and back, instead of holding. |

The camera never goes above 8 m (`CAMERA_MAX_HEIGHT` in `camera.ts`): a top block, a shot, a rise, a drawn camera path or a height lane that asks for more is held there, and `describe` names what asked.

Which wins, per parameter and frame: an automation lane where it has points, then a programmed amount or shot, then the energy drive and the beat accents. The yaw lane is an offset in degrees added to the angle around the subject (held at its first and last value outside its points); the distance, height and fov lanes replace the value from their first point to their last. A block's shot, amount and lock stay in the recipe; `camera.json` in a bundle carries the resulting camera per frame and each range's beats and modes only.

## Shot script

The Action and Camera tracks as plain text, one row per block, readable aloud. It is a view of the recipe, never stored: `motion-studio describe <recipe> --script` (MCP `get_script`, the studio's Shot script panel) prints it; `motion-studio script <recipe> <file>` (MCP `apply_script`, command `applyScript`, the panel's Apply) turns it back into the recipe through the same edit commands. Printing an applied script gives the same script back (tested).

```
beats 0-8   | action: run on path lock kick 0.5 | camera: chase     | shot: wide
beats 8-10  | action: jump @snare 1            | camera: orbit 360 | shot: medium
beats 10-12 | action: rest                     | camera: top       | shot: wide
beats 12-16 | action: run                      | camera: chase lock snare punch 0.4m | shot: close
```

- A row is `beats A-B` and then `|`-separated columns `action:`, `camera:`, `shot:` in any order; `#` starts a comment. Rows are in order and do not overlap; beats past the last row rest and hold the camera. The script replaces the move blocks, the edited hit markers and the camera blocks; everything else (grid, character, rig numbers, lanes, envelope) stays.
- A left-out column, or the word `continue`, runs the block from the row above on (one block over several rows). `rest` leaves the Action track empty there.
- **action:** a move word, then optionally `on path` and `lock <beat|kick|snare|hat> [strength]`, then accents after commas. Move words: `walk`, `run`, `jog`, `sprint`, `idle`, `dance`, `crouch`, `sneak` on the rigged mannequin; `walk`, `run`, `jog`, `idle`, `dance`, `bounce`, `clap`, `punches`, `disco` on the procedural figures; any exact clip or library move name works too (`Walk_Loop`, `stepTouch`). `glide on path` slides along the walk path with no gait. `on path` re-times the drawn walk path onto the row's block (one block per script) and, with a lock, sets the travel lock too. Points after `on path` give the walk path instead of drawing it: `glide on path (0,0) (2,0) (2,3,1.5)`, each `(x,z)` or `(x,z,height)` in metres (x right, z towards the front camera, height for a glide that rises), 2–63 points, straight between them and spaced in time by distance (`setRootPath` with `smooth: false`). A script always prints the walk path's points, so it stands on its own: a path of up to 24 points prints as stored; a longer (drawn) one is thinned (Ramer–Douglas–Peucker over x, z and height, keeping the first and last point, the tolerance doubling from 2 cm until at most 24 points are left) and printed to the centimetre. Applied to an empty recipe, the printed path reproduces the drawn one to within 15 cm at every beat (tested on a 200-point stroke); from the second pass on, script and recipe stay the same. Plain `on path` with no points still means "the walk path already in the recipe". The camera path always fits (at most 12 points) and prints as stored. An accent is `<accent> @<kick|snare|hat> N` (the Nth onset inside the row, counted from 1) or `@beat B`; accents are `hit`, `point`, `strike`, `kick`, `jump`, `spin`, `jab`, `cross`, `sword`, `roll`. A row of accents only rests under them; an accent word with no anchor lands in the middle of the row.
- **camera:** `path (x,z,height) (x,z,height) …` gives the camera path in metres (2–12 points, `setCameraPath`); later `path` blocks reuse it, and a `path` block with no points needs one already in the recipe. Otherwise moves joined by `+`, then optionally `lock <target> [strength] [hold | punch [Nm]]` and a start `@snare N` (the block starts on that onset, as `startCameraMove`). Moves: `static`, `fixed`, `path`, `orbit [degrees]`, `chase`/`follow behind`, `lead`/`follow front`, `side`/`follow side`, `three-quarter`, `top`, `dolly in Nm`, `push in [to Nm]`, `dolly out Nm`, `pull out [to Nm]`, `truck left|right Nm`, `rise [Am to] Bm`, `rise to Bm`, `jib up|down Nm`, `rise` (energy-driven).
- **settings line:** `landmarks: on seed 7` or `landmarks: off`, anywhere in the script (not a row): turns the landmark blocks on or off. `printScript` prints it first when the recipe has `landmarks`; a script without it leaves the setting as it was.
- **corners:** a path given by points may end with `corners N` (0–1): `walk on path (0,0) (4,0) (4,4) corners 0.6`, `camera: path (6,3,1.8) (2,8,2.2) (-3,4,1.8) corners 0.4`. 0 keeps straight segments (the figure and the camera turn hard at each point), 1 rounds every corner until the rounds meet half way along each segment (`packages/core/src/corners.ts`). It is stored as `rootShape` and `camera.corners` and printed back after the points. Without it a walk path given by points is straight between them and a camera path is the smooth spline, as before.
- **Beat Path additions (13 November):** camera words `over shoulder` (or `shoulder`) and `above` (`go above`: the top view, eased in); a pace word `slow`, `even` or `fast` anywhere in a camera cell; `A then B` chains up to four moves in one block, split evenly or onto a locked hit within a quarter of the even cut (the lock at the end applies to all); `at 2s` starts a camera block at that time (it holds until then); the action word `freeze`; a row may be written in seconds (`seconds 0-2 | …`), converted through the tempo (printing is always in beats). Settings lines (not rows): `landmarks: on seed 7` / `off`, `muted: 1.6 2.35`, `figure: body #e8632a head #f2a35e`, `shot subject|environment|action|legend: …`.
- **shot:** `wide`, `medium`, `close`, `low`, `top`, optionally followed by `cut`; `-` for none. It belongs to the row that starts the camera block.
- Unknown words fail with the list of valid ones. There is no fall move in the library: a script that says `fall` is refused; use `rest` (or a crouch) and say so.
- Printing names an accent by the first band it sits on (kick, then snare, then hat), so `@snare 1` on a beat that is also a kick reads back as `@kick N`; a rest that runs over several rows reads `rest` on each.
## `reactive`

| Field | Limits | Meaning |
| --- | --- | --- |
| `seed` | whole, 0–2147483647 | The same seed gives the same performance (accent picks, variation). |
| `speed` | 0–1 | How far energy changes tempo: per bar, quiet half time, loud double time, within the loop's allowed rates. |
| `amplitude` | 0–1 | How far energy scales movement size. |
| `drive` | optional, 0–1.5 (default 1) | Master amount on `speed` and `amplitude`; it also sets how snappy the steps are when loud. |
| `accents` | up to 8 accent keys | Accents picked (seeded) on each detected hit: `hit`, `point`, `strike`, `kick`, `jump`, `spin` (procedural), and `jab`, `cross`, `sword`, `roll` (rigged clips; `jump` and `spin` play on both). |
| `accentOn` | `downbeats`, `onsets` or `both` | What counts as a hit. |
| `accentGapBeats` | 0.5–16 | Minimum beats between two detected accents. |
| `onsetThreshold` | 0–1 | Onsets weaker than this (relative to the strongest) are not hits. |
| `idleBelow` | 0–1 | Bars quieter than this settle to idle (0 = never). |
| `humanise` | 0–1 | Overlapping action (spine, head and arms trail the hips) and small seeded variation. |
| `markers[]` | optional, up to 512 | Edited hits. When present they replace detection entirely (below). |
| `sync` | optional object | Per-bone sync for dance: additive layers on top of the rigged mannequin's clips, each an amount 0–1: `head` (nods onto every beat, bigger when loud), `shoulders` (shrug on onsets such as snares and claps, or on the backbeat without a track), `arms` (pump forward with the shoulders, a frame later), `hips` (drop and sway on each beat, as strong as the kick and bass there; the knees take the drop so the feet stay planted). Added 11 November 2026. |

### `reactive.markers[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `seconds` | 0–3600, not decreasing | Time of the hit: the accent's key frame (landing, impact) lands here. |
| `accent` | an accent key | What plays on the hit. |
| `source` | `onset`, `downbeat` or `manual` | Where the marker came from (colour in the timeline). |
| `phases` | optional, 2–16 values, strictly increasing, -16 to 16, must contain 0 | Retimed phase boundaries in beats from the hit, one more than the accent has phases; 0 is the key frame. Missing: the accent's defaults at this tempo. |
| `skip` | optional, distinct phase indices 0–15 | Phases deleted with their neighbours closing the gap: a phase before the key frame pulls the earlier phases later, one after it pulls the later ones earlier, so the key frame stays on the hit (Delete in the timeline). Skipping every phase deletes the marker instead. |
| `hold` | optional, distinct phase indices 0–15 | Phases held: the phase keeps its time, the clip freezes on the phase's first frame, and a spin does not turn (Shift-Delete in the timeline). |
| `impact` | optional, 0–1 | "Hit harder": the strike goes past its key pose (overshoot towards the pose it was heading for, a deeper squash on a landing with the planted foot kept where it was) and the impact frame holds for up to 3 frames before the follow-through. Set in the marker inspector; drawn as a red wedge on the key frame. |

The wind-up ("anticipation") has no field of its own: it is the span from the accent's first boundary to the start of its strike (contact phase) in `phases`. The marker inspector sets it in beats (snapped to the step division) or frames, and Shift-dragging the accent's start edge in the phase lane scales it; the strike and the key frame stay on the hit.

`skip`, `hold` and `impact` were added on 11 November 2026. They are optional, so recipes without them are unchanged, but a reader built before that date refuses a recipe that has them.

## `steps`

`{ division: 4 | 8 | 16, amplitude: [...] }`: one amplitude (0–1.5) per 1/4, 1/8 or 1/16 note, exactly `ceil(durationBeats × division / 4)` values. Sets how big the rigged mannequin moves on each step, against its idle pose (0 idle, 1 as authored). Missing: amplitude follows the energy.

## `energyCurve`

`{ rate: 1–60, values: [...] }`: energy (0–1) sampled `rate` times a second from time 0, 2 values up to ten minutes. Replaces the analysed energy for tempo, amplitude, accents and the camera. Drawn with the timeline's pencil or point handles; "Reset energy" removes it.

## `envelope`

`{ points: [[frame, value], ...] }`: the amplitude envelope (the Action track's automation lane), 1–8192 breakpoints with straight lines between them, frames whole and increasing, values 0–3 (1 = as authored). Before the first point and after the last the value holds. It multiplies every move's size on that frame: the pose angles of the procedural figures, the clip amplitude of the rigged mannequin. A freehand stroke is stored as the fewest breakpoints within 0.01 of it. Missing: 1 on every frame.

The camera lanes (`camera.lanes`) use the same shape and the same commands (`paintEnvelope`, `drawEnvelope`, `setEnvelopePoints`, `setEnvelopePoint`, `removeEnvelopePoint`, `clearEnvelope`, each with `lane`: `distance` 0.3–30 m, `height` 0.05–30 m, `yaw` -720 to 720°, `fov` 10–100°). An edit on a camera lane covers only the frames it touches, so a stroke never spreads an override over the whole clip.
