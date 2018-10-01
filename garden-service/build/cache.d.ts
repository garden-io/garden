export declare type CacheKey = string[];
export declare type CacheContext = string[];
export declare type CurriedKey = string;
export declare type CacheValue = string | number | boolean | null | object;
export declare type CacheValues = Map<CacheKey, CacheValue>;
/**
 *  A simple in-memory cache that additionally indexes keys in a tree by a seperate context key, so that keys
 *  can be invalidated based on surrounding context.
 *
 *  For example, we can cache the version of a directory path, and then invalidate every cached key under a
 *  parent path:
 *
 *  ```
 *  const cache = new TreeCache()
 *
 *  # The context parameter (last parameter) here is the path to the module source
 *  cache.set(["modules", "my-module-a"], module, ["modules", "module-path-a"])
 *  cache.set(["modules", "my-module-b"], module, ["modules", "module-path-b"])
 *
 *  # Invalidates the cache for module-a
 *  cache.invalidate(["modules", "module-path-a"])
 *
 *  # Also invalidates the cache for module-a
 *  cache.invalidateUp(["modules", "module-path-a", "subdirectory"])
 *
 *  # Invalidates the cache for both modules
 *  cache.invalidateDown(["modules"])
 *  ```
 *
 *  This is useful, for example, when listening for filesystem events to make sure cached items stay in
 *  sync after making changes to sources.
 *
 *  A single cache entry can also have multiple invalidation contexts, which is helpful when a cache key
 *  can be invalidated by changes to multiple contexts (say for a module version, which should also be
 *  invalidated when dependencies are updated).
 *
 */
export declare class TreeCache {
    private readonly cache;
    private readonly contextTree;
    constructor();
    set(key: CacheKey, value: CacheValue, ...contexts: CacheContext[]): void;
    get(key: CacheKey): CacheValue | undefined;
    getOrThrow(key: CacheKey): CacheValue;
    getByContext(context: CacheContext): CacheValues;
    /**
     * Delete a specific entry from the cache.
     */
    delete(key: CacheKey): void;
    /**
     * Invalidates all cache entries whose context equals `context`
     */
    invalidate(context: CacheContext): void;
    /**
     * Invalidates all cache entries where the given `context` starts with the entries' context
     * (i.e. the whole path from the tree root down to the context leaf)
     */
    invalidateUp(context: CacheContext): void;
    /**
     * Invalidates all cache entries whose context _starts_ with the given `context`
     * (i.e. the context node and the whole tree below it)
     */
    invalidateDown(context: CacheContext): void;
    private getNode;
    private clearNode;
}
export declare function pathToCacheContext(path: string): CacheContext;
//# sourceMappingURL=cache.d.ts.map