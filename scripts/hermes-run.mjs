#!/usr/bin/env node
/**
 * Start the beat-path Hermes profile with the Runware key from the environment or, on macOS,
 * from the Keychain item "runware-api-key", so the key never sits in a shell history or a file.
 *
 *   security add-generic-password -a "$USER" -s runware-api-key -w   # once; asks for the key
 *   npm run hermes                                                   # then this, every time
 *   npm run hermes -- --model zai:glm@5.1                            # extra args go to hermes
 */
import { execFileSync, spawn } from "node:child_process";

let key = process.env.RUNWARE_API_KEY?.trim() ?? "";
if (!key && process.platform === "darwin") {
  try { key = execFileSync("security", ["find-generic-password", "-s", "runware-api-key", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not in the Keychain */ }
}
if (!key) {
  console.error('No Runware key. Add it once with: security add-generic-password -a "$USER" -s runware-api-key -w');
  process.exit(1);
}
const child = spawn("hermes", ["-p", "beat-path", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, RUNWARE_API_KEY: key } });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (e) => { console.error(`Could not start hermes: ${e.message}`); process.exit(1); });
