/**
 * A record set: several records shown as tabs in one element, e.g. the blog
 * post's "Camera", "Audio sync" and "Character" tests. Each tab points at a
 * record file (resolved against the set's URL) or holds the record inline.
 */
import { type ArenaRecord } from "./record.ts";
export interface RecordSetTab {
    id: string;
    label: string;
    /** A record URL, relative to the set. */
    src?: string;
    record?: ArenaRecord;
}
export interface RecordSet {
    schemaVersion: 1;
    id: string;
    title: string;
    tabs: RecordSetTab[];
}
/** True when a fetched JSON document is a set rather than a single record. */
export declare const isRecordSet: (v: unknown) => boolean;
/** Validates an untrusted record set; inline records are parsed too. */
export declare function parseRecordSet(v: unknown): RecordSet;
