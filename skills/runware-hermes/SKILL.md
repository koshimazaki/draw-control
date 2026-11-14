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
  default: openai:gpt@6.1-sol
  provider: custom:runware
```

Text models on Runware with a `tools` parameter in their schema (public catalog, `runware.ai/docs/models/index.json`, read 14 Nov 2026; price per 1M tokens, input / output):

| AIR | Model | In / out |
| --- | --- | --- |
| `openai:gpt@5.4-mini` | GPT-5.4 Mini (fallback; the profile default is GPT-6.1 Sol, below) | 0.75 / 4.50 USD |
| `openai:gpt@5.5` | GPT-5.5, for hard planning | 5.00 / 30.00 USD |
| `minimax:m3@0` | MiniMax M3, cheapest | 0.30 / 1.20 USD (up to 512K context) |
| `google:gemini@3.5-flash` | Gemini 3.5 Flash | 1.50 / 9.00 USD |
| `zai:glm@5.1` | GLM-5.1 | 1.40 / 4.40 USD |
| `openai:gpt@5.4` | GPT-5.4 | 2.50 / 15.00 USD |
| `xai:grok@4.3` | Grok 4.3 | 1.25 / 2.50 USD |
| `google:gemini@3.1-pro` | Gemini 3.1 Pro | 2.00-4.00 / 12.00-18.00 USD |
| `anthropic:claude@opus-4.8` | Claude Opus 4.8 | 5.00 / 25.00 USD |

The profile lists all 16 live text models with tool calling, so `/model` reaches any of them. The rest: GPT-5.4 Pro (30 / 180, rarely worth it), Claude Haiku 4.5 (1 / 5), Sonnet 4.6 (3 / 15), Opus 4.7 (5 / 25), Fable 5 (10 / 50), Gemini 3.1 Flash Lite (0.25-0.50 / 1.50) and Gemini 3 Flash (0.50-1.00 / 3.00).

Newer models are documented only on their model pages, not in `index.json`, and the profile lists them too: GLM-5.3 (`zai:glm@5.3`, 1.20 / 4.00), GLM-5.3 Flash (0.15 / 0.50), GLM-5.2 (0.80 / 2.55), Kimi K3.1 Pro (`moonshotai:kimi@k3.1-pro`, 2 / 10), Kimi K3 (3 / 15), DeepSeek-V4-Pro (`deepseek:v4@pro`, 0.961 / 1.92) and DeepSeek-V4.1-Flash (0.15 / 0.60). Their pages show the OpenAI-compatible chat endpoint, which is what Hermes uses; none has been tried from here yet. OpenAI's GPT-6 family is there the same way, and GPT-6.1 Sol is the profile default: GPT-6.1 Sol (`openai:gpt@6.1-sol`, 2 / 10), GPT-6 Astra (`openai:gpt@6-astra`, 10 / 50), GPT-6 Sol (2 / 10), GPT-6.1 Terra (`openai:gpt@6.1-terra`, 1 / 5) and GPT-6 Luna (`openai:gpt@6-luna`, 0.10 / 0.50), each up to 272K context; above that the rates rise (Sol 6.1: 4 / 15). For a code review by a second model, see [`runware-review`](../runware-review/SKILL.md).

Switch inside a chat with `/model custom:runware:<AIR>`. The catalog changes: GPT-5 Nano, GPT-5 Mini and MiniMax M2.7 are already marked deprecated, so check the index before pinning a new one. A schema listing `tools` is not proof that a model calls tools well: try a small task first and say which model did the work.

## Images and video: the Runware MCP server

`@runware/mcp` (MIT, pinned in the profile) gives the agent `run` (any inference task), `list_models`, `model_schema`, `model_pricing`, `media_storage` and `account`. It reads the same `RUNWARE_API_KEY`.

The profile marks it `trust: untrusted`, so every call that is not read-only (above all `run`) stops for the person's approval, and it caps a chat's spend with `spend_limit` in USD. Keep it that way:

- Before a paid `run`, read `model_pricing` and say the price, the model and what the result is for.
- One take first. Batches and variations come after the person has seen the first.
- Images for Beat Path go to the character or environment reference; pick the model by job (GPT-Image-2.6 Sunburst or Flare for text, layout and mockups; FLUX or Seedream for looks) from `list_models`.

## Rules

- The key stays in the environment (`RUNWARE_API_KEY`), never in `config.yaml`, a skill, a log or a commit.
- Never turn approval off (`--yolo`, `approvals.mode: off`) for this profile.
- Runware does not keep results for re-download: links expire. Save what you make to a file as soon as it is done.
