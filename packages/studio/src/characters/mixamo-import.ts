/**
 * Mixamo clips on the rigged mannequin: an animation-only Mixamo FBX (or GLB) is parsed,
 * retargeted onto the mannequin's DEF skeleton (retarget.ts) and registered with its clip
 * sampler under "mixamo/<name>", so a move can play it like any other clip. The files come
 * from the user's disk (drag and drop, or assets-local/mixamo/ through the dev server) and
 * never leave the browser.
 */
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { baseBoneName } from "./mixamo";
import { retargetMixamoClip, type RetargetReport } from "./retarget";
import { riggedBindScene, type RiggedCharacter } from "./rigged";

export const MIXAMO_PREFIX = "mixamo/";
const MAX_BYTES = 60 * 1024 * 1024;

export type ParsedAnimation = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; skinned: boolean; mixamoBones: number };
export type ImportedClip = { name: string; seconds: number; report: RetargetReport; source: THREE.Object3D; sourceClip: THREE.AnimationClip; clip: THREE.AnimationClip };

/** Parse an FBX or GLB from bytes. */
export async function parseAnimation(bytes: ArrayBuffer, fileName: string): Promise<ParsedAnimation> {
  if (bytes.byteLength > MAX_BYTES) throw new Error("Keep animation files below 60 MB.");
  const ext = fileName.toLowerCase().split(".").pop();
  let scene: THREE.Object3D, clips: THREE.AnimationClip[];
  if (ext === "fbx") { const g = new FBXLoader().parse(bytes, ""); scene = g; clips = g.animations; }
  else if (ext === "glb" || ext === "gltf") { const g = await new GLTFLoader().parseAsync(bytes, ""); scene = g.scene; clips = g.animations; }
  else throw new Error("Load a .fbx or .glb animation.");
  let skinned = false, mixamoBones = 0;
  scene.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    if (/mixamorig/i.test(o.name) || ((o as THREE.Bone).isBone && baseBoneName(o.name) === "Hips")) mixamoBones++;
  });
  return { scene, clips: clips.filter(c => c.duration > 0 && c.tracks.length > 0), skinned, mixamoBones };
}

/** A clip name from a file name: "Standard Run.fbx" becomes "mixamo/Standard Run". */
export const mixamoClipName = (fileName: string) => MIXAMO_PREFIX + fileName.replace(/\.(fbx|glb|gltf)$/i, "").replace(/[^\w .()-]/g, "").slice(0, 80);

let bind: Promise<THREE.Object3D> | null = null;
const imported = new Map<string, ImportedClip>();

/** Retarget the first clip of a parsed Mixamo file onto the mannequin and register it. */
export async function importMixamo(parsed: ParsedAnimation, fileName: string, rigged: RiggedCharacter): Promise<ImportedClip> {
  if (!parsed.clips.length) throw new Error(`${fileName} has no animation.`);
  if (parsed.mixamoBones < 10) throw new Error(`${fileName} has no Mixamo skeleton (mixamorig bones).`);
  const target = await (bind ??= riggedBindScene());
  const name = mixamoClipName(fileName);
  const { clip, report } = retargetMixamoClip(parsed.scene, parsed.clips[0], target, { fps: 30, name });
  rigged.rigged.sampler.add(clip);
  const entry: ImportedClip = { name, seconds: clip.duration, report, source: parsed.scene, sourceClip: parsed.clips[0], clip };
  imported.set(name, entry);
  if (!rigged.clips.some(c => c.name === name)) rigged.clips.push({ name, seconds: clip.duration });
  return entry;
}

/** Clips imported so far this session (name, seconds). */
export const importedClips = () => [...imported.values()].map(c => ({ name: c.name, seconds: c.seconds }));
export const importedClip = (name: string) => imported.get(name);

/** File names in assets-local/mixamo/, from the dev server (empty in a build). */
export async function localMixamoFiles(): Promise<string[]> {
  if (!import.meta.env.DEV) return [];
  try {
    const res = await fetch("/@local/mixamo/");
    return res.ok ? (await res.json() as string[]) : [];
  } catch { return []; }
}

export async function fetchLocalMixamo(file: string): Promise<ArrayBuffer> {
  const res = await fetch(`/@local/mixamo/${encodeURIComponent(file)}`);
  if (!res.ok) throw new Error(`Could not read ${file} from assets-local/mixamo/.`);
  return res.arrayBuffer();
}
