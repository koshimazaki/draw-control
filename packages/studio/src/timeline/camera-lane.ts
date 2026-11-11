/**
 * The Camera track's block lane: each camera range is a block labelled with its move (and
 * amount), its shot and its lock, with the lock's stations as ticks. Drag a block to move
 * it, drag an edge to resize it (a shared edge rolls the cut), snapped like the move blocks
 * and through the same drag code and undo (move-lane.ts). Selecting a block opens the
 * camera block inspector: move, amount, from/to, shot, cut, lock, strength, on hit, punch,
 * each written with `setCameraSegment`.
 */
import {
  CAMERA_MODE_LABELS, LOCK_TARGETS, SHOTS, cameraWords, lockHits,
  type CameraMode, type CameraSegment, type MotionCommand, type Recipe,
} from "@motion-studio/core/internal";
import { spanAt, startSpanDrag, type MoveLaneHost, type SpanHit } from "./move-lane";

const MODES: CameraMode[] = ["static", "orbit", "pushIn", "pullOut", "truck", "rise", "lead", "threeQuarter", "side", "chase", "top", "fixed", "path"];
const opts = (xs: readonly string[], label: (x: string) => string = x => x) => xs.map(x => `<option value="${x}">${label(x)}</option>`).join("");

export const CAMERA_INSPECTOR = `
    <div id="camBlock" class="tl-tools" hidden>
      <span class="muted">Camera block</span> <span id="camBlockWords" class="mono"></span>
      <label>Move <select id="cbMode">${opts(MODES, m => CAMERA_MODE_LABELS[m as CameraMode])}</select></label>
      <label title="Orbit degrees (signed), dolly metres, truck metres (+ right), jib metres (signed). Empty: driven by the music">Amount <input id="cbAmount" class="tiny" type="number" step="0.1" /></label>
      <label title="Rise: start height, metres">From <input id="cbFrom" class="tiny" type="number" step="0.05" /></label>
      <label title="Rise: end height; push in or pull out: end distance, metres">To <input id="cbTo" class="tiny" type="number" step="0.05" /></label>
      <label>Shot <select id="cbShot"><option value="">none</option>${opts(SHOTS)}</select></label>
      <label class="check" title="Switch to the shot on the block's first frame instead of easing in"><input id="cbCut" type="checkbox" /> Cut</label>
      <label title="Beat lock: the move arrives on each locked hit">Lock <select id="cbLock"><option value="off">off</option>${opts(LOCK_TARGETS)}</select></label>
      <label>Strength <input id="cbStrength" class="tiny" type="number" min="0" max="1" step="0.05" /></label>
      <label>On hit <select id="cbOnHit"><option value="hold">hold</option><option value="punch">punch in</option></select></label>
      <label title="Punch-in depth, metres">Punch <input id="cbPunch" class="tiny" type="number" min="0" max="3" step="0.05" /></label>
    </div>`;

export const cameraSpans = (r: Recipe) => (r.camera?.segments ?? []).map(s => ({ start: s.fromBeat, end: s.toBeat }));
export const cameraBlockAt = (r: Recipe, x: number, width: number): SpanHit | null => (r.camera ? spanAt(cameraSpans(r), x, width, r.durationBeats) : null);

const COLOURS: Partial<Record<CameraMode, string>> = { orbit: "#e0895a", pushIn: "#5fb47a", pullOut: "#5fb47a", truck: "#4fb3c4", rise: "#c46fd0", top: "#d2b84a", static: "#6b6f78", fixed: "#6b6f78", path: "#d0606e" };

export function drawCameraLane(g: CanvasRenderingContext2D, w: number, top: number, h: number, r: Recipe, selected: number, bands: Parameters<typeof lockHits>[1]) {
  const X = (b: number) => b / r.durationBeats * w;
  if (!r.camera) { g.fillStyle = "rgba(231,232,234,0.45)"; g.fillText("No camera rig: tick Audio-reactive camera, or apply a script with a camera column", 6, top + h / 2); return; }
  r.camera.segments.forEach((s, i) => {
    const x0 = X(s.fromBeat), x1 = X(s.toBeat);
    g.fillStyle = COLOURS[s.modes[0]] ?? "#5b8def";
    g.fillRect(x0, top + 2, x1 - x0 - 1, h - 4);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(x0, top + 2, 2, h - 4); g.fillRect(x1 - 3, top + 2, 2, h - 4);
    if (s.lock) for (const b of lockHits(r.beatGrid, bands, s.lock, s.fromBeat, s.toBeat)) { g.fillStyle = "#101114"; g.fillRect(Math.round(X(b)) - 1, top + h - 9, 2, 7); }
    g.fillStyle = "#101114";
    const words = cameraWords({ ...s, lock: undefined } as CameraSegment), lock = s.lock ? ` · lock ${s.lock}${s.strength !== undefined ? ` ${s.strength}` : ""}${s.onHit === "punch" ? " punch" : ""}` : "";
    if (x1 - x0 > 24) g.fillText(words, x0 + 4, top + h / 2 - 5, x1 - x0 - 8);
    if (x1 - x0 > 30) g.fillText(`${s.shot ? `${s.shot}${s.cut ? " cut" : ""}` : "no shot"}${lock}`, x0 + 4, top + h / 2 + 7, x1 - x0 - 8);
    if (i === selected) { g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.strokeRect(x0 + 1, top + 1, x1 - x0 - 3, h - 2); g.lineWidth = 1; }
  });
}

/** Start a drag on a camera block (moveCameraSegment, resizeCameraSegment). */
export function startCameraDrag(host: Omit<MoveLaneHost, "select">, hit: SpanHit, downBeat: number, beatAtX: (clientX: number) => number) {
  return startSpanDrag(host, hit, host.recipe().camera!.segments[hit.index].fromBeat, downBeat, beatAtX,
    (kind, beat) => (kind === "body" ? { type: "moveCameraSegment", index: hit.index, toBeat: beat } : { type: "resizeCameraSegment", index: hit.index, edge: kind, toBeat: beat }));
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inp = (id: string) => $<HTMLInputElement>(id);
const sel = (id: string) => $<HTMLSelectElement>(id);

/** The inspector: shows the selected block and writes each field through `setCameraSegment`. */
export function bindCameraInspector(host: { recipe(): Recipe; selected(): number; command(c: MotionCommand): void }) {
  const send = (fields: Record<string, unknown>) => { const i = host.selected(); if (i >= 0) host.command({ type: "setCameraSegment", index: i, ...fields }); };
  const numOrNull = (id: string) => (inp(id).value === "" ? null : Number(inp(id).value));
  sel("cbMode").onchange = () => send({ modes: [sel("cbMode").value], amount: null, from: null, to: null, ...(sel("cbMode").value === "truck" ? { amount: 1 } : {}) });
  inp("cbAmount").onchange = () => send({ amount: numOrNull("cbAmount"), ...(inp("cbAmount").value !== "" ? { to: null } : {}) });
  inp("cbFrom").onchange = () => send({ from: numOrNull("cbFrom"), amount: null });
  inp("cbTo").onchange = () => send({ to: numOrNull("cbTo"), amount: null });
  sel("cbShot").onchange = () => send({ shot: sel("cbShot").value || null });
  inp("cbCut").onchange = () => send({ cut: inp("cbCut").checked || null });
  sel("cbLock").onchange = () => send({ lock: sel("cbLock").value });
  inp("cbStrength").onchange = () => send({ strength: numOrNull("cbStrength") });
  sel("cbOnHit").onchange = () => send({ onHit: sel("cbOnHit").value });
  inp("cbPunch").onchange = () => send({ punch: numOrNull("cbPunch") });
  return () => {
    const s = host.recipe().camera?.segments[host.selected()];
    $("camBlock").hidden = !s;
    if (!s) return;
    $("camBlockWords").textContent = `beats ${s.fromBeat}–${s.toBeat}: ${cameraWords(s)}${s.shot ? ` | shot ${s.shot}${s.cut ? " cut" : ""}` : ""}`;
    const set = (id: string, v: string) => { if (document.activeElement !== $(id)) (($(id) as HTMLInputElement).value = v); };
    set("cbMode", s.modes[0]);
    set("cbAmount", s.amount === undefined ? "" : String(s.amount));
    set("cbFrom", s.from === undefined ? "" : String(s.from));
    set("cbTo", s.to === undefined ? "" : String(s.to));
    set("cbShot", s.shot ?? "");
    inp("cbCut").checked = !!s.cut;
    set("cbLock", s.lock ?? "off");
    set("cbStrength", s.strength === undefined ? "" : String(s.strength));
    set("cbOnHit", s.onHit ?? "hold");
    set("cbPunch", s.punch === undefined ? "" : String(s.punch));
    for (const id of ["cbStrength", "cbOnHit", "cbPunch"]) ($(id) as HTMLInputElement).disabled = !s.lock;
  };
}
