---
name: runware-review
description: Get a second-opinion code review of a git diff from another model family on Runware (GLM, GPT, Claude, Gemini, Grok, MiniMax), and draw a quick visual example with GPT Image. Works from any agent harness.
license: MIT
compatibility: Node 20+, git; a Runware API key in RUNWARE_API_KEY (or the macOS Keychain item runware-api-key)
metadata:
  repo: motion-studio
  version: 0.1.0
---

# Review on Runware

`npm run review` sends a git diff to a text model on Runware and prints its findings, the tokens it used and what Runware charged. The model that wrote the code should not be the only one that checks it: pick a reviewer from a different family.

Any harness can use it, because it is a plain command. Hermes, Claude Code, Codex or a person in a terminal all run the same line.

## Run it

```bash
npm run review -- --dry                              # size and price ceiling; sends nothing
npm run review                                       # this branch against origin/main, on GLM-5.3
npm run review -- --range HEAD~1..HEAD               # one commit
npm run review -- --staged --focus "the key handling"
npm run review -- --model kimi --out review.md          # short names: sol astra terra luna glm kimi deepseek opus gemini grok mini
```

- **Always dry-run first.** It prints the input size and a price ceiling (all input plus the full output allowance). A run whose ceiling is over `--max-usd` (default 0.50 USD) refuses to start.
- **The key is never printed.** It comes from `RUNWARE_API_KEY`, or on macOS from the Keychain: add it once with `security add-generic-password -a "$USER" -s runware-api-key -w`, which asks for the key without echoing it.
- **The output ends with the cost.** On the native task API that is what Runware charged; on the chat route (the newer models below) it is worked out from the token counts. Quote that figure, not the ceiling.

## Pick the reviewer

USD per 1M tokens, input / output (up to 272K context for the GPT-6 family), read 14 Nov 2026. The first twelve are documented on their model pages (`runware.ai/docs/models/<id>`) with the OpenAI-compatible chat endpoint, but are missing from the catalog index (`index.json`) and have no task schema, so the script sends them through `/v1/chat/completions`. **None of them has been run from here yet:** the first real call is the check.

| AIR | Model | In / out | Use it for |
| --- | --- | --- | --- |
| `openai:gpt@6.1-sol` | GPT-6.1 Sol | 2 / 10 | OpenAI's coding and agent reasoning model |
| `openai:gpt@6-astra` | GPT-6 Astra | 10 / 50 | OpenAI's frontier model: the hardest reviews, design passes |
| `openai:gpt@6-sol` | GPT-6 Sol | 2 / 10 | The earlier Sol; 6.1 costs the same |
| `openai:gpt@6.1-terra` | GPT-6.1 Terra | 1 / 5 | Fast, visual reasoning (screenshots) |
| `openai:gpt@6-luna` | GPT-6 Luna | 0.10 / 0.50 | Near-free, high-volume checks |
| `zai:glm@5.3` | GLM-5.3 (default) | 1.20 / 4.00 | Coding and agent work, 1M context |
| `zai:glm@5.3-flash` | GLM-5.3 Flash | 0.15 / 0.50 | A near-free first pass |
| `zai:glm@5.2` | GLM-5.2 | 0.80 / 2.55 | Function calling, 128K output |
| `moonshotai:kimi@k3.1-pro` | Kimi K3.1 Pro | 2 / 10 | Long-horizon coding, tool calling |
| `moonshotai:kimi@k3` | Kimi K3 | 3 / 15 | The earlier Kimi; K3.1 Pro is cheaper |
| `deepseek:v4@pro` | DeepSeek-V4-Pro | 0.961 / 1.92 | A strong reviewer at a low price |
| `deepseek:v4.1@flash` | DeepSeek-V4.1-Flash | 0.15 / 0.60 | Cheap, multimodal, tool use |
| `zai:glm@5.1` | GLM-5.1 | 1.40 / 4.40 | In the catalog index, native API |
| `xai:grok@4.3` | Grok 4.3 | 1.25 / 2.50 | The cheapest large reviewer |
| `minimax:m3@0` | MiniMax M3 | 0.30-0.60 / 1.20-2.40 | Very large diffs (512K context) |
| `openai:gpt@5.4` | GPT-5.4 | 2.50 / 15 | A GPT read at half GPT-5.5's price |
| `openai:gpt@5.5` | GPT-5.5 | 5 / 30 | The hardest changes |
| `google:gemini@3.1-pro` | Gemini 3.1 Pro | 2-4 / 12-18 | Long context with strong reasoning |
| `anthropic:claude@opus-4.8` | Claude Opus 4.8 | 5 / 25 | A Claude read when the author was not Claude |

The default reviewer is GLM-5.3 because the Hermes profile thinks with GPT-6.1 Sol: a review from another family catches what the author's family misses. Two more DeepSeek builds (`deepseek:v4@flash`, `deepseek:v4.1@flash-1017`) have pages too; pass `--price` for them. Add a model with `--price IN/OUT` from its Runware page; the script refuses a model it has no price for.

`--thinking low|medium|high` sets the model's reasoning level where its schema has one. Thinking tokens bill as output, so raise `--max-tokens` with it.

## Read the review

- A reviewer is wrong sometimes. **Check each finding against the code before you act on it**, and say which ones you checked.
- Report it plainly: the model, the verdict line, the findings you confirmed, the ones you rejected and why, and the cost.
- Two reviewers that agree are worth more than one that is confident. For a risky change, run a second family and compare.

## Draw an example

When a finding or a UI idea is easier to see than to read, draw it with GPT Image on Runware through the Runware MCP server (`run`, model `openai:gpt-image@2.6-sunburst` for exact layouts and edits, `openai:gpt-image@2.6-flare` for fast drafts; both also make SVG).

- Read `model_pricing` first and say the price. Runware's published examples run about 0.04-0.19 USD an image, and it publishes no upper limit for these token-priced models.
- One image, then wait for the person's reaction. It is a sketch for discussion, not a design to ship.
- Save the result as soon as it is done: Runware's links expire.

## Rules

- No paid call without the person's yes, and never with approvals turned off.
- Never paste the key into a command, a file, a log or a chat.
- The diff leaves the machine. Review only code that may be sent to Runware and the model's provider.
