#!/usr/bin/env node
/**
 * motion-studio CLI entry. Runs the TypeScript sources directly on Node 24 (type stripping):
 * a resolve hook adds the ".ts" extension the sources leave out, so no build step is needed.
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
const { main } = await import("../src/main.ts");
process.exitCode = await main(process.argv.slice(2));
