import { existsSync, readFileSync, readdirSync } from "node:fs";
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

export default defineConfig({
  plugins: [localMixamo()],
  server: { host: "127.0.0.1", port: 5180 },
  build: {
    target: "es2022", chunkSizeWarningLimit: 1200,
    // Two pages: the studio (index.html) and Beat Path (path.html).
    rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), path: fileURLToPath(new URL("./path.html", import.meta.url)) } },
  },
});
