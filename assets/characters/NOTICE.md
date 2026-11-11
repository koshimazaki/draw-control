# Bundled character: rigged mannequin

`AnimationLibrary.glb` is the rigged mannequin and animation library from
[Ecctrl](https://github.com/pmndrs/ecctrl), as reused in Genobi and Holodeck
(copied unchanged from `genobi/public/world-assets/AnimationLibrary.glb`).

- Model and file: Ecctrl, copyright (c) 2023–2026 Erdong Chen, MIT; see `ECCTRL-LICENSE.txt`.
- Character animations are based on the Quaternius Universal Animation Library (CC0),
  as recorded in the [upstream NOTICE](https://github.com/pmndrs/ecctrl/blob/main/NOTICE).

Contents: one skinned mesh `Mannequin` on a Rigify-style `DEF-` skeleton (53 bones,
with fingers) and 46 clips (Dance_Loop, Idle_Loop, Walk_Loop, Jog_Fwd_Loop,
Sprint_Loop, Jump_Start / Jump_Loop / Jump_Land, Roll, Punch_Jab, Punch_Cross,
Sword_Attack and more). No Draco compression.

SHA-256: `1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c`

Clip timing used by the engine (steps, contact and impact frames) was measured with
`scripts/analyse-clips.mjs`; see `packages/core/src/clip-library.ts`.

Every exported guide lists this character's licence in `meta.json`.
