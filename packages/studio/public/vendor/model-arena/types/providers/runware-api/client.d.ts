/**
 * The Runware REST client, shared by the browser element and the Node CLI.
 * It talks to one host only, takes the key from a getter so the caller
 * decides where it lives (memory, sessionStorage, an env var), and never puts
 * the key in an error, a log line or a returned object.
 */
export declare const RUNWARE_ENDPOINT = "https://api.runware.ai/v1";
export type FetchLike = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
export interface RunwareError {
    code: string;
    message: string;
    parameter?: string;
    taskUUID?: string;
}
export declare class RunwareApiError extends Error {
    status: number;
    errors: RunwareError[];
    constructor(status: number, errors: RunwareError[]);
}
export interface RunwareResponse {
    data: Record<string, unknown>[];
    errors: RunwareError[];
}
export declare class RunwareClient {
    private readonly getKey;
    private readonly fetchImpl;
    constructor(opts: {
        getKey: () => string | undefined;
        fetch?: FetchLike;
    });
    /** Redacts the key from any text before it is shown. */
    redact(text: string): string;
    post(tasks: Record<string, unknown>[], signal?: AbortSignal): Promise<RunwareResponse>;
    /** Stores media (data URI, base64 or public URL) and returns its UUID and URL. */
    upload(media: string, signal?: AbortSignal): Promise<{
        mediaUUID: string;
        mediaURL: string;
    }>;
    /**
     * The account's current balance in USD. The same response lists the team and
     * the API keys; only the number is read and nothing else is kept or returned.
     */
    balance(signal?: AbortSignal): Promise<number>;
    /** Reads back the stored request for a task; used to learn which model the router chose. */
    taskDetails(taskUUID: string, signal?: AbortSignal): Promise<Record<string, unknown> | undefined>;
}
