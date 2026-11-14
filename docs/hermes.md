---
tags: [agents, hermes, runware, mcp]
summary: Run Beat Path from Hermes Agent, open source, with Runware as both the model provider and the generator.
---

# Beat Path in Hermes, on Runware

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT) is an open-source agent. The `beat-path` profile runs it entirely on one Runware key:

- **It thinks with a Runware text model.** Runware's chat endpoint is OpenAI-compatible (`https://api.runware.ai/v1`), so Hermes uses it as a named custom provider. The default is GPT-5.4 Mini (`openai:gpt@5.4-mini`). GPT-5.5, MiniMax M3, Gemini 3.5 Flash and GLM-5.1 are listed for `/model`.
- **It edits the shot through the motion-studio MCP server:** shot scripts, describe, undo and render. All of these are local and free.
- **It makes images and video through Runware's own MCP server** (`@runware/mcp`, pinned). That server is marked `untrusted`, so every paid call stops for approval, and a chat is capped at 10 USD.

Hermes has no Runware provider or plugin of its own. Its install was searched on 14 Nov 2026, and Runware's GitHub and docs never mention Hermes. This profile and [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md) are that integration, built from parts each side already publishes.

## Set up

```bash
npm run hermes:setup              # installs ~/.hermes/profiles/beat-path (or updates it)
export RUNWARE_API_KEY=...        # in your shell, never in a file
hermes -p beat-path
```

The setup uses Hermes's own `profile install`, so other profiles are untouched. It also copies the two skills into the profile and points the MCP server at this checkout. It makes no model call. `npm run hermes:setup -- --dry` only stages the files.

## Things to ask it

- "Open example 3, make the car a lorry with a trailer, and keep the camera swinging round it on the snare." The agent edits the shot description, describes the shot back and renders the guide.
- "Draw a path that weaves between the towers, and move the camera to the top on every fourth snare." The agent writes the paths in metres and cuts the Camera lane on the snares.
- "Make a character reference: a courier in a plain brown uniform, three views." The agent reads the price through Runware's MCP and waits for your yes before it runs.

## What is verified

| Check | State |
| --- | --- |
| The profile installs with `hermes profile install` (Hermes v0.23.1) | yes, 14 Nov 2026 |
| The motion-studio MCP server connects (`hermes -p beat-path mcp test motion-studio`) | yes: 14 tools |
| Runware's MCP server connects (`hermes -p beat-path mcp test runware`) | yes: 12 tools (listing needs no valid key) |
| Runware's text models answer through Hermes, with tool calls | **not yet**: needs the key and one small paid chat |
| Image generation through `@runware/mcp` from Hermes | **not yet**: paid, needs the owner's go |

Each model's schema has a `tools` parameter, but that doesn't show the model calls tools well. Run a small task on each model first, and report which model did the work.
