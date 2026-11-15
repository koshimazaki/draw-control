import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev server only: list and serve the user's own Mixamo clips from assets-local/mixamo/
 * (gitignored, never bundled, never in a build). GET /@local/mixamo/ lists the files;
 * GET /@local/mixamo/<file> returns one. Only plain file names in that folder are served.
 */
function localMixamo(): Plugin {
  const dir = fileURLToPath(new URL("../../assets-local/mixamo/", import.meta.url));
  const files = () => (existsSync(dir) ? readdirSync(dir).filter(f => /^[\w .()-]{1,80}\.(fbx|glb)$/i.test(f)).sort() : []);
  return {
    name: "local-mixamo",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/@local/mixamo/", (req, res) => {
        const name = decodeURIComponent((req.url ?? "/").replace(/^\/+/, "").split("?")[0]);
        if (!name) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(files())); return; }
        if (!files().includes(name)) { res.statusCode = 404; res.end("not found"); return; }
        res.setHeader("content-type", "application/octet-stream");
        res.end(readFileSync(dir + name));
      });
    },
  };
}

/**
 * `--mode beat-path` builds only the Draw Control page, as plain static files with relative
 * asset paths, its page renamed to index.html so it is the site root (docs/deploy.md).
 */
function beatPathAsIndex(outDir: string): Plugin {
  return {
    name: "beat-path-as-index",
    apply: "build",
    closeBundle() {
      const from = `${outDir}/path.html`;
      if (existsSync(from)) renameSync(from, `${outDir}/index.html`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const beatPathOnly = mode === "beat-path";
  const outDir = fileURLToPath(new URL(beatPathOnly ? "./dist-beat-path" : "./dist", import.meta.url));
  const inputs: Record<string, string> = { path: fileURLToPath(new URL("./path.html", import.meta.url)) };
  if (!beatPathOnly) inputs.main = fileURLToPath(new URL("./index.html", import.meta.url));
  return {
    plugins: [localMixamo(), ...(beatPathOnly ? [beatPathAsIndex(outDir)] : [])],
    // Relative asset paths: the build works from any folder or sub-path, with no server.
    base: "./",
    server: { host: "127.0.0.1", port: 5180 },
    // Scan both pages for dependencies up front, so opening the second one never re-optimises and reloads.
    optimizeDeps: { entries: ["index.html", "path.html"] },
    build: {
      target: "es2022", chunkSizeWarningLimit: 1200, outDir, emptyOutDir: true,
      // The studio (index.html) and Draw Control (path.html); Draw Control alone with --mode beat-path.
      rollupOptions: { input: inputs },
    },
  };
});
