/**
 * Transitions on the real rigged mannequin: no joint pops from one move into the next.
 * A pop is a joint that jumps on one frame and stops on the next: its per-frame rotation
 * step stands above both neighbouring steps. Fast authored motion (a punch's impact)
 * ramps up and down over a few frames instead. Measured per joint over the whole
 * performance, including move to move (with the shortest blend, 6 frames), gait to gait,
 * accents back to back (jab into cross into sword) and the jump's take-off to landing clip.
 * Impact frames (a marker's hit, one frame either side) are left out: a punch's impact is
 * authored that fast (the jab alone over idle spikes 33 degrees on its hit frame).
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import {
  MIN_BLEND_FRAMES, blendBeatsOf, defaultRiggedRecipe, exportFrameCount, frameAt, framesToBeats, riggedMove, validateRecipe,
  type HitMarker, type Recipe,
} from "@motion-studio/core";
import { createRiggedCharacter, type RiggedCharacter } from "../src/characters/rigged-core";

/** Largest allowed spike of a joint's step above both neighbours, degrees per frame. */
const POP_DEGREES = 30;

async function mannequin() {
  const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "");
  return createRiggedCharacter(gltf.scene, gltf.animations);
}

/** The worst spike (degrees) and where, over frames [from, to). */
function worstPop(c: RiggedCharacter, recipe: Recipe, from = 0, to = exportFrameCount(recipe)) {
  const impacts = new Set((recipe.reactive?.markers ?? []).flatMap(m => { const f = Math.round(m.seconds * recipe.fps); return [f - 1, f, f + 1]; }));
  const bones = c.rigged.sampler.bones.filter(b => !/DEF-(f_|thumb)/.test(b.name));
  const steps: number[][] = [];
  const prev = bones.map(() => new THREE.Quaternion());
  for (let n = from; n < to; n++) {
    c.apply(frameAt(recipe, n));
    steps.push(bones.map((b, k) => { const d = n > from ? prev[k].angleTo(b.quaternion) : 0; prev[k].copy(b.quaternion); return d; }));
  }
  let worst = { deg: 0, frame: -1, bone: "" };
  for (let i = 2; i < steps.length - 1; i++) if (!impacts.has(from + i)) bones.forEach((b, k) => {
    const spike = (steps[i][k] - Math.max(steps[i - 1][k], steps[i + 1][k])) * 180 / Math.PI;
    if (spike > worst.deg) worst = { deg: spike, frame: from + i, bone: b.name };
  });
  return worst;
}

const base = defaultRiggedRecipe();
const fight = (moves: Recipe["moves"], markers: HitMarker[] = []) => validateRecipe({
  ...base, durationBeats: 24, moves,
  reactive: { ...base.reactive!, humanise: 0, accents: [], markers },
});

describe("smooth transitions (rigged mannequin)", () => {
  it("never blends a move in faster than 6 frames, even with a 0 blend", () => {
    const r = fight([riggedMove("Idle_Loop", 0), riggedMove("Dance_Loop", 4, 120, 0)]);
    expect(blendBeatsOf(r.moves[1], r)).toBeCloseTo(framesToBeats(MIN_BLEND_FRAMES, 120), 6);
    const at = (n: number) => frameAt(r, n).layers.find(l => l.clip === "Dance_Loop")?.weight ?? 0;
    const start = 48;   // beat 4 at 120 BPM
    expect(at(start + 3)).toBeGreaterThan(0.2);
    expect(at(start + 3)).toBeLessThan(0.8);
    expect(at(start + MIN_BLEND_FRAMES)).toBe(1);
  });

  it("starts a gait on the foot the previous gait steps with next", () => {
    // Walk steps every beat (two steps per two-beat cycle): at beat 5 it takes its second step (right foot).
    const r = fight([riggedMove("Walk_Loop", 0), riggedMove("Jog_Fwd_Loop", 5)]);
    const jog = frameAt(r, 5 * 12 + 12).layers.find(l => l.clip === "Jog_Fwd_Loop")!;
    const plain = frameAt(fight([riggedMove("Jog_Fwd_Loop", 5)]), 5 * 12 + 12).layers.find(l => l.clip === "Jog_Fwd_Loop")!;
    expect(Math.abs(jog.cyclePhase - plain.cyclePhase)).toBeCloseTo(0.5, 6);
  });

  it("has no joint pop across move transitions, gait changes and back-to-back fight accents", async () => {
    const c = await mannequin();
    const moves = [
      riggedMove("Sword_Idle", 0, 120, 0), riggedMove("Spell_Simple_Idle_Loop", 4, 120, 0), riggedMove("Dance_Loop", 8, 120, 0),
      riggedMove("Walk_Loop", 12, 120, 0), riggedMove("Jog_Fwd_Loop", 15, 120, 0), riggedMove("Idle_Loop", 20, 120, 0),
    ];
    const markers: HitMarker[] = [
      { seconds: 1.0, accent: "jab", source: "manual" }, { seconds: 1.5, accent: "cross", source: "manual" },
      { seconds: 2.0, accent: "sword", source: "manual" }, { seconds: 4.0, accent: "jump", source: "manual" },
      { seconds: 5.0, accent: "roll", source: "manual" }, { seconds: 8.5, accent: "jump", source: "manual" },
    ];
    const worst = worstPop(c, fight(moves, markers));
    expect(worst.deg, `${worst.bone} at frame ${worst.frame}`).toBeLessThan(POP_DEGREES);
  }, 60_000);
});
