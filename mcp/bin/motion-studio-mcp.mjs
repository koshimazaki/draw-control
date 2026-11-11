#!/usr/bin/env node
/**
 * motion-studio MCP server over stdio. Runs the TypeScript sources directly on Node 24
 * (type stripping), adding the ".ts" extension the sources leave out.
 * Register it with an MCP client as: node <repo>/mcp/bin/motion-studio-mcp.mjs
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (e) {
      if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
process.removeAllListeners("warning");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { createServer } = await import("../src/server.ts");
await createServer().connect(new StdioServerTransport());
