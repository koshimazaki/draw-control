---
name: runware-hermes
description: Run Hermes on Runware - text models, images and video from one key.
license: MIT
compatibility: Hermes Agent >= 0.21.4; a Runware API key in RUNWARE_API_KEY (or, through npm run hermes, the macOS Keychain item runware-api-key)
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

Every model in the profile, with its price per 1M tokens, input / output, from its public page (`runware.ai/docs/models/<id>`, read 15 Nov 2026). "Index" models are in the catalog index (`runware.ai/docs/models/index.json`) with a `tools` parameter in their schema; "compatible" models have status `compatible-only`: a page with the OpenAI-compatible chat endpoint (what Hermes uses), no entry in the index, and none of them tried from here yet. Where a page lists two rates, both are shown: the lower one applies up to the context length named.

| AIR | Model | In / out (USD) | Listed |
| --- | --- | --- | --- |
| `openai:gpt@6.1-sol` | GPT-6.1 Sol, **the profile default** | 2 / 10 up to 272K; 4 / 15 above | compatible |
| `openai:gpt@6-astra` | GPT-6 Astra, OpenAI's frontier model | 10 / 50 up to 272K; 20 / 75 above | compatible |
| `openai:gpt@6-sol` | GPT-6 Sol | 2 / 10 up to 272K; 4 / 15 above | compatible |
| `openai:gpt@6.1-terra` | GPT-6.1 Terra | 1 / 5 up to 272K; 2 / 7.50 above | compatible |
| `openai:gpt@6-luna` | GPT-6 Luna, the cheapest in the profile | 0.10 / 0.50 up to 272K; 0.20 / 0.75 above | compatible |
| `zai:glm@5.3` | GLM-5.3 | 1.20 / 4.00 | compatible |
| `zai:glm@5.3-flash` | GLM-5.3 Flash | 0.15 / 0.50 | compatible |
| `zai:glm@5.2` | GLM-5.2 | 0.80 / 2.55 | compatible |
| `moonshotai:kimi@k3.1-pro` | Kimi K3.1 Pro | 2 / 10 | compatible |
| `moonshotai:kimi@k3` | Kimi K3 | 3 / 15 | compatible |
| `deepseek:v4@pro` | DeepSeek-V4-Pro | 0.961 / 1.92 | compatible |
| `deepseek:v4.1@flash` | DeepSeek-V4.1-Flash | 0.15 / 0.60 | compatible |
| `openai:gpt@5.4-mini` | GPT-5.4 Mini, the safest fallback | 0.75 / 4.50 | index |
| `openai:gpt@5.4` | GPT-5.4 | 2.50 / 15.00 | index |
| `openai:gpt@5.5` | GPT-5.5, for hard planning | 5.00 / 30.00 | index |
| `openai:gpt@5.4-pro` | GPT-5.4 Pro, rarely worth it | 30 / 180 | index |
| `anthropic:claude@haiku-4.5` | Claude Haiku 4.5 | 1 / 5 | index |
| `anthropic:claude@sonnet-4.6` | Claude Sonnet 4.6 | 3 / 15 | index |
| `anthropic:claude@opus-4.7` | Claude Opus 4.7 | 5 / 25 | index |
| `anthropic:claude@opus-4.8` | Claude Opus 4.8 | 5 / 25 | index |
| `anthropic:claude@fable-5` | Claude Fable 5 | 10 / 50 | index |
| `google:gemini@3.1-flash-lite` | Gemini 3.1 Flash Lite | 0.25 (audio 0.50) / 1.50 | index |
| `google:gemini@3-flash` | Gemini 3 Flash | 0.50 (audio 1.00) / 3.00 | index |
| `google:gemini@3.5-flash` | Gemini 3.5 Flash | 1.50 / 9.00 | index |
| `google:gemini@3.1-pro` | Gemini 3.1 Pro | 2 / 12 under 200K; 4 / 18 above | index |
| `zai:glm@5.1` | GLM-5.1 | 1.40 / 4.40 | index |
| `xai:grok@4.3` | Grok 4.3 | 1.25 / 2.50 | index |
| `minimax:m3@0` | MiniMax M3, cheap with a very long context | 0.30 / 1.20 up to 512K; 0.60 / 2.40 above | index |

For a code review by a second model, see [`runware-review`](../runware-review/SKILL.md).

Switch inside a chat with `/model <short name>` or `/model custom:runware:<AIR>`. The catalog changes: GPT-5 Nano, GPT-5 Mini and MiniMax M2.7 are already marked deprecated, so check the index before pinning a new one. A schema listing `tools` is not proof that a model calls tools well: try a small task first and say which model did the work.

**The chat model is billed per token with no limit in this profile.** Nothing asks before a turn and the MCP spend limit below does not count it, so prefer a cheaper model for long sessions.

## Images and video: the Runware MCP server

`@runware/mcp` (MIT, pinned in the profile) gives the agent `run` (any inference task), `list_models`, `model_schema`, `model_pricing`, `media_storage` and `account`. It reads the same `RUNWARE_API_KEY`.

What the profile's settings do, exactly (`tools/mcp_tool_costs.py` and `tools/mcp_tool_handlers.py` in Hermes):

- `trust: untrusted`: every call to a tool the server does not mark read-only (above all `run`) asks for the person's approval, until they answer "for this session" or "always" for that tool. After that it runs without asking.
- `tool_costs` plus `spend_limit: 10`: Hermes books the top of the declared range, 5 USD, for every `run`, in memory for this chat only. It never sees what Runware really charges. A call that would take the chat past 10 USD is not blocked: it needs an explicit yes for that one call, every time, even after "always". That is the third `run` of a chat. A new chat or a restarted Hermes starts at 0, and the chat model's own tokens are never counted.

So the price check is yours, not Hermes's:

- Before every paid `run`, read `model_pricing` and say the price, the model and what the result is for, and wait for a yes, even when Hermes would not ask.
- One take first. Batches and variations come after the person has seen the first.
- Images for Draw Control go to the character or environment reference; pick the model by job (GPT-Image-2.6 Sunburst or Flare for text, layout and mockups; FLUX or Seedream for looks) from `list_models`.

## Rules

- The key stays in the environment (`RUNWARE_API_KEY`) or, on macOS, the Keychain item `runware-api-key` (which `npm run hermes` reads when the variable is unset), never in `config.yaml`, a skill, a log or a commit. The terminal tool inherits it, so never print or echo it.
- Never turn approval off (`--yolo`, `approvals.mode: off`) for this profile.
- Runware does not keep results for re-download: links expire. Save what you make to a file as soon as it is done.
