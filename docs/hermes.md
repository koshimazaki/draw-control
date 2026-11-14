---
tags: [agents, hermes, runware, mcp]
summary: Run Beat Path from Hermes Agent, open source, with Runware as both the model provider and the generator.
---

# Beat Path in Hermes, on Runware

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT) is an open-source agent. The `beat-path` profile runs it entirely on one Runware key:

- **It thinks with a Runware text model.** Runware's chat endpoint is OpenAI-compatible (`https://api.runware.ai/v1`), so Hermes uses it as a named custom provider. The default is GPT-6.1 Sol (`openai:gpt@6.1-sol`, 2 / 10 USD per 1M tokens). `/model` lists 28 Runware text models: GPT-6 Astra, Sol, Terra and Luna, GLM-5.1 to 5.3, Kimi K3 and K3.1 Pro, DeepSeek V4, GPT-5.4/5.5, Claude, Gemini, Grok 4.3 and MiniMax M3. If GPT-6.1 Sol fails, `/model custom:runware:openai:gpt@5.4-mini` is in the catalog index and the safest fallback.
- **It edits the shot through the motion-studio MCP server:** shot scripts, describe, undo and render. All of these are local and free.
- **It makes images and video through Runware's own MCP server** (`@runware/mcp`, pinned). That server is marked `untrusted`, so every paid call stops for approval, and a chat is capped at 10 USD.

Hermes has no Runware provider or plugin of its own. Its install was searched on 14 Nov 2026, and Runware's GitHub and docs never mention Hermes. This profile and [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md) are that integration, built from parts each side already publishes.

## Set up

```bash
npm run hermes:setup              # installs ~/.hermes/profiles/beat-path (or updates it)
security add-generic-password -a "$USER" -s runware-api-key -w   # once: stores the key in the Keychain
npm run hermes                    # starts hermes -p beat-path with the key from the Keychain
```

Or `export RUNWARE_API_KEY=...` in your shell and run `hermes -p beat-path`. Either way the key is never written to a file.

The setup uses Hermes's own `profile install`, so other profiles are untouched. It also copies the three skills into the profile and points the MCP server at this checkout. It makes no model call. `npm run hermes:setup -- --dry` only stages the files.

## Choose the model

The profile starts on GPT-6.1 Sol. Every Runware model in the profile is one switch away, by its full ID or a short name:

| Where | How |
| --- | --- |
| At launch | `npm run hermes -- -m astra` or `hermes -p beat-path -m kimi` |
| In a chat | `/model glm` (the session), `/model astra --global` (also the default from now on) |
| One turn only | `/model astra --once`: one hard question on Astra, then back to Sol |
| Any Runware ID | `/model custom:runware:<AIR>`, e.g. `custom:runware:deepseek:v4.1@flash` |

Short names: `sol` (GPT-6.1 Sol), `astra` (GPT-6 Astra), `terra` (GPT-6.1 Terra), `luna` (GPT-6 Luna), `glm` (GLM-5.3), `kimi` (Kimi K3.1 Pro), `deepseek` (DeepSeek-V4-Pro), `opus` (Claude Opus 4.8), `gemini` (Gemini 3.1 Pro), `grok` (Grok 4.3), `mini` (GPT-5.4 Mini). `npm run review -- --model <name>` takes the same names. Prices are in [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md).

## Things to ask it

- "Open example 3, make the car a lorry with a trailer, and keep the camera swinging round it on the snare." The agent edits the shot description, describes the shot back and renders the guide.
- "Draw a path that weaves between the towers, and move the camera to the top on every fourth snare." The agent writes the paths in metres and cuts the Camera lane on the snares.
- "Make a character reference: a courier in a plain brown uniform, three views." The agent reads the price through Runware's MCP and waits for your yes before it runs.
- "Review this branch with GLM-5.3, then check its findings." The agent dry-runs `npm run review`, says the ceiling, runs it after your yes, and checks each finding against the code ([`skills/runware-review`](../skills/runware-review/SKILL.md)).
- "Sketch how the Moves lane could look with GPT Image." One image through Runware's MCP, priced first.

## What is verified

| Check | State |
| --- | --- |
| The profile installs with `hermes profile install` (Hermes v0.23.1) | yes, 14 Nov 2026 |
| The motion-studio MCP server connects (`hermes -p beat-path mcp test motion-studio`) | yes: 14 tools |
| Runware's MCP server connects (`hermes -p beat-path mcp test runware`) | yes: 12 tools (listing needs no valid key) |
| Runware's text models answer through Hermes, with tool calls | **not yet**: needs the key and one small paid chat |
| Image generation through `@runware/mcp` from Hermes | **not yet**: paid, needs the owner's go |
| `npm run review` builds the request and prices it (`--dry`) | yes: about 8k tokens for this branch, ceiling 0.05 USD on GLM-5.1 |
| `npm run review` gets a review back from Runware | **not yet**: needs the key |

Each model's schema has a `tools` parameter, but that doesn't show the model calls tools well. Run a small task on each model first, and report which model did the work.
