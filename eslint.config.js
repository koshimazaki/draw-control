import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/dist-beat-path/**", "packages/studio/public/vendor/**", "out/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "cli/bin/*.mjs", "mcp/bin/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", URL: "readonly", Buffer: "readonly", window: "readonly", document: "readonly" } },
  },
);
