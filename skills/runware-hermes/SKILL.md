---
name: runware-hermes
description: Run Hermes on Runware - text models, images and video from one key.
license: MIT
compatibility: Hermes Agent >= 0.21.4; a Runware API key in RUNWARE_API_KEY
metadata:
  repo: motion-studio
  version: 0.1.0
---

# Hermes on Runware

One Runware key covers both halves of an agent: Runware serves the chat model Hermes thinks with (an OpenAI-compatible endpoint), and the Runware MCP server gives it image, video, audio and 3D generation. The `beat-path` profile (`hermes/beat-path/`, installed with `npm run hermes:setup`) is set up this way, with the motion-studio MCP server on top.

## The model provider

Runware's chat endpoint is `https://api.runware.ai/v1/chat/completions`, with the key as a Bearer token. Model names are Runware AIR IDs, not OpenAI names. In `config.yaml`:

```yaml
providers:
  runware:
    api: https://api.runware.ai/v1
    key_env: RUNWARE_API_KEY
    transport: chat_completions
model:
  default: openai:gpt@5.4-mini
  provider: custom:runware
```

Text models on Runware with a `tools` parameter in their schema (public catalog, `runware.ai/docs/models/index.json`, read 14 Nov 2026; price per 1M tokens, input / output):

| AIR | Model | In / out |
| --- | --- | --- |
| `openai:gpt@5.4-mini` | GPT-5.4 Mini (profile default) | 0.75 / 4.50 USD |
| `openai:gpt@5.5` | GPT-5.5, for hard planning | 5.00 / 30.00 USD |
| `minimax:m3@0` | MiniMax M3, cheapest | 0.30 / 1.20 USD (up to 512K context) |
| `google:gemini@3.5-flash` | Gemini 3.5 Flash | 1.50 / 9.00 USD |
| `zai:glm@5.1` | GLM-5.1 | 1.40 / 4.40 USD |

Switch inside a chat with `/model custom:runware:<AIR>`. The catalog changes: GPT-5 Nano, GPT-5 Mini and MiniMax M2.7 are already marked deprecated, so check the index before pinning a new one. A schema listing `tools` is not proof that a model calls tools well: try a small task first and say which model did the work.

## Images and video: the Runware MCP server

`@runware/mcp` (MIT, pinned in the profile) gives the agent `run` (any inference task), `list_models`, `model_schema`, `model_pricing`, `media_storage` and `account`. It reads the same `RUNWARE_API_KEY`.

The profile marks it `trust: untrusted`, so every call that is not read-only (above all `run`) stops for the person's approval, and it caps a chat's spend with `spend_limit` in USD. Keep it that way:

- Before a paid `run`, read `model_pricing` and say the price, the model and what the result is for.
- One take first. Batches and variations come after the person has seen the first.
- Images for Beat Path go to the character or environment reference; pick the model by job (GPT Image for text and layout, FLUX or Seedream for looks) from `list_models`.

## Rules

- The key stays in the environment (`RUNWARE_API_KEY`), never in `config.yaml`, a skill, a log or a commit.
- Never turn approval off (`--yolo`, `approvals.mode: off`) for this profile.
- Runware does not keep results for re-download: links expire. Save what you make to a file as soon as it is done.
