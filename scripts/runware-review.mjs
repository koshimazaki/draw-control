#!/usr/bin/env node
/**
 * Review a git diff with a text model on Runware: a second opinion from another model family,
 * from any agent harness (Hermes, Claude Code, Codex) or a plain terminal.
 *
 *   npm run review -- --dry                         # what would be sent and the price ceiling; free
 *   npm run review                                  # this branch against origin/main, GLM-5.3; asks y/N
 *   npm run review -- --model sol --range HEAD~1..HEAD
 *   npm run review -- --staged --focus "the playback sync"
 *   npm run review -- --yes                         # no terminal to ask on: only after the owner said yes
 *
 * A real run spends Runware credits and sends the diff and AGENTS.md to Runware and the model's
 * provider. It shows the ceiling and what goes out, then asks y/N on a terminal; with no terminal
 * (an agent's tool call, CI) it refuses unless --yes is passed. It refuses a ceiling over --max-usd,
 * and refuses to send anything that looks like a secret, naming the file and line, never the value.
 *
 * The key comes from RUNWARE_API_KEY, or on macOS from the Keychain item "runware-api-key"
 * (add it once with: security add-generic-password -a "$USER" -s runware-api-key -w).
 * It is never printed.
 */
/* global fetch, setTimeout */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// USD per 1M tokens, input / output, from each model's public page (runware.ai/docs/models/<id>),
// read 15 Nov 2026. Where a page lists tiers (by context length, or by input type), this is the
// highest tier, so the ceiling holds whatever the tier. A model not listed needs --price IN/OUT.
export const PRICES = {
  // In the catalog index (index.json), native task API.
  "zai:glm@5.1": [1.4, 4.4],
  "openai:gpt@5.5": [5, 30],
  "openai:gpt@5.4": [2.5, 15],
  "openai:gpt@5.4-mini": [0.75, 4.5],
  "openai:gpt@5.4-pro": [30, 180],
  "anthropic:claude@opus-4.8": [5, 25],
  "anthropic:claude@opus-4.7": [5, 25],
  "anthropic:claude@sonnet-4.6": [3, 15],
  "anthropic:claude@haiku-4.5": [1, 5],
  "anthropic:claude@fable-5": [10, 50],
  "google:gemini@3.1-pro": [4, 18], // 2 / 12 under 200K context
  "google:gemini@3.5-flash": [1.5, 9],
  "google:gemini@3-flash": [1, 3], // input 0.50 for text, 1.00 for audio
  "google:gemini@3.1-flash-lite": [0.5, 1.5], // input 0.25 for text, 0.50 for audio
  "xai:grok@4.3": [1.25, 2.5],
  "minimax:m3@0": [0.6, 2.4], // 0.30 / 1.20 up to 512K context
  // Status "compatible-only": a model page with the OpenAI-compatible chat endpoint, but no entry
  // in index.json and no task schema.
  "openai:gpt@6.1-sol": [4, 15], // 2 / 10 up to 272K context
  "openai:gpt@6-astra": [20, 75], // 10 / 50 up to 272K
  "openai:gpt@6-sol": [4, 15], // 2 / 10 up to 272K
  "openai:gpt@6.1-terra": [2, 7.5], // 1 / 5 up to 272K
  "openai:gpt@6-luna": [0.2, 0.75], // 0.10 / 0.50 up to 272K
  "zai:glm@5.3": [1.2, 4],
  "zai:glm@5.3-flash": [0.15, 0.5],
  "zai:glm@5.2": [0.8, 2.55],
  "moonshotai:kimi@k3.1-pro": [2, 10],
  "moonshotai:kimi@k3": [3, 15],
  "deepseek:v4@pro": [0.961, 1.92],
  "deepseek:v4.1@flash": [0.15, 0.6],
  "deepseek:v4@flash": [0.076, 0.153],
  "deepseek:v4.1@flash-1017": [0.15, 0.6],
};
// These go through /v1/chat/completions, the route their pages document; the rest use the
// native task API, which also reports the charged cost.
const CHAT_ONLY = new Set(["openai:gpt@6.1-sol", "openai:gpt@6-astra", "openai:gpt@6-sol", "openai:gpt@6.1-terra", "openai:gpt@6-luna", "zai:glm@5.3", "zai:glm@5.3-flash", "zai:glm@5.2", "moonshotai:kimi@k3.1-pro", "moonshotai:kimi@k3", "deepseek:v4@pro", "deepseek:v4.1@flash", "deepseek:v4@flash", "deepseek:v4.1@flash-1017"]);
// The same short names as the Hermes profile's model_aliases.
export const ALIASES = { sol: "openai:gpt@6.1-sol", astra: "openai:gpt@6-astra", terra: "openai:gpt@6.1-terra", luna: "openai:gpt@6-luna", glm: "zai:glm@5.3", kimi: "moonshotai:kimi@k3.1-pro", deepseek: "deepseek:v4@pro", opus: "anthropic:claude@opus-4.8", gemini: "google:gemini@3.1-pro", grok: "xai:grok@4.3", mini: "openai:gpt@5.4-mini" };
// Never sent, whatever the range: env files, keys and certificates, lockfiles, vendored code.
export const EXCLUDES = ["**/.env*", "**/*.key", "**/*.pem", "**/*.lock", "**/package-lock.json", "**/npm-shrinkwrap.json", "**/pnpm-lock.yaml", "**/bun.lockb", "**/vendor/**"];
const API = "https://api.runware.ai/v1";
const MAX_DIFF = 400_000; // characters, about 115k tokens
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const o = { model: "zai:glm@5.3", range: "origin/main...HEAD", staged: false, dry: false, yes: false, maxUsd: 0.5, maxTokens: 8000, focus: "", out: "", price: null, thinking: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === "--model") { const v = next(); o.model = ALIASES[v] ?? v; }
    else if (a === "--range") o.range = next();
    else if (a === "--staged") o.staged = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--yes") o.yes = true;
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

/** The price on file always wins; --price is only for a model that has none. */
export function resolvePrice(model, price) {
  const onFile = PRICES[model];
  if (onFile && price) throw new Error(`${model} has a price on file (${onFile.join(" / ")} USD per 1M tokens): --price is only for a model with none`);
  if (onFile) return onFile;
  if (!price) throw new Error(`no price on file for ${model}: pass --price IN/OUT from its Runware page`);
  return price;
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

// Secret-looking strings. A finding names the place and the kind, never the value.
const SECRET_PATTERNS = [
  ["private key header", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/],
  ["API key (sk-...)", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["key-shaped value", /(?:api[_-]?key|secret|token|passw(?:or)?d|auth)[a-z_-]*["']?\s*[:=]\s*["']?[A-Za-z0-9_\-+/=.]{24,}/i],
];

/** Secret-looking lines in `text`; `where(i)` names line i (0-based) for the report. */
export function scanSecrets(text, where, values = []) {
  const found = [];
  const known = values.filter((v) => typeof v === "string" && v.length >= 8);
  text.split("\n").forEach((line, i) => {
    if (known.some((v) => line.includes(v))) { found.push({ at: where(i), kind: "the Runware key itself" }); return; }
    const hit = SECRET_PATTERNS.find(([, re]) => re.test(line));
    if (hit) found.push({ at: where(i), kind: hit[0] });
  });
  return found;
}

/** Maps each line of a unified diff to `path:line` in the new file (the old file for a removed line). */
export function diffLocator(diff) {
  const lines = diff.split("\n"), at = new Array(lines.length);
  let file = "(diff header)", oldN = 0, newN = 0, inHunk = false;
  lines.forEach((l, i) => {
    let m;
    if (l.startsWith("diff --git ")) { m = / b\/(.+)$/.exec(l); file = m ? m[1] : l.slice(11); inHunk = false; at[i] = `${file} (diff header)`; return; }
    if ((m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(l))) { oldN = Number(m[1]); newN = Number(m[2]); inHunk = true; at[i] = `${file}:${newN} (hunk header)`; return; }
    if (!inHunk) { at[i] = `${file} (diff header)`; return; }
    if (l.startsWith("-")) { at[i] = `${file}:${oldN} (removed line)`; oldN++; return; }
    at[i] = `${file}:${newN}`;
    if (l.startsWith("+")) newN++; else if (!l.startsWith("\\")) { oldN++; newN++; }
  });
  return (i) => at[i] ?? file;
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

/** The diff with the excludes applied, the files in it, and the changed files the excludes left out. */
function collect(o) {
  const base = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-U5", ...(o.staged ? ["--cached"] : [o.range])];
  const git = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const spec = ["--", ".", ...EXCLUDES.map((g) => `:(exclude,glob)${g}`)];
  const diff = git([...base, ...spec]);
  const files = git([...base, "--name-only", ...spec]).split("\n").filter(Boolean);
  const all = git([...base, "--name-only"]).split("\n").filter(Boolean);
  return { diff, files, dropped: all.filter((f) => !files.includes(f)) };
}

/** What Runware reported against the ceiling; warnings, never an error. */
export function overCeiling(est, usage, cost, price) {
  const warn = [];
  const used = cost ?? (usage.promptTokens != null ? (usage.promptTokens * price[0] + (usage.completionTokens ?? 0) * price[1]) / 1e6 : null);
  if (used != null && used > est.usd) warn.push(`the run cost about ${used.toFixed(4)} USD, over the ceiling of ${est.usd.toFixed(4)} USD`);
  if (usage.promptTokens != null && usage.promptTokens > est.tokens) warn.push(`Runware counted ${usage.promptTokens} input tokens, over the estimate of ${est.tokens}`);
  return warn;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(question)).trim()); } finally { rl.close(); }
}

let sent = false; // set the moment a request leaves for Runware

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const price = resolvePrice(o.model, o.price);
  const { diff, files, dropped } = collect(o);
  const what = o.staged ? "the staged changes" : o.range;
  console.log(`Never sent: ${EXCLUDES.join(", ")}.${dropped.length ? `\nLeft out of this diff by those rules: ${dropped.join(", ")}.` : ""}`);
  if (!diff.trim()) { console.log("Nothing to review: the diff is empty after the excludes."); return; }
  if (diff.length > MAX_DIFF) throw new Error(`the diff is ${diff.length} characters, over ${MAX_DIFF}: review a narrower --range`);
  const rules = existsSync(join(repo, "AGENTS.md")) ? readFileSync(join(repo, "AGENTS.md"), "utf8") : "";
  const system = prompt(rules, o.focus);
  const user = `Review this diff:\n\n${diff}`;
  const chars = system.length + user.length;

  // The scan runs on everything that would leave the machine, in --dry too.
  const rulesFrom = system.split("\n").length - rules.split("\n").length;
  const inPrompt = (i) => (i >= rulesFrom ? `AGENTS.md:${i - rulesFrom + 1}` : `the prompt (--focus), line ${i + 1}`);
  const scan = (values) => [...scanSecrets(system, inPrompt, values), ...scanSecrets(diff, diffLocator(diff), values)];
  const secrets = scan([process.env.RUNWARE_API_KEY?.trim() ?? ""]);
  if (secrets.length) throw new Error(`refusing to send: secret-looking text at\n${secrets.map((s) => `  ${s.at}: ${s.kind}`).join("\n")}\nRemove it, or review a range without it.`);

  const est = ceiling(chars, o.maxTokens, price);
  console.log(`Review of ${what} with ${o.model} (${price.join(" / ")} USD per 1M tokens): ${files.length} files, ${chars.toLocaleString()} characters (the diff and AGENTS.md), about ${est.tokens.toLocaleString()} input tokens, up to ${o.maxTokens.toLocaleString()} output.`);
  console.log(`Ceiling ${est.usd.toFixed(3)} USD (limit ${o.maxUsd} USD). A real run sends this to Runware and the model's provider.`);
  if (est.usd > o.maxUsd) throw new Error(`the ceiling is over --max-usd ${o.maxUsd}: narrow the range, lower --max-tokens, or raise the limit`);
  if (o.dry) { console.log("Dry run: nothing sent, nothing charged."); return; }

  if (!o.yes) {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) throw new Error("this spends Runware credits and there is no terminal to ask on: ask the owner, then pass --yes");
    if (!(await confirm(`Send ${files.length} files (${chars.toLocaleString()} characters) to ${o.model}, ceiling ${est.usd.toFixed(3)} USD? [y/N] `))) throw new Error("no yes given");
  }
  const apiKey = key();
  if (!apiKey) throw new Error("no key: set RUNWARE_API_KEY, or add the Keychain item runware-api-key (see the top of this script)");
  const keyHits = scan([apiKey]).filter((s) => s.kind === "the Runware key itself");
  if (keyHits.length) throw new Error(`refusing to send: the Runware key itself is in the text at ${keyHits.map((s) => s.at).join(", ")}`);

  sent = true;
  const r = CHAT_ONLY.has(o.model) ? await chat(apiKey, o, system, user) : await task(apiKey, o, system, user);
  if (!r.text) throw new Error(`no review came back (status ${r.status ?? "unknown"}, finish ${r.finishReason ?? "unknown"})`);
  const u = r.usage ?? {};
  // The native API reports the charge; the chat route only reports tokens, so price those.
  const cost = r.cost != null ? `${r.cost} USD charged` : u.promptTokens != null ? `about ${((u.promptTokens * price[0] + (u.completionTokens ?? 0) * price[1]) / 1e6).toFixed(4)} USD from the token counts` : "not reported";
  const footer = `\n---\n${o.model} on Runware: ${u.promptTokens ?? "?"} in, ${u.completionTokens ?? "?"} out${u.thinkingTokens ? ` (${u.thinkingTokens} thinking)` : ""}, ${cost}, finish ${r.finishReason ?? "?"}.`;
  if (o.out) { writeFileSync(o.out, `${r.text}\n${footer}\n`); console.log(`Saved to ${o.out}.`); }
  console.log(`\n${r.text}\n${footer}`);
  for (const w of overCeiling(est, u, r.cost != null ? Number(r.cost) : null, price)) console.warn(`runware-review: warning: ${w}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`runware-review: ${e.message}`);
    console.error(sent ? "runware-review: the request did go to Runware; its dashboard shows what was charged." : "runware-review: nothing was sent to Runware, nothing charged.");
    process.exit(1);
  });
}
