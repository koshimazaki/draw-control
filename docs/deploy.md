---
tags: [deploy, beat-path, static]
summary: How the Draw Control page is built as plain static files (Cloudflare Pages or any static host), served at the site root without the studio, and checked from a sub-path.
---

# Deploying Draw Control as static files

Draw Control needs no server: no API routes, no backend. Everything it uses is inside the build (the two examples and their presets are bundled from `examples/scripts/`; they play `public/tracks/neon-rain-loop.mp3` and `public/tracks/drum-n-bass.mp3`, copied into the build, and fall back to music generated in the browser). Generation runs in the visitor's browser with their own Runware key once the key and generate module is vendored (`packages/studio/public/vendor/`).

## Build

```bash
npm ci
npm run build:beat-path      # packages/studio/dist-beat-path/
```

`--mode beat-path` builds only the Draw Control page (the studio is not in this build), with relative asset paths (`base: "./"`), and renames its page to `index.html`, so it is the site root and works from any folder or sub-path.

## Cloudflare Pages settings

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build:beat-path` |
| Build output directory | `packages/studio/dist-beat-path` |
| Node version | 24 (`NODE_VERSION=24`, as in `.nvmrc`) |
| Root directory | the repository root |

No functions, no redirects and no environment variables are needed. The studio stays in the repository (`npm run dev`, then `/`) and is never part of this build.

## Check before deploying

```bash
npm run static-check
```

builds Draw Control alone, serves `dist-beat-path/` as plain files from `/some/sub/path/` with a tiny local file server, opens it in headless Chrome and fails on any 404, any page error, or if the first example's music does not load. Nothing is deployed by this repository's scripts.

## Published clips

A visitor without a Runware key still sees real model outputs in the Gallery: each example's model tiles are filled from `packages/studio/public/published/index.json`, which ships with the build. A visitor's own run for the same example and model replaces the published clip in their browser. The list is empty until clips are added; a missing list, a bad entry or a clip that fails to load shows "No clip yet".

```json
{
  "version": 1,
  "clips": {
    "flyer": {
      "kling-4": { "url": "published/flyer-kling-4.mp4", "prompt": "the prompt that was sent", "costUsd": 0.42, "seconds": 8 }
    }
  }
}
```

Keys are example ids (`flyer`, `runner`; `car` and `drone` left the page with Examples 3 and 4 on 15 Nov 2026, and an entry under them is dropped) and model ids (`kling-4`, `seedance-2.5`, `h3`). `url` is an http(s) link (Cloudflare R2, say) or a path relative to the page; `costUsd` and `seconds` (the clip's length) are optional. To add one:

```bash
npm run publish:clip -- flyer kling-4 ~/Downloads/take.mp4 --prompt "…" --cost 0.42 --seconds 8   # copies to public/published/flyer-kling-4.mp4
npm run publish:clip -- car h3 https://clips.example.com/car-h3.mp4 --prompt "…"                 # writes the entry only
```

The script refuses unknown example or model ids and only ever writes inside `public/published/`. It takes `.mp4` and `.webm` only (what every browser plays) and keeps one file per tile: publishing a tile again under another extension, or as a URL, removes the old copy. Cloudflare Pages refuses the whole deployment when any file is over 25 MiB, so the script refuses a larger local file before copying it: host that one on R2 and publish its URL instead (`--force` copies it anyway). Published clips stream from their link; they are not downloaded whole when the page opens. Commit `index.json` and any copied clip (`*.mp4` is allowed in that folder only). Run `npm run static-check` after adding a local clip: a listed file that is missing fails it.

### In the editor, and reference images

The same list fills the editor. When an example opens, the published clip for the chosen model shows beside the guide preview, and choosing another model shows that model's clip; the visitor's own result for a model takes its place. An example with no clip for the chosen model shows the preview alone.

The list can also name the reference images an example was made with. They load into the example's Character and Environment drops when the page opens, show in its Gallery row, and go out with a run like any reference. A visitor's own image is never replaced, and a published one they clear stays cleared. A clip made with other images names its own under `refs` in its entry; they show while its model is chosen.

```json
{
  "version": 1,
  "refs": { "runner": { "character": "published/runner-character.jpg", "environment": "published/runner-environment.jpg" } },
  "clips": {
    "runner": {
      "seedance-2.5": { "url": "https://…/skater.mp4", "prompt": "", "refs": { "character": "published/skater-character.jpg", "environment": "published/skater-environment.jpg" } }
    }
  }
}
```

Reference images are added by hand: put the file in `packages/studio/public/published/` (same origin, so the page can read it) and name it in `index.json`. `npm run publish:clip` keeps them when it writes a clip.

## Your own music

Put files in `packages/studio/public/tracks/` and set `file` for the example in `packages/studio/src/beat-path/tracks.ts`; they are copied into the build as they are. Example 1 does this with the owner's loop (`neon-rain-loop.mp3`, 540 KB at 320 kbps): keep such a file compressed (MP3 or OGG).
