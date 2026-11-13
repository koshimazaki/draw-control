import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several tests render whole clips and take 5-9 s on a busy machine.
    testTimeout: 30_000,
    include: ["packages/*/test/**/*.test.ts", "cli/test/**/*.test.ts", "mcp/test/**/*.test.ts"],
    environment: "node",
  },
});
