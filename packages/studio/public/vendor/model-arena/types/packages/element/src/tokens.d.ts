/**
 * The design tokens every element reads: colours, radii, gap and fonts, as
 * `--ma-*` custom properties with neutral defaults (greys, no brand colour).
 * A host maps its own tokens from outside, which wins over `:host`:
 *   model-arena, arena-generate, arena-key, arena-player, arena-gallery { --ma-accent: var(--brand); }
 * theme="light" forces the light set; theme="auto" follows prefers-color-scheme.
 * The table is in docs/embed.md.
 */
/** `:host` defaults plus the light and auto variants, for every element's shadow styles. */
export declare const tokens = "\n:host {\n  --ma-bg: #18181b; --ma-card: #1f1f23; --ma-fg: #f4f4f5; --ma-muted: #a1a1aa;\n  --ma-line: #3f3f46; --ma-input: #27272a; --ma-chip: #2e2e33;\n  --ma-accent: #e4e4e7; --ma-accent-fg: #18181b; --ma-warn: #fbbf24; --ma-ok: #86efac;\n  --ma-radius: 7px; --ma-radius-lg: 12px; --ma-gap: 8px;\n  --ma-font: ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif;\n  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace; }\n:host([theme=\"light\"]) {\n  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;\n  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;\n  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534; }\n@media (prefers-color-scheme: light) { :host([theme=\"auto\"]) {\n  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;\n  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;\n  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534; } }\n";
/** The token names, for the docs table and tests. */
export declare const TOKEN_NAMES: readonly ["--ma-bg", "--ma-card", "--ma-fg", "--ma-muted", "--ma-line", "--ma-input", "--ma-chip", "--ma-accent", "--ma-accent-fg", "--ma-warn", "--ma-ok", "--ma-radius", "--ma-radius-lg", "--ma-gap", "--ma-font", "--ma-mono"];
