---
tags: [design, beat-path, tokens, themes]
summary: The Beat Path page's small design system (tokens and plain components), its two themes, where every Runware value comes from, and the fixed colour coding of the exported guide.
---

# Beat Path design system

Lineage, in three lines:
- **Structure** from the owner's own UI: the studio's layout habits (side panel of few controls, lanes under the waveform, uppercase small labels) and the earlier composer's lane ideas.
- **Colour, type and radius** of the `runware` theme from Runware's public site and docs CSS (values and sources below).
- **New here**: the map (pen, corners, top and side views), the lane blocks and their menus, the beat HUD and the guide's colour coding.

**Since 13 November the Runware theme is dark** (the site's own dark look), with the map as a light paper surface; the neutral theme stays the repo default and stays dark (the studio's palette): one set of tokens, two palettes, and a third small set (`--map-*`) for the map's surface so it can differ from the page.

## Files

| File | What |
| --- | --- |
| `packages/studio/src/beat-path/ui/components.css` | Scales (type, spacing, motion) and the components: button (`.btn`, `.primary`, `.ghost`, `.outline`), icon button (`.icon-btn`, play and pause), segmented control (`.seg`), slider (`.slider`), toggle (`.toggle`), menu (`.menu`), lane and lane block (`.lane`, `.block`), panel (`.panel`), tooltip (`[data-tip]`), dialog. Every state: hover, `:focus-visible` (a 2 px ring in `--ring`), active (1 px press), disabled (45 % opacity). Transitions 120–200 ms on one easing. |
| `themes/neutral.css` | The default: unbranded, the studio's dark palette. |
| `themes/runware.css` | `?theme=runware`: light, lime accent, Figtree. Loads Figtree and JetBrains Mono from Google Fonts only in this theme. |
| `beat-path.css` | The page layout; tokens and components only. |

Switch: open `path.html?theme=runware`. The parameter sets `data-theme="runware"` on `<html>`; both theme files are bundled, the neutral one applies otherwise. The Runware theme adds the footer-style line "Built on Runware · unofficial demo" in the header; there is no Runware logo, wordmark or favicon anywhere.

## Runware dark theme (13 November): values and sources

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
| `--map-bg` (paper) | `#f2f2f2` | `--rw-neutral-5` (slightly greyer than white) |
| map grid | `#e1e1e1`, `#c9c9c9`, axes `#9a9a9a`, labels `#6b6b6b` | `#c9c9c9` `--rw-neutral-20`, `#9a9a9a` `--rw-neutral-30`, `#6b6b6b` `--rw-neutral-40`; `#e1e1e1` between neutral-10 and -15 |
| paths on the paper | `oklch(52% .12 40 / 240 / 20)` | docs `--color-orange-deep`, `--color-sky-deep`, `--color-red-deep` |

Contrast on dark: body text `#f2f2f2` on `#1a1a1a` 15.5; muted `#9a9a9a` on `#1a1a1a` 6.2; text `#1c1c1c` on the green `#afff9f` 14.3. On the paper: labels `#6b6b6b` on `#f2f2f2` 4.8, deep path colours about 5.

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
