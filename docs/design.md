---
tags: [design, beat-path, tokens, themes]
summary: The Draw Control page's small design system (tokens and plain components), its two themes, where every Runware value comes from, and the fixed colour coding of the exported guide.
---

# Draw Control design system

Lineage, in three lines:
- **Structure** from the owner's own UI: the studio's layout habits (side panel of few controls, lanes under the waveform, uppercase small labels) and the earlier composer's lane ideas.
- **Colour, type and radius** of the `runware` theme from Runware's public site and docs CSS (values and sources below).
- **New here**: the map (pen, corners, top and side views), the lane blocks and their menus, the beat HUD and the guide's colour coding.

**Round 3 (13 November), where each part came from:**
- *Positioning* from the owner's camera tool (camera-director, read only): a top bar with the wordmark left and the key on the right, the key as its own entry rather than a form on the page; a stage-and-prompt arrangement where the preview sits above the prompt card and the model and Generate share one toolbar row; bars stronger than beats in the timing grid. Not taken: its preset tab bar (this page has one view) and its modal-only key (the key panel mounts in the header).
- *Colour, type and radius* from Runware's public CSS (the dark theme below).
- *New here*: the preview and output side by side on one playhead with a divider, the reference drops beside the shot fields, Settings as one closed chevron, the lane lock chips, the scenery outlines on the map.

**Since 13 November the Runware theme is dark** (the site's own dark look), with the map as a light paper surface; since 15 November the Runware theme is the page's default (`?theme=neutral` gives the neutral palette, which stays dark: the studio's palette): one set of tokens, two palettes, and a third small set (`--map-*`) for the map's surface so it can differ from the page.

## Round 10 (15 November): Slice, Export, Smooth

- **Slice** and **Export** (`.track-acts`, two small `.btn.outline` with icons) sit under Sensitivity in the track panel, where the status line was. Slice makes the music inside the clip window the track (analysed again for hits, on the same beat grid: beat 0 at the cut's start, so the lanes stay on their music; not an undo step, as loading a track is not one). A sliced example keeps its cut while the page is open: switching away and back brings the cut, not its whole music, so its markers and switched-off hits stay on their hits; a reload brings the whole music back. Export saves that music as a 16-bit WAV through the browser's download, named from the track and the range, ready for *Your track*.
- **Smooth** (`.btn.ghost`, no icon) sits beside Corners on the map's tool row for the Subject and Camera tools: each press moves the picked points (two or more, a dragged box), else the whole path, half way towards the midpoint of their neighbours; the ends stay. One undo step a press.
- **Where messages go now.** The status line (`#status`, the notification row's green dot) is one line under the Generate row, the whole text on hover. The map's own hints (what a click on the map did) go to the line under the map (`#mapHint`) and stay there until the tool, view or pen changes or 8 s pass; where that line is hidden (a narrow map, the follow fields) they go to the status line.

## Moving a lane block (15 November)

A Character or Camera block is moved the way a clip is in a video editor: drag its body sideways (or Alt+Left/Right with it focused). It keeps its length and its word; the blocks it passes change places with it as soon as its leading edge crosses their middle, so the lane rearranges live while the moved block rides under the pointer, lifted (`.block.moving`, `--shadow-lg`), over a dashed slot (`.lane-slot`) where it will land. Release is one undo step; Escape, a drop back on its own place, a guide render starting while it is held (Generate, Download guide), or Cmd/Ctrl-Z (which then undoes nothing else) puts everything back with no undo step. A press that travels under 4 px is still a click (the menu), and the edge between two blocks still moves the cut. No new control: the block's tooltip says "drag to move". The reordering is `moveBlock` in `lane-cuts.ts`.

## Round 8 (13 November): selection corrections

- **Generate** is a normal primary button sized to its label (bolt + "Generate"); the model choice and Settings sit beside it.
- **Segmented controls** for tools, views, pens and the model show the selected one as **accent text** (the header balance's lime) over a **quiet neutral pill** (`--seg-on`); no accent fill. The **example switcher** (`.seg-fill`) keeps an accent pill with dark text.
- **Ruler fader** (`ui/fader.ts`, `.fader`) for the clip length, after Genobi's TickFader: a range input over a scale with one tick per second (3 to 30 s), taller ticks and labelled jump buttons at 5, 8, 10, 15, 20 and 30, the readout in seconds only (frames depend on each model's output rate; the guide itself renders at 24 fps; [models.md](models.md)). Past the chosen model's longest clip the scale is hatched; a clip beyond it turns the readout and the note under it `--warn`, and Generate stops before rendering the guide.
- **One sliding pill** per segmented control (`ui/seg-pill.ts`): an element under the selected button, moved by CSS (`transform`, 180 ms on the page's easing; none under `prefers-reduced-motion`). It follows class changes on the buttons and the control's size, so every control, including the follow Left / Right, gets it without its own code.
- Map: camera block labels move further out or to the other side so no two overlap; the tool row keeps one line from 1280 px (10 px side padding per segment, the map at least 500 px wide).

## Round 7 (13 November): components after Runware's dashboard

The component set follows Runware's dashboard as a complement to it (dark, panels a shade lighter than the page, 1 px `#333` borders, 6–8 px radius on controls, 12 px on cards). **This replaces round 5's "lime on Generate only": the accent marks whatever is selected.** The neutral theme keeps its own accent (yellow) through the same tokens.

| Component | Class | Treatment | Used for |
| --- | --- | --- | --- |
| Primary button | `.btn.primary` | accent fill, near-black text, medium weight, a line icon at the left | Generate (sized to its label since round 8, a bolt; a stop square while running), the cost dialog's Generate |
| Secondary button | `.btn`, `.btn.outline` | panel fill or none, 1 px border, white text, icon left | Your track, Download guide, lock buttons, Cancel, Slice, Export |
| Ghost button | `.btn.ghost` | no border, white text, icon left; disabled grey | Gallery, Get the code, Settings, No music, Clear, Smooth, zoom |
| Link that acts | `.link-act` | accent text and an arrow | Load into the editor, Reset markers |
| Segmented control | `.seg` | 1 px bordered container; selected = accent text on a quiet pill (round 8; the example switcher an accent pill) | examples, Subject/Camera/Blocks, Top/Side, Edit/Draw new, 5 s/8 s, the model, Left/Right |
| Toggle | `.toggle` | on = accent pill, "ON" in small dark capitals, a dark knob | Snap, Ground grid, Pass in front |
| Selected item | `.is-selected`, `.menu button.on`, `.block.open`, `.chip[aria-expanded=true]` | accent text, 1 px accent outline with a faint glow, a tinted fill (`--sel-bg`, `--sel-glow`) | the chosen menu item, the lane block whose menu is open, the open lock chip |
| Badge / tag | `.badge`, `.badge.tag` | mono capitals in a 1 px grey outline; a tag in the accent on a tint | the figure shape in each gallery row |
| Section heading | `.lab` | mono capitals, dim | Settings rows (Clip, Locks, Guide, Figure, Guide file) |
| Input | `.field`, `.unit-field` | a shade lighter than the panel, 1 px border, the unit in grey inside | shot fields, follow distance / height / angle, box height |
| Card | `.panel`, `.gallery-row` | 1 px border, 12 px radius | map pane, gallery rows, menus, popovers |
| Notification row | `.compose .status` | a small green dot, then the text, one line under Generate (round 10) | the status line |
| Icons | `ui/icons.ts` | 16 px line icons, 1.5 px stroke, the control's colour | the actions above |

**Icons** are Lucide's shapes (lucide.dev), ISC licence: "Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022." Permission to use, copy, modify and distribute with or without fee is granted under the ISC terms. The set: zap, plus, download, upload, layout-grid (gallery), code, key-round, chevron-down/right, trash-2, undo-2, sliders-horizontal, arrow-right, arrow-up-right, music, film, image, x, arrow-left-right (swap), square, scissors. No Runware icon, logo or wordmark is used.

**On the paper map** the accent lime has too little contrast (1.2:1 on the paper), so the map's own selection (the selected scenery block and its corner handles) uses `--map-select`: a deep green `#2f6b23` (4.8:1 on the `#dcdde0` sheet) in the Runware theme, the accent in the neutral theme's dark map. Paths keep their own colours.

**Type.** One sans face for all interface text (the header's: Figtree in the Runware theme, the system face in neutral); mono for numbers, readouts (HUD, time, lock values), badges and the Settings section headings.

**Not taken.** Keycap chips on Generate (the page has no Generate shortcut; behaviour is unchanged); required asterisks and info icons on field labels (the shot fields carry placeholders, not labels, to keep one screen); an icon tile on each gallery card.

## Round 5 (13 November): re-based on the owner's post draft

The `runware` theme now follows **the owner's post draft** (a private blog draft; only its visual system is taken, none of its text) first and runware.ai's CSS second: where they differ, the draft wins. The draft itself reads its tokens from the Runware blog, so most values agree; the differences are below.

| Token here | Value | From the owner's post draft | Was (site) |
| --- | --- | --- | --- |
| `--bg` | `#1a1a1a` | `--background` | same |
| `--surface`, `--popover` | `#1c1c1c` | `--card` | same |
| `--surface-2`, `--block-bg` | `#292929` | `--muted` (chips, code, tiles) | `#252525` |
| `--surface-sunk` (fields) | `#2e2e2e` | `--input` | `#1b1b1b` |
| `--border`, `--seg-on` | `#454545` | `--border` | `#393939` |
| `--text` | `#f2f2f2` | `--foreground` | same |
| `--text-muted` | `#d9d9d9` | `--muted-foreground` (secondary text) | `#9a9a9a` |
| `--text-dim` (labels, placeholders) | `#8f8f8f` | the draft's dim `#6b6b6b`, lifted to 4.5:1 on `#1c1c1c` at 12 px | new |
| `--accent` (Generate only) | `#afff9f` | `--primary` | same |
| `--accent-hover` | lime at 60 % | `.btn:hover` (`color-mix(primary 60 %, transparent)`) | `#90f77c` |
| `--rail-fill` | `#4f8a44` | the rail's fill `--accent #345c2d` and its edge `#4f8a44` (the edge colour, so a 1 px line reads on video) | new |
| `--rail`, `--rail-dot` | `#454545`, `#f2f2f2` | `.rail-line` border colour; the rail dot (lime in the draft, light here: lime is Generate's) | new |
| `--warn` | `#ffff7d` | `--yellow` | new |
| `--radius-sm` / `-md` / `-lg` | `5px` / `8px` / `12px` | chips 5 px, buttons and tiles 8 px, cards 12 px | `4.2` / `5.6` / `7px` |
| `--text-xs` / `-sm` / `-md` / `-lg` | `12` / `13` / `14` / `15px` | labels and chips 12, small text 13, table and controls 14, body 15 | `11` / `12` / `13` / `15px` (neutral keeps these) |
| `--control-h` | `32px` | between the draft's 28 px list buttons and 36 px call to action; one screen at 1280×720 | `30px` |
| fonts | Figtree, JetBrains Mono | the draft's faces (both OFL, Google Fonts) | same |

**Player.** The draft's player is a dark glass circle (black at 50 %, a 1 px white ring at 20 %, a 4 px blur) with a filled rounded-triangle play glyph, bottom left over the frame; its timeline is a 1 px rail with a deep green fill and a 7 px dot; numbers sit in 12 px mono. Draw Control uses exactly that: one slim bar over the bottom of the screens (shown while paused, on hover, on keyboard focus), the same button for the dock and the gallery rows in a quiet outlined form. The big Play overlay is gone; a click on the picture toggles. Glyph shapes after Lucide's play and pause (ISC).

**Hierarchy (superseded by round 7: the accent now marks the selection).** Lime is Generate's alone. Selected segments, toggles, slider thumbs, the playhead, the focus ring, menu ticks, lock chips and the key dot read in text colours (the connected key dot in the rail green). Mono is kept for numbers and beat readouts (HUD, time, lock values, slider values, map distances); typed camera phrases and labels use the sans face. Uppercase labels follow the draft's kicker: 12 px, `.05em`.

**Rhythm.** One 4 px scale (`--s-1` … `--s-6`); the page gap is `--s-4` and the side padding `--s-5`. The right column has two rows (screens, shot fields): the screens fill the flexible row and each picture keeps 16:9 inside it by container units, so nothing jumps when a result arrives or the divider moves. The map pane has three rows (tool row, canvas, a fixed-height footer).

**Map.** Distance labels on the top and left edges, spaced 2 to 64 m so they never touch, with a halo of the paper colour; camera block labels in the sans face with the same halo. Truncated text (shot fields, the prompt line, the map hint, lane blocks) shows in full on hover.

**Favicon and header mark.** A short curved path with two beat ticks and a dot travelling it, lime on the page's dark square (`public/icons/beat-path.svg`, a 32 px PNG fallback beside it); the header mark is the same drawing.

## Files

| File | What |
| --- | --- |
| `packages/studio/src/beat-path/ui/components.css` | Scales (type, spacing, motion) and the components: button (`.btn`, `.primary`, `.ghost`, `.outline`, `.overlay`), play button (`.play-btn`, `.quiet`; glyphs in `ui/glyph.ts`), segmented control (`.seg`), slider (`.slider`), toggle (`.toggle`), menu (`.menu`), lane and lane block (`.lane`, `.block`), panel (`.panel`), tooltip (`[data-tip]`), dialog. Every state: hover, `:focus-visible` (a 2 px ring in `--ring`), active (1 px press), disabled (45 % opacity). Transitions 120–200 ms on one easing. |
| `themes/neutral.css` | `?theme=neutral`: unbranded, the studio's dark palette. |
| `themes/runware.css` | The default since 15 November (`?theme=runware` still works): dark, the owner's post draft's tokens (above), lime for Generate only, Figtree. Loads Figtree and JetBrains Mono from Google Fonts only in this theme. |
| `beat-path.css` | The page layout; tokens and components only. |

Switch: since 15 November the Runware theme is the default (`data-theme="runware"` on `<html>`), because the page is a demo for Runware; `path.html?theme=neutral` gives the neutral palette. Both theme files are bundled. The map sheet is light grey (`#dcdde0`, owner's call: not white), so it reads apart from the dark page without glare. The Runware theme adds the footer-style line "Built on Runware · unofficial demo" in the header; there is no Runware logo, wordmark or favicon anywhere.

## Runware dark theme (13 November): values and sources (partly superseded by round 5 above)

From `https://runware.ai/` `:root` custom properties (its dark site theme), read 12 and 13 November 2026.

| Token here | Value | Source |
| --- | --- | --- |
| `--bg` | `#1a1a1a` | runware.ai `--background` |
| `--surface`, `--popover` | `#1c1c1c` | `--card`, `--popover` |
| `--surface-2` | `#252525` | `--rw-neutral-90` |
| `--surface-sunk` | `#1b1b1b` | `--rw-black` / `--rw-neutral-100` |
| `--surface-hover` | `#2e2e2e` | `--input` / `--rw-neutral-80` |
| `--seg-on`, `--border` | `#393939` | `--rw-neutral-70` |
| `--border-strong` | `#585858` | `--rw-neutral-50` |
| `--text` | `#f2f2f2` | `--foreground` |
| `--text-muted` | `#9a9a9a` | `--rw-neutral-30` |
| `--accent`, `--accent-ink`, `--ring` | `#afff9f` | `--rw-green-base` (`--primary`, `--ring`) |
| `--accent-hover` | `#90f77c` | `--rw-green-mid` |
| `--on-accent` | `#1c1c1c` | `--primary-foreground` |
| kick, snare, paths on the dark page | `oklch(82% .12 20 / 300 / 40 / 240)` | docs.runware.ai `--color-red`, `--color-violet`, `--color-orange`, `--color-sky` |
| `--map-bg` (paper) | `#dcdde0` | light grey, the owner's call on 15 November (was `#f2f2f2`, `--rw-neutral-5`) |
| map grid | `#cfd0d4`, `#b9bbc0`, axes `#8a8d93`, labels `#4f5257` (15 November) | `#c9c9c9` `--rw-neutral-20`, `#9a9a9a` `--rw-neutral-30`, `#6b6b6b` `--rw-neutral-40`; `#e1e1e1` between neutral-10 and -15 |
| paths on the paper | `oklch(52% .12 40 / 240 / 20)` | docs `--color-orange-deep`, `--color-sky-deep`, `--color-red-deep` |

Contrast on dark: body text `#f2f2f2` on `#1a1a1a` 15.5; muted `#9a9a9a` on `#1a1a1a` 6.2; text `#1c1c1c` on the green `#afff9f` 14.3. On the light grey sheet (`#dcdde0`, 15 November): labels `#4f5257` 5.8, the map selection `#2f6b23` 4.8.

## Runware light values (12 November, superseded by the dark theme above)

Read 12 November 2026 from `https://runware.ai/` (Next.js stylesheets `/_next/static/immutable/chunks/*.css`, the `:root` custom properties) and `https://docs.runware.ai/` (inline `--color-*` properties of its light and dark themes).

| Token here | Value | Source |
| --- | --- | --- |
| `--accent` | `#afff9f` | runware.ai `--rw-green-base` (= `--primary`, `--ring`); docs `--color-accent` |
| `--accent-hover` | `#90f77c` | runware.ai `--rw-green-mid`; docs `--color-accent-mid` |
| `--accent-ink`, `--ring` | `#345c2d` | runware.ai `--rw-green-deep` (= `--accent`); docs `--color-accent-deep`: the green as text and focus ring on white |
| `--on-accent` | `#1c1c1c` | runware.ai `--primary-foreground` |
| `--bg` | `#fbfbfb` | runware.ai `--rw-white` / `--rw-neutral-0`; docs `--color-white` |
| `--surface`, `--popover` | `#ffffff` | docs `--rw-light-bg` |
| `--surface-2` | `#f2f2f2` | runware.ai `--rw-neutral-5` |
| `--surface-sunk` | `oklch(96.48% 0 0)` | docs `--color-neutral-100` |
| `--surface-hover` | `oklch(91.8% 0 0)` | docs `--color-neutral-200` |
| `--border` | `#e8e8e8` | runware.ai `--rw-neutral-10` |
| `--border-strong`, `--wave` | `#c9c9c9` | runware.ai `--rw-neutral-20` |
| `--track` | `#d9d9d9` | runware.ai `--rw-neutral-15` |
| `--text` | `#1b1b1b` | runware.ai `--rw-black`; docs `--color-black` |
| `--text-muted` | `oklch(52.34% 0 0)` | docs `--color-text-quiet` (light) = `--color-neutral-700` |
| `--danger`, `--kick`, `--station` | `oklch(52% .12 20)` | docs `--color-red-deep` |
| `--snare` | `oklch(52% .12 300)` | docs `--color-violet-deep` |
| `--camera` | `oklch(52% .12 240)` | docs `--color-sky-deep` |
| `--subject` | `oklch(52% .12 40)` | docs `--color-orange-deep` |
| `--radius-lg` / `-md` / `-sm` | `7px` / `5.6px` / `4.2px` | runware.ai `--radius: 7px`, `--radius-md: calc(var(--radius)*.8)`, `--radius-sm: calc(var(--radius)*.6)`; docs `--border-radius: 8px` |
| `--radius-pill` | `999px` | runware.ai markup: `rounded-full` on pill buttons (18 uses); buttons `rounded-lg` |
| `--font-sans` | Figtree, 400 / 500 / 600 | runware.ai `--font-sans: var(--font-figtree)…`, weights `--font-weight-normal/medium/semibold` |
| `--font-mono` | JetBrains Mono | runware.ai `--font-mono: var(--font-jetbrains-mono)…` |
| headings | Figtree | runware.ai `--font-heading: "coxx"` with Figtree as its own fallback; Coxx is a licensed face served from their site, so it is not used or downloaded |

Figtree and JetBrains Mono are SIL Open Font Licence faces on Google Fonts. The supporting colours (kick, snare, the two paths) are three of the docs' own `oklch(52% .12 hue)` family, so they sit with the green; no new hues were invented. The site's main look is dark (`--background: #1a1a1a`); the docs' light theme gives the lighter, rounder, more minimal page the owner asked for, with the site's green and radius.

Contrast (WCAG ratio): text `#1c1c1c` on the green `#afff9f` 14.3, on `#90f77c` 12.8; the green ink `#345c2d` on white 7.7; body `#1b1b1b` on `#fbfbfb` 16.6. Neutral theme: `#17181b` on `#ffd34d` 12.4, text on background 15.4, muted 6.3.

## The guide's colour coding (fixed, separate from the UI theme)

The exported clip shows only:
- the **subject**: one flat orange (`#ff6a13`, pyramid and floating sphere) with a **white front marker** (the pyramid's front face and the sphere's nose);
- the **ground**: a dark floor (`#23262b`) with lighter lines, 1 m cells (`#464b53`) and bolder 4 m sections (`#737882`), fading into a dark horizon (`#16181b`, also the background) about 34 m out; a shader grid (`ground-grid.ts`, adapted from drei's `Grid`, MIT) that follows the camera, so it never ends, and drops the 1 m cells where they would shimmer. "Grid" turns it off;
- the **landmarks**: neutral grey blocks (boxes `#a7aaaf`, tall pillars `#c3c5c9`, low walls `#8f9297`) with a soft contact shade, about 14 of them, placed from the recipe's seed clear of the subject's travel, the camera's path and the line of sight between them (and the space just behind the figure); "Landmarks in export" turns them off;
- a soft contact shadow under the figure.

Nothing else: no paths, ticks or helpers. A prompt can say "the orange figure", "its white front", "the grey blocks", "the grid is the ground".

Chosen by frame sheets of the four examples (`out/peek-lm/`): on the dark ground the orange figure and the grey blocks both separate clearly and the 4 m lines give a strong perspective cue; the light ground (`?ground=light` on the page) was flatter, with the blocks close to the floor's value. Without landmarks a follow camera kept the figure centred with only a faint grid sliding under it; with them every still shows where the figure is and how the camera moves. (A second, smaller follower figure in another fixed colour was planned and is not built.)
