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
| `energy` | 0–2 | Global multiplier on every phase amplitude (procedural figures). |
| `moves` | list, up to 128 | Moves on the beat grid, in strictly increasing `atBeat` (below). |
| `rootPath` | list, 1–64 points | Where the character stands and faces over time (below). |
| `jumps` | list, up to 64 | Programmed root lifts (below). Accent jumps on markers are separate. |
| `audio` | optional object | `name` (up to 120 characters) and `licence` of the track. The audio itself is never stored. |
| `camera` | optional object | The audio-reactive camera rig, used by the "rig" view and the export (below). |
| `reactive` | optional object | The audio-reactive animation layer and its hit markers (below). |
| `steps` | optional object | Amplitude per step for the rigged mannequin (below). |
| `energyCurve` | optional object | A hand-drawn energy curve that replaces the analysed one (below). |

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
| `kind` | `rigged` (the bundled rigged mannequin, clip-driven, the default), `mannequin` (procedural fallback), `block` (procedural block figure) or `file` (a GLB or FBX loaded from disk, never bundled). |
| `name`, `licence` | Up to 120 characters each; travel into the bundle metadata. |

## `moves[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `id` | up to 40 characters, unique | Stable handle for edits and agents. |
| `name` | up to 60 characters | Shown on the move lane. |
| `atBeat` | whole beat inside the recipe | Where the move starts. A move plays until the next one starts. |
| `blendBeats` | 0–8 | Crossfade from the move before, in beats. The rigged mannequin never blends faster than 6 frames (so 0 means "the shortest blend", not a cut); the move lane's handle and the inspector edit it in frames, 6–24. |
| `loop` | true or false | Repeat the phases until the next move. |
| `phases` | 1–32 | The move's phases (below). Clip moves carry one phase, the clip's cycle. |
| `clip` | optional, up to 120 characters | Clip name: a loop of the rigged mannequin (`Idle_Loop`, `Dance_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`, `Sword_Idle`, `Spell_Simple_Idle_Loop`) or an embedded clip of a loaded file. |
| `clipCycleBeats` | optional, 0.25–64 | Beats one pass of a file clip is stretched to. Loops of the rigged mannequin are time-warped so each step lands on a beat instead. |

Transitions between rigged loops: a gait (walk, jog, sprint, crouch walk) that follows a gait starts on the foot the old one steps with next. See `packages/core/src/transitions.ts`.

### `moves[].phases[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `name`, `caption` | up to 40 and 120 characters | Shown in the caption and the beat strip. |
| `pose` | a pose name from `packages/core/src/poses.ts` | Target pose reached at the end of the phase (procedural figures). |
| `amplitude` | 0–2 | 0 rest, 1 as authored, 2 doubled. |
| `length` | `{ "beats": 0.125–64 }` or `{ "frames": 1–2400 }` | Phase length. |
| `previewFps` | 12, 18, 24, 30 or 60 | Below 24 the phase steps (held frames) for a stop-motion look. |
| `expression` | optional: neutral, smile, surprised, angry, sad, focused | Reserved for faces; validated and exported, not rendered yet. |

## `rootPath[]` and `jumps[]`

- `rootPath[]`: `{ beat, x, z, yaw }`. Beats strictly increase, inside the recipe; `x` and `z` from -100 to 100 metres; `yaw` from -720 to 720 degrees. Linear between points, held after the last. The rigged mannequin's clips stay in place, so travel comes only from here.
- `jumps[]`: `{ atBeat, durationBeats 0.125–16, height 0–3 }`: a programmed lift of the root.

## `camera`

| Field | Limits | Meaning |
| --- | --- | --- |
| `segments[]` | 1–32, in order, not overlapping | `{ fromBeat, toBeat, modes }`. Modes: `static`, `orbit`, `pushIn`, `pullOut`, `rise`, `lead`, `chase`, `path`. Several may share a range, except: `static` and `path` stand alone, `lead` excludes `chase`, `pushIn` excludes `pullOut`. Beats outside every range hold. |
| `intensity` | 0–1 | How strongly the music drives speed and accents (0: a plain programmed move). |
| `orbitDegreesPerBeat` | -45 to 45 | Orbit speed at mid energy; the sign is the direction. |
| `distance` | 1.5–12 m | Starting distance from the subject. |
| `height` | 0.2–6 m | Starting camera height. |
| `fov` | 15–80 degrees | Vertical field of view at 16:9. |
| `startYaw` | -360 to 360 degrees | Starting angle around the subject (0 = in front, on +Z). |
| `path[]` | optional, 2–32 points | `{ x, y, z }` in metres (`y` 0.1–30, the camera height) for the `path` mode; required when a segment uses it. |

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

### `reactive.markers[]`

| Field | Limits | Meaning |
| --- | --- | --- |
| `seconds` | 0–3600, not decreasing | Time of the hit: the accent's key frame (landing, impact) lands here. |
| `accent` | an accent key | What plays on the hit. |
| `source` | `onset`, `downbeat` or `manual` | Where the marker came from (colour in the timeline). |
| `phases` | optional, 2–16 values, strictly increasing, -16 to 16, must contain 0 | Retimed phase boundaries in beats from the hit, one more than the accent has phases; 0 is the key frame. Missing: the accent's defaults at this tempo. |
| `skip` | optional, distinct phase indices 0–15 | Phases deleted with their neighbours closing the gap: a phase before the key frame pulls the earlier phases later, one after it pulls the later ones earlier, so the key frame stays on the hit (Delete in the timeline). Skipping every phase deletes the marker instead. |
| `hold` | optional, distinct phase indices 0–15 | Phases held: the phase keeps its time, the clip freezes on the phase's first frame, and a spin does not turn (Shift-Delete in the timeline). |

`skip` and `hold` were added on 11 November 2026. They are optional, so recipes without them are unchanged, but a reader built before that date refuses a recipe that has them.

## `steps`

`{ division: 4 | 8 | 16, amplitude: [...] }`: one amplitude (0–1.5) per 1/4, 1/8 or 1/16 note, exactly `ceil(durationBeats × division / 4)` values. Sets how big the rigged mannequin moves on each step, against its idle pose (0 idle, 1 as authored). Missing: amplitude follows the energy.

## `energyCurve`

`{ rate: 1–60, values: [...] }`: energy (0–1) sampled `rate` times a second from time 0, 2 values up to ten minutes. Replaces the analysed energy for tempo, amplitude, accents and the camera. Drawn with the timeline's pencil or point handles; "Reset energy" removes it.
