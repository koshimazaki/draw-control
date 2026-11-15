---
name: runware-review
description: Get a second-opinion code review of a git diff from another model family on Runware (GLM, GPT, Claude, Gemini, Grok, MiniMax), and draw a quick visual example with GPT Image. Works from any agent harness.
license: MIT
compatibility: Node 20+, git; a Runware API key in RUNWARE_API_KEY (or the macOS Keychain item runware-api-key)
metadata:
  repo: motion-studio
  version: 0.2.0
---

# Review on Runware

`npm run review` sends a git diff to a text model on Runware and prints its findings, the tokens it used and what Runware charged. The model that wrote the code should not be the only one that checks it: pick a reviewer from a different family.

Any harness can use it, because it is a plain command. Hermes, Claude Code, Codex or a person in a terminal all run the same line. That also means **no harness asks before it runs**: Hermes does not treat it as a paid call. The script asks itself, and you ask the owner.

## Run it

```bash
npm run review -- --dry                              # what would be sent, and the price ceiling; free
npm run review -- --yes                              # this branch against origin/main, on GLM-5.3 (after the owner's yes)
npm run review -- --range HEAD~1..HEAD --yes         # one commit
npm run review -- --staged --focus "the key handling" --yes
npm run review -- --model kimi --out review.md --yes # short names: sol astra terra luna glm kimi deepseek opus gemini grok mini
```

1. **Dry-run first.** `--dry` is free and asks nothing. It prints the files and characters that would be sent, the exclude rules and what they left out, and the price ceiling (all input plus the full output allowance, at the highest tier the model has). It also runs the secret scan.
2. **Ask the owner.** Say the model, the ceiling, the number of files and characters, and that the diff and `AGENTS.md` go to Runware and the model's provider. Wait for a yes.
3. **Only then run it with `--yes`.** Without a terminal (an agent's tool call) the script refuses unless `--yes` is passed, exits non-zero and says nothing was sent. On a terminal without `--yes` it asks y/N itself. Never pass `--yes` without the owner's yes for that run.

What the script enforces:

- **A ceiling over `--max-usd`** (default 0.50 USD, at most 5) refuses to start.
- **The price on file wins.** `--price IN/OUT` is accepted only for a model the script has no price for; for any other it refuses.
- **Never sent:** `.env*`, `*.key`, `*.pem`, lockfiles and anything under `vendor/`. The diff is taken with `--no-ext-diff --no-textconv`.
- **Secret-looking text refuses the run:** a private key header, a `Bearer` token, an `sk-`, GitHub, AWS, Google or Slack token, a long value assigned to a key-, secret-, token- or password-named field, or the Runware key itself. It names the file and line, never the value.
- **After the run** it prints what Runware reported and warns if that went over the ceiling.
- **The key is never printed.** It comes from `RUNWARE_API_KEY`, or on macOS from the Keychain item `runware-api-key` (add it once with `security add-generic-password -a "$USER" -s runware-api-key -w`, which asks for the key without echoing it).
- **The output ends with the cost.** On the native task API that is what Runware charged; on the chat route (the "compatible" models below) it is worked out from the token counts. Quote that figure, not the ceiling.

## Pick the reviewer

USD per 1M tokens, input / output, from each model's public page (`runware.ai/docs/models/<id>`), read 15 Nov 2026. Where a page has two rates, the lower applies up to the context length named; the script's ceiling uses the higher one. "Compatible" models have status `compatible-only`: no entry in the catalog index and no task schema, so the script sends them through `/v1/chat/completions`. **None of them has been run from here yet:** the first real call is the check.

| AIR | Model | In / out | Route | Use it for |
| --- | --- | --- | --- | --- |
| `zai:glm@5.3` | GLM-5.3 (default) | 1.20 / 4.00 | compatible | Coding and agent work, 1M context |
| `zai:glm@5.3-flash` | GLM-5.3 Flash | 0.15 / 0.50 | compatible | A near-free first pass |
| `zai:glm@5.2` | GLM-5.2 | 0.80 / 2.55 | compatible | Function calling, 128K output |
| `openai:gpt@6.1-sol` | GPT-6.1 Sol | 2 / 10 (4 / 15 over 272K) | compatible | OpenAI's coding and agent reasoning model |
| `openai:gpt@6-astra` | GPT-6 Astra | 10 / 50 (20 / 75 over 272K) | compatible | The hardest reviews, design passes |
| `openai:gpt@6-sol` | GPT-6 Sol | 2 / 10 (4 / 15 over 272K) | compatible | The earlier Sol; 6.1 costs the same |
| `openai:gpt@6.1-terra` | GPT-6.1 Terra | 1 / 5 (2 / 7.50 over 272K) | compatible | Fast, visual reasoning (screenshots) |
| `openai:gpt@6-luna` | GPT-6 Luna | 0.10 / 0.50 (0.20 / 0.75 over 272K) | compatible | Near-free, high-volume checks |
| `moonshotai:kimi@k3.1-pro` | Kimi K3.1 Pro | 2 / 10 | compatible | Long-horizon coding, tool calling |
| `moonshotai:kimi@k3` | Kimi K3 | 3 / 15 | compatible | The earlier Kimi; K3.1 Pro is cheaper |
| `deepseek:v4@pro` | DeepSeek-V4-Pro | 0.961 / 1.92 | compatible | A strong reviewer at a low price |
| `deepseek:v4.1@flash` | DeepSeek-V4.1-Flash | 0.15 / 0.60 | compatible | Cheap, multimodal, tool use |
| `deepseek:v4@flash` | DeepSeek-V4-Flash-0731 | 0.076 / 0.153 | compatible | The cheapest on file |
| `deepseek:v4.1@flash-1017` | DeepSeek-V4.1-Flash-1017 | 0.15 / 0.60 | compatible | A dated V4.1 Flash build |
| `zai:glm@5.1` | GLM-5.1 | 1.40 / 4.40 | native | In the catalog index |
| `xai:grok@4.3` | Grok 4.3 | 1.25 / 2.50 | native | A cheap large reviewer |
| `minimax:m3@0` | MiniMax M3 | 0.30 / 1.20 (0.60 / 2.40 over 512K) | native | Very large diffs |
| `openai:gpt@5.4` | GPT-5.4 | 2.50 / 15 | native | A GPT read at half GPT-5.5's price |
| `openai:gpt@5.5` | GPT-5.5 | 5 / 30 | native | The hardest changes |
| `google:gemini@3.1-pro` | Gemini 3.1 Pro | 2 / 12 (4 / 18 over 200K) | native | Long context with strong reasoning |
| `anthropic:claude@opus-4.8` | Claude Opus 4.8 | 5 / 25 | native | A Claude read when the author was not Claude |

The script also has prices on file for GPT-5.4 Mini and Pro, Claude Haiku 4.5, Sonnet 4.6, Opus 4.7 and Fable 5, and Gemini 3.5 Flash, 3 Flash and 3.1 Flash Lite (the same figures as [`runware-hermes`](../runware-hermes/SKILL.md)). The default reviewer is GLM-5.3 because the Hermes profile thinks with GPT-6.1 Sol: a review from another family catches what the author's family misses. For a model the script has no price for, pass `--price IN/OUT` from its Runware page; it goes through the native task API.

`--thinking low|medium|high` sets the model's reasoning level where its schema has one. Thinking tokens bill as output, so raise `--max-tokens` with it.

## Read the review

- A reviewer is wrong sometimes. **Check each finding against the code before you act on it**, and say which ones you checked.
- Report it plainly: the model, the verdict line, the findings you confirmed, the ones you rejected and why, and the cost.
- Two reviewers that agree are worth more than one that is confident. For a risky change, run a second family and compare (each run is a separate yes).

## Draw an example

When a finding or a UI idea is easier to see than to read, draw it with GPT Image on Runware through the Runware MCP server (`run`, model `openai:gpt-image@2.6-sunburst` for exact layouts and edits, `openai:gpt-image@2.6-flare` for fast drafts; both also make SVG).

- Read `model_pricing` first, say the price and wait for a yes. Runware's published examples run about 0.04-0.19 USD an image, and it publishes no upper limit for these token-priced models. Hermes's spend limit counts 5 USD per `run` whatever the image costs, and asks again only from the third `run` of a chat.
- One image, then wait for the person's reaction. It is a sketch for discussion, not a design to ship.
- Save the result as soon as it is done: Runware's links expire.

## Rules

- No paid call without the person's yes, and never with approvals turned off. `--yes` is that yes written down: pass it only after you have it.
- Never paste the key into a command, a file, a log or a chat. In Hermes it is in your terminal's environment: never echo it.
- The diff leaves the machine. Review only code that may be sent to Runware and the model's provider.
