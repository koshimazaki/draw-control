---
tags: [agents, hermes, runware, mcp]
summary: Run Draw Control from Hermes Agent, open source, with Runware as both the model provider and the generator.
---

# Draw Control in Hermes, on Runware

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT) is an open-source agent. The `beat-path` profile runs it entirely on one Runware key:

- **It thinks with a Runware text model.** Runware's endpoint is OpenAI-compatible (`https://api.runware.ai/v1`), so Hermes uses it as two named custom providers: `runware` speaks the Responses API (`codex_responses`) for the GPT models, which is the only way GPT-6.1 Sol takes tools with reasoning, and `runware-chat` speaks chat completions for every other model, because Runware serves only the GPT models (and Qwen4-Max) on `/v1/responses` ([Runware's OpenAI docs](https://runware.ai/docs/platform/openai), read 16 Nov 2026). The default is GPT-6.1 Sol (`openai:gpt@6.1-sol`, 2 / 10 USD per 1M tokens up to 272K context, 4 / 15 above). `/model` lists 28 Runware text models: GPT-6 Astra, Sol, Terra and Luna, GLM-5.1 to 5.3, Kimi K3 and K3.1 Pro, DeepSeek V4, GPT-5.4/5.5, Claude, Gemini, Grok 4.3 and MiniMax M3. If GPT-6.1 Sol fails, `/model mini` (GPT-5.4 Mini, in the catalog index) is the safest fallback.
- **It edits the shot through the motion-studio MCP server:** shot scripts, describe, undo and render. All of these are local and free.
- **It makes images and video through Runware's own MCP server** (`@runware/mcp`, pinned). What guards that spend, and what does not, is [below](#what-guards-the-spend).

Hermes has no Runware provider or plugin of its own. Its install was searched on 14 Nov 2026, and Runware's GitHub and docs never mention Hermes. This profile and [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md) are that integration, built from parts each side already publishes.

## Set up

```bash
npm run hermes:setup              # installs the beat-path profile in the Hermes home (or updates it)
security add-generic-password -a "$USER" -s runware-api-key -w   # once, macOS: stores the key in the Keychain
npm run hermes                    # starts hermes -p beat-path with the key
```

**Where the key comes from.** Hermes v0.23 can run a chat's turns in its background gateway (launchd on macOS, a systemd user service on Linux, a Scheduled Task on Windows). That process does not have your shell's environment, so an exported `RUNWARE_API_KEY` is not enough there. Per platform:

| Platform | What to do | What Hermes reads |
| --- | --- | --- |
| macOS | Store the key in the Keychain once (the `security` line above). | Setup writes a `key_cmd` under both providers: `/usr/bin/security find-generic-password -s runware-api-key -w`, or `RUNWARE_API_KEY` when there is no such item. Hermes runs it for each key it needs, in the gateway too. |
| Linux | Put `RUNWARE_API_KEY=<key>` in the profile's `.env`, `~/.hermes/profiles/beat-path/.env`, and `chmod 600` it. | `key_env: RUNWARE_API_KEY`. In a gateway turn Hermes reads only the profile's `.env` (and the gateway's own environment), never your shell's. |
| Windows | Put the same line in `%LOCALAPPDATA%\hermes\profiles\beat-path\.env`. | The same as Linux. |

A shell-exported `RUNWARE_API_KEY` still works for a Hermes that runs the turn in the terminal's own process. Setup never writes the key, and an update never touches the profile's `.env` (Hermes treats it as yours). Setup writes `key_cmd` only on macOS: Hermes uses a `key_cmd` before `key_env` and does not fall back when the command fails, so one on Linux or Windows would hide a working `RUNWARE_API_KEY`. `npm run hermes` and `npm run review` also read the Keychain item themselves when the variable is unset.

**Keeping the key safe.**

- **Keychain, not a file, on macOS.** There is no `.env` for this key on a Mac (the repository ignores `.env` and `.env.*`; the profile's `.env` on Linux and Windows lives in the Hermes home, outside the repository). The `security` line above asks for the key with hidden input, so it is never an argument and never reaches shell history. Add `-U` to replace an existing item. `security find-generic-password -s runware-api-key >/dev/null && echo saved` checks it without printing it.
- **Do not export it in a shell profile.** `npm run hermes` reads the Keychain and passes the key to Hermes alone; `export RUNWARE_API_KEY=…` in `~/.zshrc` would hand it to every program started from that shell. Set the variable only on machines without a Keychain (CI, Linux, Windows), from that system's secret store or the profile's `.env` above.
- **Give the agent its own key.** The agent's terminal can read this key (see above), so use a Runware key made for Hermes, not the one the studio or the Draw Control page uses, and revoke it if a session misbehaves. Rotate a key that has been on screen or in a log.
- **What the Keychain does not stop:** a program running as you can read the item through `security`. It protects against leaked files, not against code you run.

**What setup does.** It uses Hermes's own `profile install`, so other profiles are untouched and an update keeps the profile's memory and sessions. It copies the four skills (beat-path, draw-control-example, runware-hermes, runware-review) into the profile and writes two machine paths into its `config.yaml`: the Node that ran the setup and the checkout it ran from. On macOS it also writes the Keychain `key_cmd` above. The Hermes home is `HERMES_HOME` when set, otherwise Hermes's own default: `~/.hermes`, or `%LOCALAPPDATA%\hermes` on Windows. It makes no model call. `npm run hermes:setup -- --dry` only stages the files and says which paths it would write. `HERMES_HOME=<folder>` installs into another Hermes home.

**An update replaces the profile's `config.yaml`, `SOUL.md` and skills** (`profile install --force`). That drops your own edits there, and any "always" approvals, which Hermes keeps in the profile's `config.yaml`. Setup first copies the old `config.yaml` and `SOUL.md` to `config.yaml.bak-<time>` and `SOUL.md.bak-<time>` beside them and prints where.

**Run it again** from the main checkout once this branch is merged, and whenever the Node version changes: until then the profile keeps pointing at the Node and the checkout it was set up from. Setup prints both paths at the end.

## Choose the model

The profile starts on GPT-6.1 Sol. Every Runware model in the profile is one switch away, by a short name or its full ID:

| Where | How |
| --- | --- |
| At launch | `npm run hermes -- -m astra` or `hermes -p beat-path -m kimi` |
| In a chat | `/model glm` (the session), `/model astra --global` (also the default from now on) |
| One turn only | `/model astra --once`: one hard question on Astra, then back to Sol |
| Any Runware ID | `/model <AIR> --provider runware` for a GPT model, `--provider runware-chat` for any other, e.g. `/model deepseek:v4.1@flash --provider runware-chat` |

Short names: `sol` (GPT-6.1 Sol), `astra` (GPT-6 Astra), `terra` (GPT-6.1 Terra), `luna` (GPT-6 Luna), `glm` (GLM-5.3), `kimi` (Kimi K3.1 Pro), `deepseek` (DeepSeek-V4-Pro), `opus` (Claude Opus 4.8), `gemini` (Gemini 3.1 Pro), `grok` (Grok 4.3), `mini` (GPT-5.4 Mini). `npm run review -- --model <name>` takes the same names. Prices are in [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md); every model ID and price there was checked against its public Runware page on 15 Nov 2026.

## What guards the spend

Three things spend the owner's Runware credits, and each is guarded differently.

**The chat model itself** (`providers.runware`). Every turn is billed by Runware per token at the model's rate. **Nothing in this profile limits it or asks first**: the spend limit below does not see it. Pick a cheaper model for long sessions and watch the Runware dashboard.

**Runware's MCP server** (images, video, audio). Two settings, and this is exactly what Hermes does with them (`tools/mcp_tool_costs.py` and `tools/mcp_tool_handlers.py` in the Hermes install):

- `trust: untrusted`: every call to a tool the server does not mark read-only, above all `run`, asks for approval. Answering "for this session" or "always" stops the asking for that tool: "always" is saved in the profile's `config.yaml` and lasts until you remove it (or a setup update replaces the file).
- `tool_costs` and `spend_limit: 10`: Hermes books the top of the declared range, **5 USD**, for every `run` it dispatches, whatever the task really costs. The tally is kept in memory for the one chat and starts again at 0 in a new chat or a restarted Hermes. It never sees Runware's real bill. A call that would take the chat's tally past 10 USD is **not blocked**: it asks for an explicit yes for that one call, and that question comes back on every further call, even after an "always". With a 5 USD estimate that is the third `run` of a chat.

So the limit is a counter of declared estimates that forces a fresh yes from the third paid call on; it is not a cap on what Runware charges. The agent is told to read `model_pricing` and say the price before each `run` (SOUL.md, [`skills/runware-hermes`](../skills/runware-hermes/SKILL.md)), but that is an instruction, not something Hermes enforces.

**`npm run review`** (below) sends a diff to a Runware text model. It is a terminal command, outside the MCP approval prompt: Hermes does not ask before the agent runs it. The script guards itself: a price ceiling with `--max-usd` (default 0.50 USD), a y/N question on a terminal, and with no terminal (an agent's tool call) a refusal unless `--yes` is passed. The agent is told to ask the owner and pass `--yes` only after a yes; Hermes does not enforce that either.

## The review script: what it sends and spends

`npm run review` sends the diff of the branch against `origin/main` (or `--range`, or `--staged`) and the repo's `AGENTS.md` to Runware and the model's provider. Default reviewer: GLM-5.3 (`zai:glm@5.3`, 1.20 / 4.00 USD per 1M tokens).

- **Never sent:** `.env*`, `*.key`, `*.pem`, lockfiles (`*.lock`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `bun.lockb`) and anything under a `vendor/` folder. The run lists those rules and every changed file they left out. The diff is taken with `--no-ext-diff --no-textconv`, so no local diff driver adds anything.
- **Refused:** text that looks like a secret (a private key header, a `Bearer` token, an `sk-`, GitHub, AWS, Google or Slack token, a long value assigned to a key-, secret-, token- or password-named field, or the Runware key itself). The run names the file and line, never the value, sends nothing and exits non-zero.
- **Priced:** the ceiling is every input token (3 characters a token) plus the full output allowance, at the price on file; for a tiered model, the highest tier. `--price IN/OUT` is accepted only for a model with no price on file. After a run it prints what Runware reported and warns if that went over the ceiling.
- **Free:** `npm run review -- --dry` prints all of the above and sends nothing.

## Things to ask it

- "Open the car on the bend (`examples/scripts/beat-path-ex3-car.txt`), make the car a lorry with a trailer, and keep the camera swinging round it on the snare." The agent edits the shot description, describes the shot back and renders the guide.
- "Draw a path that weaves between the towers, and move the camera to the top on every fourth snare." The agent writes the paths in metres and cuts the Camera lane on the snares.
- "Make a character reference: a courier in a plain brown uniform, three views." The agent reads the price through Runware's MCP, says it, and runs it after your yes (and after Hermes's own approval prompt).
- "Review this branch with GLM-5.3, then check its findings." The agent dry-runs `npm run review`, tells you the ceiling and what goes out, runs it with `--yes` only after your yes, and checks each finding against the code ([`skills/runware-review`](../skills/runware-review/SKILL.md)).
- "Sketch how the Moves lane could look with GPT Image." One image through Runware's MCP, priced first.

## What is verified

| Check | State |
| --- | --- |
| The profile installs with `hermes profile install` (Hermes v0.23.1) | yes, 14 Nov 2026; again into a scratch `HERMES_HOME` on 15 Nov, install and update with backups |
| The installed config parses with the paths quoted (a path holding `: `, ` #`, quotes and a backslash) | yes, 15 Nov 2026, with PyYAML from the Hermes install |
| The motion-studio MCP server connects (`hermes -p beat-path mcp test motion-studio`) | yes: 14 tools, 15 Nov 2026 |
| Runware's MCP server connects (`hermes -p beat-path mcp test runware`) | yes on 14 Nov 2026: 12 tools (listing needs no valid key); not re-run |
| Which Runware MCP tools are marked read-only (and so skip the approval prompt) | **not checked** |
| The key resolves in the profile as installed, with no `RUNWARE_API_KEY` in the environment (the gateway case), and every short name keeps its provider's transport | yes on macOS, 16 Nov 2026: setup into a scratch `HERMES_HOME`, then Hermes v0.23.1's own resolver (`resolve_runtime_provider`, `switch_model`), no network. The same check with the Linux/Windows config, the key from `RUNWARE_API_KEY` or from the profile's `.env`, passed on macOS; **Linux and Windows themselves are not tested** |
| GPT-6.1 Sol refuses tools with reasoning on chat completions; `codex_responses` is what fixes it | from the owner's profile logs, 15 Nov 2026 (the 400 from `/v1/chat/completions`), and the owner's working profile since |
| Runware's text models answer through Hermes, with tool calls | **not yet** through Hermes from this repository's profile |
| Image generation through `@runware/mcp` from Hermes | **not yet**: paid, needs the owner's go |
| `npm run review -- --dry`: excludes, secret scan, ceiling | yes, 15 Nov 2026: 13 files, about 25k tokens for this branch, ceiling 0.062 USD on GLM-5.3 |
| `npm run review` refuses without a terminal and without `--yes`, and on a planted fake secret | yes, 15 Nov 2026 |
| `npm run review` gets a review back from Runware | **not yet**: paid, needs the key |

Each model's schema has a `tools` parameter, but that doesn't show the model calls tools well. Run a small task on each model first, and report which model did the work.
