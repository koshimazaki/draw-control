#!/usr/bin/env node
/**
 * Review a git diff with a text model on Runware: a second opinion from another model family,
 * from any agent harness (Hermes, Claude Code, Codex) or a plain terminal.
 *
 *   npm run review -- --dry                         # size and price ceiling, sends nothing
 *   npm run review                                  # this branch against origin/main, GLM-5.3
 *   npm run review -- --model openai:gpt@5.5 --range HEAD~1..HEAD
 *   npm run review -- --staged --focus "the playback sync"
 *
 * The key comes from RUNWARE_API_KEY, or on macOS from the Keychain item "runware-api-key"
 * (add it once with: security add-generic-password -a "$USER" -s runware-api-key -w).
 * It is never printed. A run refuses to start when its price ceiling is over --max-usd.
 */
/* global fetch, setTimeout */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// USD per 1M tokens, input / output: Runware's catalog, read 14 Nov 2026. Tiered models use the
// upper tier, so the ceiling holds. A model not listed here needs --price IN/OUT.
const PRICES = {
  "zai:glm@5.1": [1.4, 4.4],
  "openai:gpt@5.5": [5, 30],
  "openai:gpt@5.4": [2.5, 15],
  "openai:gpt@5.4-mini": [0.75, 4.5],
  "anthropic:claude@opus-4.8": [5, 25],
  "google:gemini@3.1-pro": [4, 18],
  "xai:grok@4.3": [1.25, 2.5],
  "minimax:m3@0": [0.6, 2.4],
  "anthropic:claude@sonnet-4.6": [3, 15],
  "anthropic:claude@haiku-4.5": [1, 5],
  "google:gemini@3-flash": [1, 3],
  // Documented on their model pages (runware.ai/docs/models/<id>) with the OpenAI-compatible
  // chat endpoint as the example, but absent from the catalog index and with no task schema.
  "zai:glm@5.3": [1.2, 4],
  "zai:glm@5.3-flash": [0.15, 0.5],
  "zai:glm@5.2": [0.8, 2.55],
  "moonshotai:kimi@k3.1-pro": [2, 10],
  "moonshotai:kimi@k3": [3, 15],
  "deepseek:v4@pro": [0.961, 1.92],
  "deepseek:v4.1@flash": [0.15, 0.6],
};
// These go through /v1/chat/completions, the route their pages document; the rest use the
// native task API, which also reports the charged cost.
const CHAT_ONLY = new Set(["zai:glm@5.3", "zai:glm@5.3-flash", "zai:glm@5.2", "moonshotai:kimi@k3.1-pro", "moonshotai:kimi@k3", "deepseek:v4@pro", "deepseek:v4.1@flash"]);
const API = "https://api.runware.ai/v1";
const MAX_DIFF = 400_000; // characters, about 115k tokens
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const o = { model: "zai:glm@5.3", range: "origin/main...HEAD", staged: false, dry: false, maxUsd: 0.5, maxTokens: 8000, focus: "", out: "", price: null, thinking: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === "--model") o.model = next();
    else if (a === "--range") o.range = next();
    else if (a === "--staged") o.staged = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--max-usd") o.maxUsd = Number(next());
    else if (a === "--max-tokens") o.maxTokens = Number(next());
    else if (a === "--focus") o.focus = next();
    else if (a === "--out") o.out = next();
    else if (a === "--thinking") o.thinking = next();
    else if (a === "--price") o.price = next().split("/").map(Number);
    else throw new Error(`unknown option ${a}`);
  }
  if (!/^[a-z0-9-]+:[a-z0-9-]+@[0-9a-z.-]+$/.test(o.model)) throw new Error(`not a Runware AIR id: ${o.model}`);
  if (!/^[\w./~^@{}-]+(\.{2,3}[\w./~^@{}-]+)?$/.test(o.range) || o.range.startsWith("-")) throw new Error(`not a git range: ${o.range}`);
  if (!(o.maxUsd > 0 && o.maxUsd <= 5)) throw new Error("--max-usd must be above 0 and at most 5");
  if (!(Number.isInteger(o.maxTokens) && o.maxTokens >= 256 && o.maxTokens <= 64000)) throw new Error("--max-tokens must be a whole number from 256 to 64000");
  if (o.thinking && !/^[a-z]{2,10}$/.test(o.thinking)) throw new Error("--thinking takes a level such as low, medium or high");
  if (o.focus.length > 500) throw new Error("--focus is at most 500 characters");
  if (o.price && !(o.price.length === 2 && o.price.every((n) => n > 0 && n < 1000))) throw new Error("--price is IN/OUT in USD per 1M tokens, e.g. 2/8");
  return o;
}

/** Upper bound in USD: every input token plus the full output allowance (thinking counts as output). */
export function ceiling(chars, maxTokens, [pin, pout]) {
  const tokens = Math.ceil(chars / 3); // code tokenizes denser than prose; 3 chars a token errs high
  return { tokens, usd: (tokens * pin + maxTokens * pout) / 1e6 };
}

export function prompt(rules, focus) {
  return [
    "You review a git diff for this repository. Report only problems you are confident about, most severe first:",
    "correctness bugs, broken edge cases, security issues (keys, input validation), and clear breaches of the repo rules below.",
    "Skip style preferences and anything a type checker or linter would catch.",
    "For each finding write: `path:line` - severity (high, medium, low) - what goes wrong, with the concrete input or state - the fix.",
    "Quote the line you mean. If you are unsure, say so and why, rather than presenting a guess as a finding.",
    "End with one line: `Verdict: ship`, `Verdict: fix first` or `Verdict: needs a closer look`.",
    focus ? `The author asks you to look closely at: ${focus}` : "",
    "Repository rules (AGENTS.md):",
    rules,
  ].filter(Boolean).join("\n");
}

function key() {
  if (process.env.RUNWARE_API_KEY) return process.env.RUNWARE_API_KEY.trim();
  if (process.platform === "darwin") {
    try { return execFileSync("security", ["find-generic-password", "-s", "runware-api-key", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not in the Keychain */ }
  }
  return "";
}

async function call(apiKey, tasks) {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(tasks) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors?.length) throw new Error(`Runware ${res.status}: ${(body.errors ?? []).map((e) => e.message).join("; ") || res.statusText}`);
  return body.data?.[0] ?? {};
}

/** Runware's native task API: reports the charged cost. */
async function task(apiKey, o, system, user) {
  const taskUUID = randomUUID();
  const settings = { systemPrompt: system, maxTokens: o.maxTokens, ...(o.thinking ? { thinkingLevel: o.thinking } : {}) };
  let r = await call(apiKey, [{ taskType: "textInference", taskUUID, model: o.model, messages: [{ role: "user", content: user }], settings, includeCost: true, includeUsage: true }]);
  // Over HTTP a task still running after 120 s comes back as "processing": poll for it.
  for (let i = 0; !r.text && r.status === "processing" && i < 60; i++) {
    await new Promise((f) => setTimeout(f, 5000));
    r = await call(apiKey, [{ taskType: "getResponse", taskUUID }]);
  }
  return r;
}

/** The OpenAI-compatible route, for models documented only there. */
async function chat(apiKey, o, system, user) {
  const body = { model: o.model, max_tokens: o.maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }], ...(o.thinking ? { reasoning_effort: o.thinking } : {}) };
  const res = await fetch(`${API}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Runware ${res.status}: ${j.error?.message ?? j.errors?.[0]?.message ?? res.statusText}`);
  const c = j.choices?.[0] ?? {};
  return { text: c.message?.content ?? "", finishReason: c.finish_reason, usage: { promptTokens: j.usage?.prompt_tokens, completionTokens: j.usage?.completion_tokens, thinkingTokens: j.usage?.completion_tokens_details?.reasoning_tokens } };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const args = o.staged ? ["diff", "--no-color", "-U5", "--cached"] : ["diff", "--no-color", "-U5", o.range];
  const diff = execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!diff.trim()) { console.log("Nothing to review: the diff is empty."); return; }
  if (diff.length > MAX_DIFF) throw new Error(`the diff is ${diff.length} characters, over ${MAX_DIFF}: review a narrower --range`);
  const rules = existsSync(join(repo, "AGENTS.md")) ? readFileSync(join(repo, "AGENTS.md"), "utf8") : "";
  const system = prompt(rules, o.focus);
  const price = o.price ?? PRICES[o.model];
  if (!price) throw new Error(`no price on file for ${o.model}: pass --price IN/OUT from its Runware page`);
  const est = ceiling(system.length + diff.length, o.maxTokens, price);
  const what = o.staged ? "the staged changes" : o.range;
  console.log(`Review of ${what} with ${o.model}: about ${est.tokens.toLocaleString()} input tokens, up to ${o.maxTokens.toLocaleString()} output. Ceiling ${est.usd.toFixed(3)} USD (limit ${o.maxUsd} USD).`);
  if (est.usd > o.maxUsd) throw new Error(`the ceiling is over --max-usd ${o.maxUsd}: narrow the range, lower --max-tokens, or raise the limit`);
  if (o.dry) { console.log("Dry run: nothing sent, nothing charged."); return; }
  const apiKey = key();
  if (!apiKey) throw new Error("no key: set RUNWARE_API_KEY, or add the Keychain item runware-api-key (see the top of this script)");

  const user = `Review this diff:\n\n${diff}`;
  const r = CHAT_ONLY.has(o.model) ? await chat(apiKey, o, system, user) : await task(apiKey, o, system, user);
  if (!r.text) throw new Error(`no review came back (status ${r.status ?? "unknown"}, finish ${r.finishReason ?? "unknown"})`);
  const u = r.usage ?? {};
  // The native API reports the charge; the chat route only reports tokens, so price those.
  const cost = r.cost != null ? `${r.cost} USD charged` : u.promptTokens != null ? `about ${((u.promptTokens * price[0] + (u.completionTokens ?? 0) * price[1]) / 1e6).toFixed(4)} USD from the token counts` : "not reported";
  const footer = `\n---\n${o.model} on Runware: ${u.promptTokens ?? "?"} in, ${u.completionTokens ?? "?"} out${u.thinkingTokens ? ` (${u.thinkingTokens} thinking)` : ""}, ${cost}, finish ${r.finishReason ?? "?"}.`;
  if (o.out) { writeFileSync(o.out, `${r.text}\n${footer}\n`); console.log(`Saved to ${o.out}.`); }
  console.log(`\n${r.text}\n${footer}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`runware-review: ${e.message}`); process.exit(1); });
