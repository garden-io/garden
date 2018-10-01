export declare class KeyedSet<V> {
    private keyFn;
    private map;
    constructor(keyFn: (V: any) => string);
    add(entry: V): KeyedSet<V>;
    delete(entry: V): boolean;
    has(entry: V): boolean;
    hasKey(key: string): boolean;
    entries(): V[];
    size(): number;
    clear(): void;
}
//# sourceMappingURL=keyed-set.d.ts.map