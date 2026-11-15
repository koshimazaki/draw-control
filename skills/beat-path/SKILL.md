---
name: beat-path
description: Draw and edit a Draw Control shot (paths, camera, beat locks) through the motion-studio MCP or CLI, then render the guide.
license: MIT
compatibility: Node 24; the motion-studio MCP server (mcp/bin/motion-studio-mcp.mjs) or CLI (cli/bin/motion-studio.mjs)
metadata:
  repo: motion-studio
  version: 0.1.0
---

# Draw Control for agents

Draw Control turns a hand-drawn path, a camera plan and a music track into a guide video that a video model follows. The page, the CLI and the MCP server run the same commands, so anything you do here can be opened and fine-tuned by hand in the page.

## Tools

Over MCP (server `motion-studio`):

| Tool | Use |
| --- | --- |
| `analyse_audio` / `load_analysis` | Read a track: tempo, kicks, snares, hats. Run it before anything locks to the music. |
| `new_recipe` | A starting shot: `{ character: "glider", clip: 8 }` gives the Draw Control base (clip 3–30 s, `slice` to start inside a long track). The figure shape (glider, car, flyer, runner) is the `figure:` script line or the `setFigure` command. |
| `apply_script` | The main tool: a shot script, one row per block (grammar in `docs/recipe.md#shot-script`). |
| `apply`, `set` | Single commands or recipe fields, when a script is too coarse. `list_commands` lists every command. |
| `describe`, `get_script` | Read the shot back as text. Always read it back after an edit and check what changed. |
| `undo` | Step back one edit. |
| `save_recipe`, `load_recipe`, `get_recipe` | Keep and reopen shots as files. |
| `render` | The guide bundle: MP4, frame 0, beats.json, camera.json, the recipe. Free: it runs locally in headless Chrome, about real time. |

The CLI equivalents are in `docs/agents.md` (`npm run cli -- commands`).

## Working order

1. **Read the music first.** `analyse_audio` on the track. Without it, `@kick N`, `@snare N` and locks fail.
2. **Start from an example.** `examples/scripts/beat-path-ex1-flyer.txt` (street flyer), `-ex2-runner.txt`, `-ex3-car.txt` (road bend), `-ex4-drone.txt` (hovering drone; opens isometric through the `rig:` line, then orbit, top and side). Change one thing at a time.
3. **Paths in metres.** Give the subject path and the camera path as points in the script, so you never draw: see `examples/scripts/glide-path.txt`. Keep the camera path clear of the subject's.
4. **Camera on the beat.** Camera words: follow behind, follow side, orbit, top, push in, my path. Lock a block to `kick`, `snare`, `hat` or `beat`. For "moves on the snare", cut the Camera lane at each snare and cycle the moves (the page's "Moves on hits"). Too many cuts read as robotic; use the `sensitivity:` line (0–1) to thin the hits first.
5. **Clip length.** `new_recipe { clip }`, 3 to 30 s. Check the target model's limit in `docs/models.md` before going past 10 s (MiniMax H3 stops at 15 s, video and audio together).
6. **Read back, then render.** `describe` or `get_script`, check it against the brief, then `render`. Look at frame 0 and the MP4 before proposing a generation.
7. **Write the timed prompt.** `timed_prompt { write: true }` (with the analysis loaded, so each line names the hit it starts on), or `motion-studio describe shot.json --analysis a.json --timed`: one line per camera block, in seconds. Use `style: "brackets"` for Seedance 2.5. Read it, fix any wording that does not match the brief, and keep it under the action's 2000 characters.

## Shot description

The model gets the guide video, up to two reference images (character, environment) and the shot description: subject, action, setting. Describe what the guide shows in the words the model needs: the subject and how it moves, not the camera (the guide carries the camera). One guide serves many verticals: changing only the description and references turns a flying car in New Tokyo into a forklift in an engine factory.

## Making a new example

For a new example or shot from a brief (camera views such as isometric, top and side, and the transitions between them), follow [`skills/draw-control-example`](../draw-control-example/SKILL.md): the exact steps and the traps.

## Rules

- **Never start a paid generation.** Rendering the guide is free. Generating a video or image spends the owner's Runware credits: propose the model, the clip length and the price (`docs/models.md`, the page's cost dialog), then wait for a yes.
- **Do not edit files under a running dev server.** `npm run dev` reloads the page on any edit, and a reload loses a run in progress. Work in a git worktree.
- **Report what you checked.** Name the script you applied, what `describe` showed and where the render went.
