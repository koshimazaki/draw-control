/**
 * Motion Studio bundle reader: the manifest form of the guide-bundle schema
 * (`bundle.json` naming each file, schemaVersion "0.x.y", synced at 0.4.0) and
 * the conversion to the inline guide a record embeds. Dependency-free, like
 * `parseRecord`; the JSON Schema `$defs/manifest`, `beats`, `meta` and `camera`
 * are the published contract.
 */
import { type GuideBundle, type Onset } from "./record.ts";
/** The Motion Studio schema version this reader was synced with. */
export declare const BUNDLE_SCHEMA_VERSION = "0.5.0";
export interface BundleManifest {
    schemaVersion: string;
    video: string;
    audio?: string;
    firstFrame: string;
    firstFrameStyled?: string;
    beats: string;
    recipe: string;
    meta: string;
    /** Optional (0.2.0): the camera track file. */
    camera?: string;
}
export interface BundleBeats {
    bpm: number;
    offsetSeconds: number;
    beatsPerBar: number;
    source: "manual" | "analysis";
    beats: number[];
    downbeats: number[];
    /** Optional (0.3.0). */
    onsets?: {
        low: Onset[];
        mid: Onset[];
        high: Onset[];
    };
    /** Optional (0.3.0). */
    peaks?: Onset[];
}
export declare const CHARACTER_KINDS: readonly ["mannequin", "block", "stick", "blob", "glider", "file", "rigged"];
export type CharacterKind = (typeof CHARACTER_KINDS)[number];
export declare const ASSET_ROLES: readonly ["video", "audio", "firstFrame", "character", "motion", "recipe", "beats", "camera"];
export type AssetRole = (typeof ASSET_ROLES)[number];
export interface BundleMeta {
    schemaVersion: string;
    width: number;
    height: number;
    fps: 24;
    frames: number;
    durationSeconds: number;
    view: string;
    character: {
        kind: CharacterKind;
        name: string;
    };
    generator: {
        name: string;
        version: string;
        motion: string;
    };
    audioInVideo: boolean;
    assets: {
        role: AssetRole;
        name: string;
        licence: string;
        file?: string;
    }[];
}
/** Validates a `bundle.json`; refuses unknown keys, as the schema does. */
export declare function parseBundleManifest(v: unknown, path?: string): BundleManifest;
/** Validates a `beats.json`, including the optional 0.3.0 onsets and peaks. */
export declare function parseBundleBeats(v: unknown, path?: string): BundleBeats;
/** Validates the parts of a `meta.json` the Arena reads: size, timing, character, licences. */
export declare function parseBundleMeta(v: unknown, path?: string): BundleMeta;
export interface BundleFiles {
    manifest: unknown;
    beats: unknown;
    meta: unknown;
    recipe?: Record<string, unknown>;
}
/**
 * Turns a Motion Studio bundle into the inline guide a record embeds. `base`
 * is the bundle directory as the record will see it (a path or URL prefix).
 * Onsets, peaks, the camera track and the character survive the conversion.
 */
export declare function guideFromBundle(files: BundleFiles, base: string, id?: string): GuideBundle;
