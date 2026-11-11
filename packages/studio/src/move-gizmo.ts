/**
 * Move gizmo in the viewport's corner: the moves the rigged mannequin can play (loops
 * and accents). Hover or click previews a move on the character, looping in place;
 * "Use here" swaps it into the selected marker (accents) or onto the cursor beat (loops).
 */
import {
  CLIP_ACCENTS, LOOP_CLIPS, defaultPhaseBoundaries, evaluateClipAccent, type AccentKey, type ClipLayer, type FrameState, type ScheduledHit,
} from "@motion-studio/core";

export type GizmoItem = { kind: "loop"; clip: string } | { kind: "accent"; key: AccentKey };
const label = (i: GizmoItem) => i.kind === "loop" ? i.clip.replace(/_Loop$/, "").replace(/_/g, " ") : CLIP_ACCENTS[i.key]!.name;

export const GIZMO_LAYOUT = `<div id="gizmo" class="gizmo" hidden>
  <div class="gizmo-list" id="gizmoList"></div>
  <div class="row"><span id="gizmoName" class="mono"></span><button id="gizmoUse" type="button" disabled>Use here</button></div>
</div>`;

/** A frame state that previews one move in place, looping every two seconds for accents. */
export function previewState(item: GizmoItem, seconds: number, base: FrameState): FrameState {
  const layers: ClipLayer[] = [];
  let y = 0, yaw = 0;
  let caption = label(item);
  if (item.kind === "loop") {
    const lib = LOOP_CLIPS[item.clip];
    layers.push({ moveId: "preview", clip: item.clip, cyclePhase: 0, weight: 1, time: (seconds % lib.seconds) });
  } else {
    const accent = CLIP_ACCENTS[item.key]!;
    const beatSeconds = 0.5, b = defaultPhaseBoundaries(accent, beatSeconds);
    const period = (b[b.length - 1] - b[0]) * beatSeconds + 0.6;
    const u = ((seconds % period) - 0.3) / beatSeconds + b[0];
    const hit = { seconds: 0, beat: 0, key: item.key, source: "onset", accent, boundaries: b } as ScheduledHit;
    const a = evaluateClipAccent(hit, u, beatSeconds);
    layers.push({ moveId: "preview", clip: "Idle_Loop", cyclePhase: 0, weight: 1, time: seconds % 2.5 });
    if (a) { for (const l of a.layers) layers.push({ ...l, weight: l.weight * a.weight }); y = a.lift; yaw = a.spin; caption = `${accent.name} · ${a.phase.name}`; }
  }
  return { ...base, root: { x: base.root.x, y, z: base.root.z, yawRadians: base.root.yawRadians + yaw }, layers, lagged: undefined, amplitude: 1,
    phase: { name: caption, kind: "move", accent: "preview" } };
}

export class MoveGizmo {
  preview: GizmoItem | null = null;
  private chosen: GizmoItem | null = null;
  constructor(private onPreview: () => void, private onUse: (item: GizmoItem) => void) {
    const items: GizmoItem[] = [
      ...Object.keys(LOOP_CLIPS).map(clip => ({ kind: "loop" as const, clip })),
      ...(Object.keys(CLIP_ACCENTS) as AccentKey[]).map(key => ({ kind: "accent" as const, key })),
    ];
    const list = document.getElementById("gizmoList")!;
    for (const item of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label(item);
      b.className = item.kind;
      b.onmouseenter = () => { this.preview = item; this.onPreview(); };
      b.onmouseleave = () => { this.preview = this.chosen; this.onPreview(); };
      b.onclick = () => {
        this.chosen = this.chosen === item ? null : item;
        this.preview = this.chosen;
        list.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b && !!this.chosen));
        document.getElementById("gizmoName")!.textContent = this.chosen ? label(this.chosen) : "";
        (document.getElementById("gizmoUse") as HTMLButtonElement).disabled = !this.chosen;
        this.onPreview();
      };
      list.appendChild(b);
    }
    document.getElementById("gizmoUse")!.onclick = () => { if (this.chosen) this.onUse(this.chosen); };
  }
  setVisible(on: boolean) { document.getElementById("gizmo")!.hidden = !on; if (!on) { this.preview = null; this.chosen = null; } }
}
