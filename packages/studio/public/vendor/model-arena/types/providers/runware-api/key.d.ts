export declare class KeyStore {
    private readonly storage;
    private key;
    constructor(storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined);
    get: () => string | undefined;
    set(key: string, remember?: "memory" | "session"): void;
    clear(): void;
}
