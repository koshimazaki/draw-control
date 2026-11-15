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
 * HERMES_HOME picks another Hermes home (default ~/.hermes), e.g. to try an install in a scratch folder.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  // Fail here, before anything is installed, if the config's placeholders are not fillable.
  fillPaths(readFileSync(join(stage, "config.yaml"), "utf8"), process.execPath, repo);
  if (dry) { console.log(`Staged ${name} at ${stage} (not installed). It would point at Node ${process.execPath} and the checkout ${repo}.`); return; }

  const home = process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
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
  writeFileSync(config, fillPaths(readFileSync(config, "utf8"), process.execPath, repo));

  console.log(`\n${update ? "Updated" : "Installed"} Hermes profile "${name}" (${installed}).`);
  console.log(`Baked into its config.yaml:\n  Node:     ${process.execPath}\n  checkout: ${repo}`);
  console.log("Run `npm run hermes:setup` again from the main checkout once this branch is merged, and again whenever the Node version changes: the profile keeps these two paths until then.");
  console.log(process.env.RUNWARE_API_KEY ? "RUNWARE_API_KEY is set." : "RUNWARE_API_KEY is not set: `npm run hermes` reads it from the macOS Keychain item runware-api-key instead, or export it before `hermes -p beat-path`.");
  console.log(`Start it with: npm run hermes (or hermes -p ${name})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`hermes:setup: ${e.message}`); process.exit(1); }
}
