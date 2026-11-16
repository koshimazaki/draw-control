/** scripts/setup-hermes.mjs (`npm run hermes:setup`): the config it writes per platform and where it installs. Hermes itself is not run here. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, no type declarations
import { KEYCHAIN_KEY_CMD, fillPaths, hermesHome, keychainLookup, profileConfig } from "../../scripts/setup-hermes.mjs";

const repoConfig = readFileSync(new URL("../../hermes/beat-path/config.yaml", import.meta.url), "utf8");
const keyCmdLines = (text: string) => text.split("\n").filter((l) => l.trim().startsWith("key_cmd:"));

describe("npm run hermes:setup: the key", () => {
  it("adds the Keychain lookup under each Runware provider on macOS, right after its key_env", () => {
    const out: string = keychainLookup(repoConfig, "darwin");
    const lines = out.split("\n");
    expect(keyCmdLines(out)).toHaveLength(2);
    lines.forEach((line, i) => {
      if (line.trim().startsWith("key_cmd:")) {
        expect(lines[i - 1]).toBe(line.replace(/key_cmd: .*/, "key_env: RUNWARE_API_KEY"));
        expect(line.trim()).toBe(`key_cmd: ${KEYCHAIN_KEY_CMD}`);
      }
    });
  });
  it("leaves the config alone on Linux and Windows, where /usr/bin/security does not exist", () => {
    expect(keychainLookup(repoConfig, "linux")).toBe(repoConfig);
    expect(keychainLookup(repoConfig, "win32")).toBe(repoConfig);
  });
  it("names no account, falls back to RUNWARE_API_KEY, and never prints anything but the key", () => {
    expect(KEYCHAIN_KEY_CMD).not.toMatch(/\s-a\s/);
    expect(KEYCHAIN_KEY_CMD).toMatch(/^\/usr\/bin\/security find-generic-password -s runware-api-key -w 2>\/dev\/null \|\| printenv RUNWARE_API_KEY$/);
    // A ` #` would start a YAML comment and cut the command short.
    expect(KEYCHAIN_KEY_CMD).not.toMatch(/\s#/);
  });
  it("keeps Windows line endings", () => {
    const crlf = repoConfig.replace(/\n/g, "\r\n");
    const out = keychainLookup(crlf, "darwin");
    expect(keyCmdLines(out.replace(/\r/g, ""))).toHaveLength(2);
    expect(out.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });
  it("refuses, on macOS, a config with no provider to add the lookup to", () => {
    expect(() => keychainLookup("providers:\n  other:\n    key_env: OTHER_KEY\n", "darwin")).toThrow(/key_env: RUNWARE_API_KEY/);
  });
  it("keeps the key itself, and the owner's account name, out of the repository's config", () => {
    expect(repoConfig).not.toMatch(/key_cmd:|api_key:/);
    expect(repoConfig).not.toMatch(/find-generic-password/);
  });
});

describe("npm run hermes:setup: the installed config", () => {
  it("fills the paths and, on macOS only, the Keychain lookup", () => {
    const mac = profileConfig(repoConfig, "/opt/node/bin/node", "/src/draw control", "darwin");
    expect(mac).not.toMatch(/__(NODE|REPO)__/);
    expect(mac).toContain('command: "/opt/node/bin/node"');
    expect(keyCmdLines(mac)).toHaveLength(2);
    const linux = profileConfig(repoConfig, "/usr/bin/node", "/src/dc", "linux");
    expect(linux).toBe(fillPaths(repoConfig, "/usr/bin/node", "/src/dc"));
    expect(keyCmdLines(linux)).toHaveLength(0);
  });
  // The models Runware serves on /v1/responses (runware.ai/docs/platform/openai, 16 Nov 2026).
  const onResponses = (model: string) => model.startsWith("openai:gpt@") && model !== "openai:gpt@5.4-pro" || model === "alibaba:qwen@4-max";
  it("puts the models Runware serves on /v1/responses on the Responses transport, the rest on chat completions", () => {
    const block = (name: string) => repoConfig.split(/\n {2}(?=\S)/).find((b) => b.startsWith(`${name}:`)) ?? "";
    expect(block("runware")).toMatch(/transport: codex_responses/);
    expect(block("runware-chat")).toMatch(/transport: chat_completions/);
    for (const [, model] of block("runware").matchAll(/^ {6}([^\s:]+:[^\s]+): \{\}$/gm)) expect(onResponses(model)).toBe(true);
    for (const [, model] of block("runware-chat").matchAll(/^ {6}([^\s:]+:[^\s]+): \{\}$/gm)) expect(onResponses(model)).toBe(false);
  });
  it("routes every short name through a named provider, so a switch keeps its transport and key", () => {
    const aliases = [...repoConfig.matchAll(/^ {2}(\w+): \{ model: "([^"]+)", provider: ([\w-]+) \}$/gm)];
    expect(aliases.length).toBe(repoConfig.split("model_aliases:")[1].split("mcp_servers:")[0].split("\n").filter((l) => /^ {2}\w/.test(l)).length);
    for (const [, , model, provider] of aliases) expect(provider).toBe(onResponses(model) ? "runware" : "runware-chat");
  });
});

describe("npm run hermes:setup: where it installs", () => {
  it("uses HERMES_HOME when set", () => {
    expect(hermesHome({ HERMES_HOME: " /tmp/scratch-home " }, "darwin", "/Users/u")).toBe("/tmp/scratch-home");
  });
  it("uses ~/.hermes on macOS and Linux, and %LOCALAPPDATA%\\hermes on Windows, as Hermes does", () => {
    expect(hermesHome({}, "darwin", "/Users/u")).toBe("/Users/u/.hermes");
    expect(hermesHome({}, "linux", "/home/u")).toBe("/home/u/.hermes");
    expect(hermesHome({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32", "C:\\Users\\u")).toBe("C:\\Users\\u\\AppData\\Local\\hermes");
    expect(hermesHome({}, "win32", "C:\\Users\\u")).toBe("C:\\Users\\u\\AppData\\Local\\hermes");
  });
});
