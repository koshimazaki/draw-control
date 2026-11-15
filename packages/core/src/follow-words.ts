/**
 * A follow rig's offset in the shot script (camera segment `follow`, camera.ts):
 * `follow side right distance 14m height 2.5m angle 10`.
 * - `left` / `right`: which side of the subject's heading follow side sits on (left, the
 *   rig's own side, when neither is given; right is the rig turned 180°);
 * - `distance Nm`, `height Nm`: metres from the subject and above the ground;
 * - `angle N`: degrees turned around the subject from the rig's angle (+ towards its left);
 * - `aim Nm`: the height on the subject the camera looks at (metres; `aim 0.3m` frames the feet).
 * Printing gives the same words back, so a script round-trips.
 */
import { FOLLOW_LIMITS, type CameraMode, type FollowOffset } from "./camera";

const fmt = (x: number) => String(Math.round(x * 1000) / 1000);
/** An angle in degrees folded into -180..180. */
export const foldDegrees = (a: number) => { const x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; };

/** Read a follow word's arguments; `fail` reports a word it cannot read. */
export function parseFollowArgs(mode: CameraMode, args: string[], fail: (msg: string) => never): FollowOffset | undefined {
  const out: FollowOffset = {};
  let side = 0;
  const num = (t: string | undefined, what: string) => {
    const v = Number((t ?? "").replace(/(m|°|deg)$/, ""));
    return Number.isFinite(v) && t !== undefined ? v : fail(`${what} must be a number (got ${JSON.stringify(t ?? "")})`);
  };
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === "left" || w === "right") {
      if (mode !== "side") fail(`${w} goes with follow side ("follow side right")`);
      side = w === "right" ? 180 : 0;
    } else if (w === "distance") out.distance = num(args[++i], "follow distance");
    else if (w === "height") out.height = num(args[++i], "follow height");
    else if (w === "angle") out.angle = num(args[++i], "follow angle");
    else if (w === "aim") out.aim = num(args[++i], "follow aim");
    else fail(`a follow camera takes left, right, distance Nm, height Nm, angle N or aim Nm (got ${JSON.stringify(w)})`);
  }
  if (side || out.angle !== undefined) out.angle = foldDegrees((out.angle ?? 0) + side);
  const [dLo, dHi] = FOLLOW_LIMITS.distance, [hLo, hHi] = FOLLOW_LIMITS.height, [aLo, aHi] = FOLLOW_LIMITS.aim;
  if (out.distance !== undefined && !(out.distance >= dLo && out.distance <= dHi)) fail(`follow distance runs ${dLo}–${dHi} m`);
  if (out.height !== undefined && !(out.height >= hLo && out.height <= hHi)) fail(`follow height runs ${hLo}–${hHi} m`);
  if (out.aim !== undefined && !(out.aim >= aLo && out.aim <= aHi)) fail(`follow aim runs ${aLo}–${aHi} m`);
  if (out.angle === 0) delete out.angle;
  return Object.keys(out).length ? out : undefined;
}

/** The words after a follow mode's own word: "right distance 14m height 2.5m angle 10 aim 0.3m" (empty without an offset). */
export function followWords(mode: CameraMode, f: FollowOffset | undefined): string {
  if (!f) return "";
  const parts: string[] = [];
  let angle = f.angle ?? 0;
  if (mode === "side" && Math.abs(angle) > 90) { parts.push("right"); angle = foldDegrees(angle - 180); }
  if (f.distance !== undefined) parts.push(`distance ${fmt(f.distance)}m`);
  if (f.height !== undefined) parts.push(`height ${fmt(f.height)}m`);
  if (Math.abs(angle) > 1e-9) parts.push(`angle ${fmt(angle)}`);
  if (f.aim !== undefined) parts.push(`aim ${fmt(f.aim)}m`);
  return parts.join(" ");
}
