import { describe, expect, it } from "vitest";
import { analyseSamples, buildDrive, defaultRiggedRecipe, frameAt, syncAt, validateRecipe, type AudioDrive, type Recipe } from "../src/internal";

const withSync = (sync = { head: 1, shoulders: 1, arms: 1, hips: 1 }): Recipe =>
  validateRecipe({ ...defaultRiggedRecipe(), reactive: { ...defaultRiggedRecipe().reactive!, sync } });

describe("per-bone sync", () => {
  it("is off without reactive.sync and validated when present", () => {
    expect(syncAt(defaultRiggedRecipe(), undefined, 1)).toBeNull();
    expect(frameAt(defaultRiggedRecipe(), 30).sync).toBeUndefined();
    expect(frameAt(withSync(), 30).sync).toBeDefined();
    expect(() => withSync({ head: 2, shoulders: 0, arms: 0, hips: 0 })).toThrow(/sync.head/);
  });

  it("nods the head onto each beat and shrugs on the backbeat without a track", () => {
    const r = withSync();
    const at = (beat: number) => syncAt(r, undefined, beat * 0.5)!;
    expect(at(4).head).toBeGreaterThan(0.8);
    expect(at(4.5).head).toBeLessThan(0.2);
    expect(at(3.25).shoulders).toBeGreaterThan(0.5);   // beat 3 is a backbeat
    expect(at(4.25).shoulders).toBeLessThan(0.2);
    expect(at(3.1).arms).toBeLessThan(at(3.1).shoulders);   // a frame behind, still rising
  });

  it("never jumps: every signal changes by less than 0.5 from one frame to the next (at most 8 degrees of head nod)", () => {
    const r = withSync();
    let prev = syncAt(r, undefined, 0)!;
    for (let n = 1; n < 400; n++) {
      const s = syncAt(r, undefined, n / 24)!;
      for (const k of ["head", "shoulders", "arms", "hips", "sway"] as const) expect(Math.abs(s[k] - prev[k]), `${k} at frame ${n}`).toBeLessThan(0.5);
      prev = s;
    }
  });

  it("drops the hips harder on a beat with a kick (the low band)", () => {
    // A 120 BPM track: a 60 Hz kick on beat 2 only, a 2 kHz click on beat 3 (no low band).
    const rate = 22050, n = rate * 3, x = new Float32Array(n);
    const hit = (t: number, hz: number) => { const s = Math.round(t * rate); for (let i = 0; i < 0.12 * rate; i++) x[s + i] += 0.8 * Math.exp(-i / (0.04 * rate)) * Math.sin(2 * Math.PI * hz * i / rate); };
    hit(1.0, 60); hit(1.5, 2000);
    const f = analyseSamples([x], rate);
    const drive: AudioDrive = buildDrive(f, 24, 80);
    expect(drive.low).toBeDefined();
    const r = withSync();
    expect(syncAt(r, drive, 1.08)!.hips).toBeGreaterThan(syncAt(r, drive, 1.58)!.hips * 1.5);
  });
});
