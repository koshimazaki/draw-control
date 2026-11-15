#!/usr/bin/env node
/**
 * The MCP server for real, over stdio, as an MCP client would run it: starts
 * `node mcp/bin/motion-studio-mcp.mjs`, analyses a generated drum track, applies a shot script
 * that gives the walk path and the camera path in metres, reads the script back, and renders
 * the guide bundle in headless Chrome (MCP `render`). Writes to out/mcp-check/.
 *   npm run mcp-check
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { drumWav } from "./smoke-features.mjs";

const root = new URL("../", import.meta.url).pathname, out = `${root}out/mcp-check/`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}drums.wav`, drumWav(120, 8).buf);
const script = readFileSync(`${root}examples/scripts/glide-path.txt`, "utf8");

const client = new Client({ name: "mcp-check", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [`${root}mcp/bin/motion-studio-mcp.mjs`], cwd: root, stderr: "inherit" }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return text;
};
let failed = false;
try {
  console.log("tools:", (await client.listTools()).tools.map(t => t.name).join(", "));
  console.log(await call("analyse_audio", { path: `${out}drums.wav` }));
  await call("new_recipe");
  console.log(`apply_script:\n${await call("apply_script", { script })}`);
  const timed = await call("timed_prompt");
  console.log(`timed_prompt:\n${timed}`);
  if (!/^0\.0–\d+\.\d s[,:]/.test(timed)) { console.error("timed_prompt: no timed lines"); failed = true; }
  const t0 = Date.now();
  console.log(await call("render", { out: `${out}bundle`, audio: `${out}drums.wav`, start: 0, length: 16, unit: "beats" }));
  console.log(`render took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const f of ["guide.mp4", "camera.json", "beats.json", "recipe.json", "meta.json", "bundle.json", "frame0.png"]) if (!existsSync(`${out}bundle/${f}`)) { console.error(`missing ${f}`); failed = true; }
  const recipe = JSON.parse(readFileSync(`${out}bundle/recipe.json`, "utf8"));
  console.log(`bundle recipe: walk path ${recipe.rootPath.length} points, camera path ${recipe.camera.path?.length} points, travel lock ${JSON.stringify(recipe.travelLock)}`);
} catch (e) { console.error(e.message); failed = true; }
finally { await client.close(); }
console.log(failed ? "MCP CHECK: FAILED" : `MCP CHECK: OK (output in ${out})`);
process.exitCode = failed ? 1 : 0;
