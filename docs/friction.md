# Friction log

One row per platform friction met while building or running Motion Studio.

| Date | Platform | What happened | Workaround |
| --- | --- | --- | --- |
| 2026-11-11 | Runware LTX (via model-arena's model table) | The brief named LTX camera presets as "dolly, jib, static, focus shift"; the values model-arena lists are directional: `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `static`, `focus_shift`. model-arena also notes LTX refuses `cameraMovement` when `inputs.audio` is sent. | `camera.json` suggests the nearest directional value, marked approximate, with the note. Not checked against Runware's live schema (no paid or network call). |
| 2026-11-11 | Guide-bundle schema (model-arena) | A camera track needs a new manifest key; the pinned 0.1.0 schema forbids unknown keys, so a 0.1.0 reader rejects a bundle that has one. | Bumped the pinned copy to 0.2.0 with the field optional; bundles exported without the rig are unchanged. model-arena's schema must be re-synced. |
| 2026-11-11 | Headless Chrome (playwright) | The recipe JSON textarea sits in a closed `<details>`, so `page.fill` times out on a hidden element. | `scripts/examples.mjs` sets the value and presses Apply through the DOM. |
| 2026-11-11 | Mixamo (animation-only FBX) | The nine local clips are animation-only exports: 65 bones, centimetres, no mesh, so the character loader refused them ("no visible character"). Both skeletons bind in a T-pose (arm to hand horizontal), which the retarget relies on. | A dropped or picked FBX/GLB with a Mixamo skeleton and no skin is now retargeted onto the rigged mannequin as a clip (`mixamo/<name>`); a skinned file still loads as a character. |
| 2026-11-11 | Vite dev server | The studio now bundles `examples/recipes/*.json` for the sequence library, so `npm run examples` writing a recipe mid-run reloaded the page and the next export ran on the default recipe. | `scripts/examples.mjs` writes the recipes after all exports, and only when they changed. |

## Mixamo check, 11 November 2026

`npm run mixamo-check` retargets each clip in `assets-local/mixamo/` (never committed) onto the rigged mannequin and writes a front and side sheet, an MP4 (front view, one pass at the clip's own speed) and `metrics.json` to `out/mixamo-check/` (gitignored). All nine map 52 of 52 body and finger bones; the scale factor is 0.00879 (source hips 104.3 cm onto the mannequin's 0.917 m), so the source stands 1.60 m against the mannequin's 1.83 m and the limb proportions differ slightly. Arm directions match the source within 1 degree on every clip. Foot drift is the largest movement of a planted foot (within 3 cm of its lowest) on the mannequin, next to the same measure on the source scaled to it: the difference is what the retarget adds. In-place locomotion slides on a treadmill by design until the root path carries it.

| Clip | Foot sliding (mannequin / source) | Arm twist (wrist about forearm, max) | Hip height (rest 0.92 m) | Scale | Verdict |
| --- | --- | --- | --- | --- | --- |
| Backflip (2.2 s) | 1.9 / 3.3 cm | 76° (authored: hands flick on the take-off) | 0.57–1.26 m | ok | Usable as an accent. In place, so the backward travel of the source is gone and the flip turns on the spot; the apex sits at 1.26 m. |
| Breathing Idle (7.2 s) | 0.2 / 0.1 cm | 3° | 0.89–0.90 m | ok | Good. Clean idle, no slide. |
| Fireball (3.4 s) | 7.7 / 6.4 cm | 99° (authored: the casting hands roll over) | 0.74–0.83 m | ok | Usable. The stance turns the body about 60 degrees from the front view (authored); the planted feet slide 1–2 cm more than the source. |
| Flying (2.8 s) | 2.8 / 2.8 cm | 24° | 0.85–0.86 m | ok | Good: a horizontal flying pose held at hip height (about 0.85 m), arms out; the "foot drift" is the body bobbing, not a slide. It hovers low over the floor in place: lift the root for flight. |
| Idle (10 s) | 0.1 / 0.0 cm | 17° | 0.85–0.86 m | ok | Good. Hips 6 cm below the mannequin's bind pose (softer knees). |
| Ninja Idle (9.2 s) | 8.5 / 4.3 cm | 36° | 0.69–0.81 m | ok | Usable, with some slide: the wide, low stance doubles the planted-foot drift (about 4 cm added), because the mannequin's legs are proportionally longer than the hips ratio assumes. Foot IK would pin them. |
| Run (0.6 s) | 54.7 / 51.3 cm | 3° | 0.71–0.75 m | ok | Good as a loop; the treadmill slide is the source's (in place). Needs a root path at about the clip's speed for travel. |
| Standard Run (0.7 s) | 63.6 / 50.7 cm | 45° | 0.74–0.82 m | ok | Usable. The retarget adds about 13 cm of slide per stance (longer mannequin legs reach further); hip bob is larger than Run. |
| Walking (1.0 s) | 70.6 / 70.2 cm | 11° | 0.84–0.91 m | ok | Good. Slide matches the source (in place); arms and legs read naturally front and side. |

Next for Mixamo: foot IK (pin planted feet, scale stride to the mannequin's leg length) and a per-clip travel speed so in-place runs and walks travel on the root path; the arm twist values are carried from the source, so nothing to fix there.
