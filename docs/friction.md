# Friction log

One row per platform friction met while building or running Motion Studio.

| Date | Platform | What happened | Workaround |
| --- | --- | --- | --- |
| 2026-11-11 | Runware LTX (via model-arena's model table) | The brief named LTX camera presets as "dolly, jib, static, focus shift"; the values model-arena lists are directional: `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `static`, `focus_shift`. model-arena also notes LTX refuses `cameraMovement` when `inputs.audio` is sent. | `camera.json` suggests the nearest directional value, marked approximate, with the note. Not checked against Runware's live schema (no paid or network call). |
| 2026-11-11 | Guide-bundle schema (model-arena) | A camera track needs a new manifest key; the pinned 0.1.0 schema forbids unknown keys, so a 0.1.0 reader rejects a bundle that has one. | Bumped the pinned copy to 0.2.0 with the field optional; bundles exported without the rig are unchanged. model-arena's schema must be re-synced. |
| 2026-11-11 | Headless Chrome (playwright) | The recipe JSON textarea sits in a closed `<details>`, so `page.fill` times out on a hidden element. | `scripts/examples.mjs` sets the value and presses Apply through the DOM. |
