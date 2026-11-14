#!/usr/bin/env node
/**
 * Install (or update) the `beat-path` Hermes profile from hermes/beat-path/ plus the repo's
 * skills/, then point its MCP server at this checkout. Uses Hermes's own `profile install`, so
 * the default ~/.hermes profile is untouched; an update keeps the profile's memory and sessions.
 * Makes no model call and spends nothing.
 *
 *   npm run hermes:setup            # install, or update an existing beat-path profile
 *   npm run hermes:setup -- --dry   # stage the distribution and print where, install nothing
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = "beat-path";
const dry = process.argv.includes("--dry");

// The distribution as Hermes expects it: SOUL.md, config.yaml, distribution.yaml and skills/.
const stage = mkdtempSync(join(tmpdir(), "beat-path-profile-"));
cpSync(join(repo, "hermes", name), stage, { recursive: true });
for (const skill of ["beat-path", "runware-hermes", "runware-review"]) cpSync(join(repo, "skills", skill), join(stage, "skills", skill), { recursive: true });
if (dry) { console.log(`Staged ${name} at ${stage} (not installed).`); process.exit(0); }

const home = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
const installed = join(home, "profiles", name);
const update = existsSync(installed);
try {
  execFileSync("hermes", ["profile", "install", stage, "--name", name, "-y", ...(update ? ["--force"] : [])], { stdio: "inherit" });
} finally { rmSync(stage, { recursive: true, force: true }); }

// Machine paths: this Node and this checkout (the config ships with placeholders).
const config = join(installed, "config.yaml");
const text = readFileSync(config, "utf8");
writeFileSync(config, text.replaceAll("__NODE__", process.execPath).replaceAll("__REPO__", repo));

console.log(`\n${update ? "Updated" : "Installed"} Hermes profile "${name}" (${installed}).`);
console.log(process.env.RUNWARE_API_KEY ? "RUNWARE_API_KEY is set." : "Set RUNWARE_API_KEY in your shell before starting it.");
console.log(`Start it with: hermes -p ${name}`);
