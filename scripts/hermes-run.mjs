#!/usr/bin/env node
/**
 * Start the beat-path Hermes profile with the Runware key from RUNWARE_API_KEY or, when that is
 * unset on macOS, from the Keychain item "runware-api-key", so the key never sits in a shell
 * history or a file. Hermes gets it in its environment, and so does every command its terminal
 * tool runs (that is how `npm run review` inside a chat finds it).
 *
 *   security add-generic-password -a "$USER" -s runware-api-key -w   # once; asks for the key
 *   npm run hermes                                                   # then this, every time
 *   npm run hermes -- -m glm                                         # extra args go to hermes
 */
import { execFileSync, spawn } from "node:child_process";
import { constants } from "node:os";

let key = process.env.RUNWARE_API_KEY?.trim() ?? "";
if (!key && process.platform === "darwin") {
  try { key = execFileSync("security", ["find-generic-password", "-s", "runware-api-key", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not in the Keychain */ }
}
if (!key) {
  console.error('No Runware key. Set RUNWARE_API_KEY, or on macOS add it once with: security add-generic-password -a "$USER" -s runware-api-key -w');
  process.exit(1);
}
const child = spawn("hermes", ["-p", "beat-path", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, RUNWARE_API_KEY: key } });
// Killed by a signal is not a success: exit as a shell would, 128 plus the signal number.
child.on("exit", (code, signal) => process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : code ?? 1));
child.on("error", (e) => { console.error(`Could not start hermes: ${e.message}`); process.exit(1); });
