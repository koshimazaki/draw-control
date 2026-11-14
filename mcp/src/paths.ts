/**
 * Where the MCP server may write and read JSON: under its working directory, the
 * motion-studio repo, the OS temp directory, or a directory listed in MOTION_STUDIO_ROOTS
 * (separated like PATH). A path is resolved segment by segment through the real path of
 * every part that exists, so neither `..` nor a symlink (dangling ones included) can leave
 * a root, and it must sit on a path-segment boundary under one. Tools then use that
 * resolved path, never the string they were given. The CLI run by a person is not confined.
 * Audio input is separate: any existing regular local file (cli/src/audio-file.ts).
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, parse, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The motion-studio repo root, from this file's location (not the working directory). */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The canonical form of `path`, walked one segment at a time the way the OS does: an existing
 * segment is replaced by its real path (so `link/..` is the parent of the link's target, not
 * the folder holding the link), and the part that does not exist yet is kept as written.
 * Throws on a dangling symlink, which a write would follow to wherever it points.
 */
export function canonicalPath(path: string): string {
  const abs = isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`;
  const { root } = parse(abs);
  let real = realpathSync(root);
  const tail: string[] = [];   // segments under `real` that do not exist (yet)
  for (const seg of abs.slice(root.length).split(/[\\/]+/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (tail.length) tail.pop(); else real = dirname(real); continue; }
    if (tail.length) { tail.push(seg); continue; }
    const next = join(real, seg);
    let exists = false;
    try { lstatSync(next); exists = true; } catch { /* not there: the rest is new */ }
    if (!exists) { tail.push(seg); continue; }
    try { real = realpathSync(next); }
    catch { throw new Error(`${path} goes through a link that points nowhere`); }
  }
  return tail.length ? join(real, ...tail) : real;
}

/** The roots in force: cwd, the repo, the temp directory and MOTION_STUDIO_ROOTS, each canonical. */
export function allowedRoots(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string[] {
  const extra = (env.MOTION_STUDIO_ROOTS ?? "").split(delimiter).map(s => s.trim()).filter(Boolean);
  const roots: string[] = [];
  for (const r of [cwd, REPO_ROOT, tmpdir(), ...extra]) {
    try { const c = canonicalPath(r); if (!roots.includes(c)) roots.push(c); } catch { /* a dangling root allows nothing */ }
  }
  return roots;
}

export const isInside = (path: string, root: string) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

/** `path` in canonical form when it lies under an allowed root; otherwise an error naming it and how to allow it. */
export function confine(path: string, action: "write" | "read", roots = allowedRoots()): string {
  const real = canonicalPath(path);
  if (roots.some(r => isInside(real, r))) return real;
  throw new Error(`${action === "write" ? "will not write" : "will not read"} ${path}: it is outside the folders this server may use (${roots.join(", ")}). ` +
    `Use a path under one of them, or add its folder to MOTION_STUDIO_ROOTS (separated by "${delimiter}") in the MCP server's environment.`);
}

/** A JSON file under an allowed root, parsed. Errors name the path but never quote its contents. */
export function readJsonConfined(path: string, roots?: string[]): unknown {
  const real = confine(path, "read", roots);
  let text: string;
  try { text = readFileSync(real, "utf8"); }
  catch (e) { throw new Error(`could not read ${path} (${(e as NodeJS.ErrnoException).code ?? "read error"})`, { cause: e }); }
  try { return JSON.parse(text); }
  catch { throw new Error(`${path} is not valid JSON`); }
}
