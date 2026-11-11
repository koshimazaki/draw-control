/**
 * Record by doing (automation record): arm one camera lane, press play, move its slider; the
 * value on each played frame is written to that lane when playback stops (or the lane is
 * disarmed), simplified to breakpoints, as one `drawEnvelope` command (one undo step, in the
 * command log). Only the frames that played while armed are written; the rest of the lane
 * keeps its points.
 */
import { LANE_SPECS, type CameraPlan, type EnvelopeLane, type MotionCommand } from "@motion-studio/core";
import { LANE_VIEWS } from "./envelope-lane";

export const RECORD_TOOLS = `
      <span class="muted">Record</span>
      <select id="recLane" title="The camera lane to record into"><option value="distance">distance</option><option value="height">height</option><option value="yaw">yaw offset</option><option value="fov">fov</option></select>
      <button id="recArm" type="button" title="Arm, then press play and move the slider: the values are written to the lane when playback stops">Arm</button>
      <input id="recValue" type="range" step="0.01" aria-label="Recorded value" />
      <span id="recReadout" class="mono readout"></span>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class LaneRecorder {
  armed = false;
  private take = new Map<number, number>();
  private wasPlaying = false;
  constructor(private host: { command(c: MotionCommand): void; plan(): CameraPlan | null; frame(): number; showLane(lane: EnvelopeLane): void }) {
    $("recArm").onclick = () => this.setArmed(!this.armed);
    $("recLane").onchange = () => { if (this.armed) this.commit(); this.range(); };
    $("recValue").oninput = () => this.readout();
    this.range();
  }
  private lane = () => $<HTMLSelectElement>("recLane").value as EnvelopeLane;
  private value = () => Number($<HTMLInputElement>("recValue").value);
  private readout() { $("recReadout").textContent = `${this.value().toFixed(2)}${LANE_SPECS[this.lane()].unit}${this.armed ? " · armed" : ""}`; }
  /** The slider covers the lane's shown range and starts at the camera's planned value here. */
  private range() {
    const lane = this.lane(), v = LANE_VIEWS[lane], el = $<HTMLInputElement>("recValue");
    el.min = String(v.lo); el.max = String(v.hi); el.step = lane === "yaw" || lane === "fov" ? "0.5" : "0.01";
    const p = this.host.plan(), n = Math.max(0, Math.min((p?.frames ?? 1) - 1, this.host.frame()));
    const planned = !p ? NaN : lane === "distance" ? p.channels.distance[n] : lane === "height" ? p.channels.height[n] : lane === "fov" ? p.samples[n].fov : 0;
    if (Number.isFinite(planned)) el.value = String(planned);
    this.readout();
  }
  setArmed(on: boolean) {
    if (!on && this.armed) this.commit();
    this.armed = on;
    $("recArm").classList.toggle("on", on);
    if (on) { this.range(); this.host.showLane(this.lane()); }
    this.readout();
  }
  /** Called once per displayed frame by the player. */
  tick(frame: number, playing: boolean) {
    if (this.armed && playing) this.take.set(frame, this.value());
    if (this.wasPlaying && !playing) this.commit();
    this.wasPlaying = playing;
  }
  private commit() {
    if (!this.take.size) return;
    const frames = [...this.take.keys()].sort((a, b) => a - b), start = frames[0], end = frames[frames.length - 1];
    const values: number[] = [];
    let last = this.take.get(start)!;
    for (let f = start; f <= end; f++) { last = this.take.get(f) ?? last; values.push(Math.round(last * 1000) / 1000); }
    this.take.clear();
    this.host.command({ type: "drawEnvelope", lane: this.lane(), startFrame: start, values });
  }
}
