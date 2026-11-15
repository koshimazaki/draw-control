# Draw Control

**Draw your camera move. The video model follows it.**

<!-- DEMO VIDEO: on github.com, edit this file and drag the screen recording onto this line; GitHub uploads it and inserts a link that plays inline. -->

Draw Control turns a drawing into a camera move for AI video. Draw the subject's path and the camera's path on a map, block out the scene with simple grey primitives, and drop in your music. The page renders a guide clip (a stand-in figure, the camera move and the blockout, timed to the beat), and a video model follows it for motion and framing, while your prompt and reference images decide the look.

**Runs on [Runware](https://runware.ai).** Generation goes through Runware with your own API key, straight from your browser: Kling VIDEO 4.0, Seedance 2.5 and MiniMax H3 for video, and GPT Image, Seedream, FLUX and MiniMax image models for character and environment references. Every run shows its estimated cost and waits for your OK.

## What it does

- **Drawing controls the camera.** Paths drawn on a map; views (isometric, behind, side, top), orbits, push-ins and pull-outs placed on a Character lane and a Camera lane.
- **Audio-reactive.** It finds the tempo, kicks, snares and hats in your track. Moves start on hits, locks land on them, your own markers drive them, and a loop can be sliced to the clip.
- **Agent control.** The page, a CLI and an MCP server run the same commands, so your own agent (Claude Code, Hermes, Codex and others), typed or spoken to, can draw, edit and render shots.
- **One guide, many subjects.** The grey blocks stand in for anything: Example 2 is one street guide for a runner, an anime skater or a factory forklift.

## Quick start

Node 24 and Chrome or Edge (the guide export uses WebCodecs).

```bash
git clone https://github.com/koshimazaki/draw-control && cd draw-control
nvm use && npm install
npm run dev        # open http://127.0.0.1:5180/path.html
```

Add your Runware API key (top right) to generate. Without one, the page still draws, plays and exports the guide. It opens on **Example 1**, a ship over a city on a Neon Rain loop; **Example 2** is the street guide on a drum and bass loop; **Your own** starts from a plain path.

## Agents

```bash
npm run cli -- commands     # every command (analyse, new, script, describe, render, …)
npm run mcp                 # the MCP server on stdio: mcp/bin/motion-studio-mcp.mjs
```

Point any MCP-capable harness at the server, or call the CLI from its terminal. The skills in [`skills/`](skills/) teach an agent the whole process, from a brief to a finished example, and [`hermes/`](hermes/) is a ready Hermes profile that runs on Runware's own text models.

## Docs

| | |
| --- | --- |
| [The full tour](docs/studio.md) | every control on the page, the studio underneath, the folders, the licences |
| [Developing the page](docs/beat-path.md) | how to run and check it, and which file owns each control |
| [Agents: CLI and MCP](docs/agents.md) | every command, with worked examples |
| [Shot script and recipe](docs/recipe.md) | the format agents and the page share |
| [Video models](docs/models.md) | clip lengths, frame rates and prompt limits per model |
| [Hermes on Runware](docs/hermes.md) | the agent profile, the key in the Keychain, what guards the spend |
| [Deploy](docs/deploy.md) | a static build for Cloudflare Pages or any host |

## Licence

MIT ([LICENSE](LICENSE)). The music files in `packages/studio/public/tracks/` are the owner's tracks, used with permission, and are not covered by the MIT licence.
