#!/usr/bin/env node
/**
 * Install (or update) the `beat-path` Hermes profile from hermes/beat-path/ plus the repo's
 * skills/, then point its MCP server at this checkout. Uses Hermes's own `profile install`, so
 * other profiles are untouched and an update keeps the profile's memory and sessions. It does
 * replace the profile's config.yaml, SOUL.md and skills, so an update first copies the old
 * config.yaml and SOUL.md to timestamped backups beside them. Makes no model call, spends nothing.
 *
 *   npm run hermes:setup            # install, or update an existing beat-path profile
 *   npm run hermes:setup -- --dry   # stage the distribution and print where, install nothing
 *
 * HERMES_HOME picks another Hermes home (default ~/.hermes, or %LOCALAPPDATA%\hermes on Windows, as
 * Hermes itself uses), e.g. to try an install in a scratch folder. On macOS it also writes a key_cmd
 * line that reads the Keychain item runware-api-key (see keychainLookup below).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const name = "beat-path";

/**
 * Fills the quoted "__NODE__..." and "__REPO__..." strings in the profile config with real paths,
 * written as YAML double-quoted strings (JSON's escaping is valid there), so a path holding
 * `: `, ` #`, quotes or backslashes cannot break the file. Throws if a placeholder is missing.
 */
export function fillPaths(text, node, repo) {
  const seen = new Set();
  const out = text.replace(/"__(NODE|REPO)__([^"\n]*)"/g, (_, which, rest) => {
    seen.add(which);
    return JSON.stringify((which === "NODE" ? node : repo) + rest);
  });
  for (const which of ["NODE", "REPO"]) if (!seen.has(which)) throw new Error(`the profile config has no "__${which}__" placeholder to fill`);
  if (/__(NODE|REPO)__/.test(out)) throw new Error("the profile config has an unquoted __NODE__ or __REPO__ placeholder");
  return out;
}

/**
 * The Keychain lookup Hermes runs for the key (as `key_cmd`, through a shell), with no account name,
 * so nothing personal is written; it is the same lookup `npm run hermes` makes. When the item is
 * missing it prints RUNWARE_API_KEY instead, since Hermes itself never falls back to key_env once a
 * key_cmd is set. It prints only the key.
 */
export const KEYCHAIN_KEY_CMD = "/usr/bin/security find-generic-password -s runware-api-key -w 2>/dev/null || printenv RUNWARE_API_KEY";

/**
 * On macOS, adds `key_cmd: <Keychain lookup>` under every provider that names
 * `key_env: RUNWARE_API_KEY`, so a turn run by the Hermes gateway (launchd, no shell environment)
 * still finds the key. Elsewhere it returns the text unchanged: Hermes runs a key_cmd before key_env
 * and does not fall back to key_env when it fails, so a key_cmd on Linux or Windows would break a
 * key that RUNWARE_API_KEY provides. Throws on macOS if there is no provider to add it to.
 */
export function keychainLookup(text, platform = process.platform) {
  if (platform !== "darwin") return text;
  let added = 0;
  const out = text.replace(/^( +)key_env: RUNWARE_API_KEY(\r?\n)/gm, (line, indent, eol) => {
    added++;
    return `${line}${indent}key_cmd: ${KEYCHAIN_KEY_CMD}${eol}`;
  });
  if (!added) throw new Error("the profile config has no provider with key_env: RUNWARE_API_KEY to add the Keychain lookup to");
  return out;
}

/** The Hermes home: HERMES_HOME when set, else Hermes's own default for the platform. */
export function hermesHome(env = process.env, platform = process.platform, home = homedir()) {
  const set = env.HERMES_HOME?.trim();
  if (set) return set;
  if (platform === "win32") return win32.join(env.LOCALAPPDATA?.trim() || win32.join(home, "AppData", "Local"), "hermes");
  return join(home, ".hermes");
}

/** The installed config.yaml text: this machine's paths, and on macOS the Keychain lookup. */
export function profileConfig(text, node, repo, platform = process.platform) {
  return keychainLookup(fillPaths(text, node, repo), platform);
}

/** Copies each existing file to `<file>.bak-<stamp>` beside it; returns the backups made. */
export function backup(dir, files, stamp = new Date().toISOString().replace(/[:.]/g, "-")) {
  const made = [];
  for (const f of files) {
    const from = join(dir, f);
    if (!existsSync(from)) continue;
    const to = `${from}.bak-${stamp}`;
    copyFileSync(from, to);
    made.push(to);
  }
  return made;
}

function main() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dry = process.argv.includes("--dry");

  // The distribution as Hermes expects it: SOUL.md, config.yaml, distribution.yaml and skills/.
  const stage = mkdtempSync(join(tmpdir(), "beat-path-profile-"));
  cpSync(join(repo, "hermes", name), stage, { recursive: true });
  for (const skill of ["beat-path", "draw-control-example", "runware-hermes", "runware-review"]) cpSync(join(repo, "skills", skill), join(stage, "skills", skill), { recursive: true });
  // Fail here, before anything is installed, if the config cannot be filled in.
  profileConfig(readFileSync(join(stage, "config.yaml"), "utf8"), process.execPath, repo);
  const keychain = process.platform === "darwin";
  if (dry) { console.log(`Staged ${name} at ${stage} (not installed). It would point at Node ${process.execPath} and the checkout ${repo}${keychain ? ", and read the key from the Keychain item runware-api-key" : ""}.`); return; }

  const home = hermesHome();
  const installed = join(home, "profiles", name);
  const update = existsSync(installed);
  if (update) {
    const saved = backup(installed, ["config.yaml", "SOUL.md"]);
    console.log(saved.length ? `Backed up before the update:\n${saved.map((p) => `  ${p}`).join("\n")}` : `Nothing to back up in ${installed}.`);
  }
  try {
    execFileSync("hermes", ["profile", "install", stage, "--name", name, "-y", ...(update ? ["--force"] : [])], { stdio: "inherit", env: { ...process.env, HERMES_HOME: home } });
  } finally { rmSync(stage, { recursive: true, force: true }); }

  // Machine paths: this Node and this checkout (the config ships with placeholders).
  const config = join(installed, "config.yaml");
  if (!existsSync(config)) throw new Error(`hermes profile install finished, but there is no ${config}. Look for where it put the profile (hermes profile list), then fill in the Node and checkout paths by hand.`);
  writeFileSync(config, profileConfig(readFileSync(config, "utf8"), process.execPath, repo));

  console.log(`\n${update ? "Updated" : "Installed"} Hermes profile "${name}" (${installed}).`);
  console.log(`Baked into its config.yaml:\n  Node:     ${process.execPath}\n  checkout: ${repo}`);
  console.log("Run `npm run hermes:setup` again from the main checkout once this branch is merged, and again whenever the Node version changes: the profile keeps these two paths until then.");
  console.log(keychain
    ? "Key: Hermes reads it from the Keychain item runware-api-key (key_cmd), or from RUNWARE_API_KEY when that item is missing."
    : `Key: Hermes reads RUNWARE_API_KEY. For turns the Hermes gateway runs, put it in ${join(installed, ".env")} (see docs/hermes.md).`);
  console.log(`Start it with: npm run hermes (or hermes -p ${name})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`hermes:setup: ${e.message}`); process.exit(1); }
}
