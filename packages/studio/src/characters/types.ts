import type * as THREE from "three";
import type { FrameState } from "@motion-studio/core/internal";

export type ClipInfo = { name: string; seconds: number };

/** Anything the viewport can pose from a frame state. */
export interface Character {
  kind: "mannequin" | "block" | "stick" | "blob" | "file" | "rigged";
  object: THREE.Object3D;
  clips: ClipInfo[];
  /** Pose the character for one frame. Must depend on `state` only. */
  apply(state: FrameState): void;
  dispose(): void;
  /** Loaded files only: how many Mixamo bones were recognised. */
  mixamo?: { mapped: number; total: number };
}
