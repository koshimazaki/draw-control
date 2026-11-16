# Motion Studio for agents

Motion Studio makes guide videos that video models follow: a figure, its path, a camera plan and the music's beats, rendered to an MP4. **Draw Control** (`packages/studio/path.html`, built as the `beat-path` mode; identifiers keep that old name) is the page built for Runware: it draws a shot, renders the guide and generates on Runware's video models.

## How an agent drives it

Every edit in the page is a command an agent can run too, so the page, the CLI and the MCP server never drift apart.

| Way in | Start | Docs |
| --- | --- | --- |
| MCP server | `node mcp/bin/motion-studio-mcp.mjs` (stdio) | [docs/agents.md](docs/agents.md) |
| CLI | `npm run cli -- commands` | [docs/agents.md](docs/agents.md) |
| Shot scripts | `examples/scripts/beat-path-*.txt` (the page shows Example 1, `beat-path-ex1-flyer.txt`, and Example 2, `beat-path-ex2-runner.txt`; the car and drone, `-ex3-car` and `-ex4-drone`, are script-only) | [docs/recipe.md](docs/recipe.md#shot-script) |
| Hermes on Runware | `npm run hermes:setup`, then `hermes -p beat-path` | [docs/hermes.md](docs/hermes.md) |

## Skills

Skills follow the open Agent Skills format (`SKILL.md` with `name` and `description`), so Claude Code, Codex, Hermes and other agents can load them:

- [`skills/beat-path`](skills/beat-path/SKILL.md): draw and edit a Draw Control shot through the MCP server or the CLI, then render the guide.
- [`skills/draw-control-example`](skills/draw-control-example/SKILL.md): make a new example or shot from a plain-language brief (subject, blocks, camera views such as isometric, top and side, smooth transitions on the music), step by step through the CLI, verified by render; the traps that cost a render each.
- [`skills/runware-hermes`](skills/runware-hermes/SKILL.md): run Hermes on Runware, with text models, images and video on one key.
- [`skills/runware-review`](skills/runware-review/SKILL.md): a second-opinion code review from another model family on Runware (`npm run review`: sends the diff and this file, paid, asks first), and quick GPT Image sketches.

## Rules

- **No paid run without the owner's yes.** Rendering a guide is free. A video or image generation spends Runware credits: name the model, the length and the price first. A paid review (`npm run review`) is the same: dry-run it, say the ceiling, and pass `--yes` only after the owner said yes. Real runs are logged in [docs/costs.md](docs/costs.md).
- **The tools do not enforce all of that.** In Hermes, the chat model's own tokens have no limit; the Runware MCP server's `spend_limit` counts declared estimates per chat and asks again past it, it does not cap the bill; and a terminal command such as `npm run review -- --yes` runs without a Hermes prompt. Exactly what each guard does is in [docs/hermes.md](docs/hermes.md#what-guards-the-spend).
- **Work in a git worktree.** The owner's `npm run dev` reloads the page on any file change, and a reload loses a generation in progress.
- **Checks before and after:** `npm run check` (typecheck, lint, tests) and `node scripts/smoke-beat-path.mjs`.
- **Keep files near 500 lines.** Extract a helper rather than grow one file.
- **Keys and secrets** stay in the environment (`RUNWARE_API_KEY`), the macOS Keychain (item `runware-api-key`, read by `npm run hermes` and `npm run review` when the variable is unset, and by the Hermes profile's `key_cmd`) or the page's key panel: never in a repository file, a log or a commit. On Linux and Windows the Hermes gateway reads it from the profile's own `.env` in the Hermes home ([docs/hermes.md](docs/hermes.md#set-up)). In Hermes the key is in the terminal tool's environment, so any command run there can use it.

## Map

- `packages/core`: the recipe, the commands, audio analysis and the beat locks (pure TypeScript).
- `packages/studio`: the studio and Draw Control pages (Vite, three.js). `src/beat-path/` is the page.
- `mcp/`, `cli/`: the MCP server and CLI over the same commands.
- `docs/`: [models.md](docs/models.md) (what each video model takes), [recipe.md](docs/recipe.md), [design.md](docs/design.md), [friction.md](docs/friction.md).
- `hermes/beat-path/`: the Hermes profile. `skills/`: the agent skills.
