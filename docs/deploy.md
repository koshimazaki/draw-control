---
tags: [deploy, beat-path, static]
summary: How the Draw Control page is built as plain static files (Cloudflare Pages or any static host), served at the site root without the studio, and checked from a sub-path.
---

# Deploying Draw Control as static files

Draw Control needs no server: no API routes, no backend. Everything it uses is inside the build (the three examples and their presets are bundled from `examples/scripts/`, the music is generated in the browser). Generation runs in the visitor's browser with their own Runware key once the key and generate module is vendored (`packages/studio/public/vendor/`).

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

## Your own music

Put files in `packages/studio/public/tracks/` and set `file` for the example in `packages/studio/src/beat-path/tracks.ts`; they are copied into the build as they are.
