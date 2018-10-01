"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const path_1 = require("path");
const exceptions_1 = require("./exceptions");
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
class TreeCache {
    constructor() {
        this.cache = new Map();
        this.contextTree = makeContextNode([]);
    }
    set(key, value, ...contexts) {
        if (key.length === 0) {
            throw new exceptions_1.ParameterError(`Cache key must have at least one part`, { key, contexts });
        }
        if (contexts.length === 0) {
            throw new exceptions_1.ParameterError(`Must specify at least one context`, { key, contexts });
        }
        const curriedKey = curry(key);
        let entry = this.cache.get(curriedKey);
        if (entry === undefined) {
            entry = { key, value, contexts: {} };
            this.cache.set(curriedKey, entry);
        }
        else {
            // merge with the existing entry
            entry.value = value;
        }
        contexts.forEach(c => entry.contexts[curry(c)] = c);
        for (const context of Object.values(contexts)) {
            let node = this.contextTree;
            if (context.length === 0) {
                throw new exceptions_1.ParameterError(`Context key must have at least one part`, { key, context });
            }
            const contextKey = [];
            for (const part of context) {
                contextKey.push(part);
                if (node.children[part]) {
                    node = node.children[part];
                }
                else {
                    node = node.children[part] = makeContextNode(contextKey);
                }
            }
            node.entries.add(curriedKey);
        }
    }
    get(key) {
        const entry = this.cache.get(curry(key));
        return entry ? entry.value : undefined;
    }
    getOrThrow(key) {
        const value = this.get(key);
        if (value === undefined) {
            throw new exceptions_1.NotFoundError(`Could not find key ${key} in cache`, { key });
        }
        return value;
    }
    getByContext(context) {
        let pairs = [];
        const node = this.getNode(context);
        if (node) {
            pairs = Array.from(node.entries).map(curriedKey => {
                const entry = this.cache.get(curriedKey);
                if (!entry) {
                    throw new exceptions_1.InternalError(`Invalid reference found in cache: ${curriedKey}`, { curriedKey });
                }
                return [entry.key, entry.value];
            });
        }
        return new Map(pairs);
    }
    /**
     * Delete a specific entry from the cache.
     */
    delete(key) {
        const curriedKey = curry(key);
        const entry = this.cache.get(curriedKey);
        if (entry === undefined) {
            return;
        }
        this.cache.delete(curriedKey);
        // clear the entry from its contexts
        for (const context of Object.values(entry.contexts)) {
            const node = this.getNode(context);
            node && node.entries.delete(curriedKey);
        }
    }
    /**
     * Invalidates all cache entries whose context equals `context`
     */
    invalidate(context) {
        const node = this.getNode(context);
        if (node) {
            // clear all cache entries on the node
            this.clearNode(node, false);
        }
    }
    /**
     * Invalidates all cache entries where the given `context` starts with the entries' context
     * (i.e. the whole path from the tree root down to the context leaf)
     */
    invalidateUp(context) {
        let node = this.contextTree;
        for (const part of context) {
            node = node.children[part];
            if (!node) {
                break;
            }
            this.clearNode(node, false);
        }
    }
    /**
     * Invalidates all cache entries whose context _starts_ with the given `context`
     * (i.e. the context node and the whole tree below it)
     */
    invalidateDown(context) {
        const node = this.getNode(context);
        if (node) {
            // clear all cache entries in the node and recursively through all child nodes
            this.clearNode(node, true);
        }
    }
    getNode(context) {
        let node = this.contextTree;
        for (const part of context) {
            node = node.children[part];
            if (!node) {
                // no cache keys under the given context
                return;
            }
        }
        return node;
    }
    clearNode(node, clearChildNodes) {
        for (const curriedKey of node.entries) {
            const entry = this.cache.get(curriedKey);
            if (entry === undefined) {
                return;
            }
            // also clear the invalidated entry from its other contexts
            for (const context of Object.values(entry.contexts)) {
                if (!lodash_1.isEqual(context, node.key)) {
                    const otherNode = this.getNode(context);
                    otherNode && otherNode.entries.delete(curriedKey);
                }
            }
            this.cache.delete(curriedKey);
        }
        node.entries = new Set();
        if (clearChildNodes) {
            for (const child of Object.values(node.children)) {
                this.clearNode(child, true);
            }
        }
    }
}
exports.TreeCache = TreeCache;
function makeContextNode(key) {
    return {
        key,
        children: {},
        entries: new Set(),
    };
}
function curry(key) {
    return JSON.stringify(key);
}
function pathToCacheContext(path) {
    const parsed = path_1.parse(path_1.normalize(path));
    return ["path", ...parsed.dir.split(path_1.sep)];
}
exports.pathToCacheContext = pathToCacheContext;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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SSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDaEQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUE7YUFDNUI7U0FDRjtJQUNILENBQUM7Q0FDRjtBQTVMRCw4QkE0TEM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxHQUFpQjtJQUN4QyxPQUFPO1FBQ0wsR0FBRztRQUNILFFBQVEsRUFBRSxFQUFFO1FBQ1osT0FBTyxFQUFFLElBQUksR0FBRyxFQUFjO0tBQy9CLENBQUE7QUFDSCxDQUFDO0FBRUQsU0FBUyxLQUFLLENBQUMsR0FBNEI7SUFDekMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0FBQzVCLENBQUM7QUFFRCxTQUFnQixrQkFBa0IsQ0FBQyxJQUFZO0lBQzdDLE1BQU0sTUFBTSxHQUFHLFlBQUssQ0FBQyxnQkFBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7SUFDckMsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQUcsQ0FBQyxDQUFDLENBQUE7QUFDM0MsQ0FBQztBQUhELGdEQUdDIiwiZmlsZSI6ImNhY2hlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIGlzRXF1YWwsXG59IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHtcbiAgbm9ybWFsaXplLFxuICBwYXJzZSxcbiAgc2VwLFxufSBmcm9tIFwicGF0aFwiXG5pbXBvcnQge1xuICBJbnRlcm5hbEVycm9yLFxuICBOb3RGb3VuZEVycm9yLFxuICBQYXJhbWV0ZXJFcnJvcixcbn0gZnJvbSBcIi4vZXhjZXB0aW9uc1wiXG5cbmV4cG9ydCB0eXBlIENhY2hlS2V5ID0gc3RyaW5nW11cbmV4cG9ydCB0eXBlIENhY2hlQ29udGV4dCA9IHN0cmluZ1tdXG5leHBvcnQgdHlwZSBDdXJyaWVkS2V5ID0gc3RyaW5nXG5cbmV4cG9ydCB0eXBlIENhY2hlVmFsdWUgPSBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgbnVsbCB8IG9iamVjdFxuZXhwb3J0IHR5cGUgQ2FjaGVWYWx1ZXMgPSBNYXA8Q2FjaGVLZXksIENhY2hlVmFsdWU+XG5cbmludGVyZmFjZSBDYWNoZUVudHJ5IHtcbiAga2V5OiBDYWNoZUtleVxuICB2YWx1ZTogQ2FjaGVWYWx1ZVxuICBjb250ZXh0czogeyBbY3VycmllZENvbnRleHQ6IHN0cmluZ106IENhY2hlQ29udGV4dCB9XG59XG5cbnR5cGUgQ2FjaGVFbnRyaWVzID0gTWFwPEN1cnJpZWRLZXksIENhY2hlRW50cnk+XG5cbmludGVyZmFjZSBDb250ZXh0Tm9kZSB7XG4gIGtleTogQ2FjaGVDb250ZXh0XG4gIGNoaWxkcmVuOiB7IFtjb250ZXh0UGFydDogc3RyaW5nXTogQ29udGV4dE5vZGUgfVxuICBlbnRyaWVzOiBTZXQ8Q3VycmllZEtleT5cbn1cblxuLyoqXG4gKiAgQSBzaW1wbGUgaW4tbWVtb3J5IGNhY2hlIHRoYXQgYWRkaXRpb25hbGx5IGluZGV4ZXMga2V5cyBpbiBhIHRyZWUgYnkgYSBzZXBlcmF0ZSBjb250ZXh0IGtleSwgc28gdGhhdCBrZXlzXG4gKiAgY2FuIGJlIGludmFsaWRhdGVkIGJhc2VkIG9uIHN1cnJvdW5kaW5nIGNvbnRleHQuXG4gKlxuICogIEZvciBleGFtcGxlLCB3ZSBjYW4gY2FjaGUgdGhlIHZlcnNpb24gb2YgYSBkaXJlY3RvcnkgcGF0aCwgYW5kIHRoZW4gaW52YWxpZGF0ZSBldmVyeSBjYWNoZWQga2V5IHVuZGVyIGFcbiAqICBwYXJlbnQgcGF0aDpcbiAqXG4gKiAgYGBgXG4gKiAgY29uc3QgY2FjaGUgPSBuZXcgVHJlZUNhY2hlKClcbiAqXG4gKiAgIyBUaGUgY29udGV4dCBwYXJhbWV0ZXIgKGxhc3QgcGFyYW1ldGVyKSBoZXJlIGlzIHRoZSBwYXRoIHRvIHRoZSBtb2R1bGUgc291cmNlXG4gKiAgY2FjaGUuc2V0KFtcIm1vZHVsZXNcIiwgXCJteS1tb2R1bGUtYVwiXSwgbW9kdWxlLCBbXCJtb2R1bGVzXCIsIFwibW9kdWxlLXBhdGgtYVwiXSlcbiAqICBjYWNoZS5zZXQoW1wibW9kdWxlc1wiLCBcIm15LW1vZHVsZS1iXCJdLCBtb2R1bGUsIFtcIm1vZHVsZXNcIiwgXCJtb2R1bGUtcGF0aC1iXCJdKVxuICpcbiAqICAjIEludmFsaWRhdGVzIHRoZSBjYWNoZSBmb3IgbW9kdWxlLWFcbiAqICBjYWNoZS5pbnZhbGlkYXRlKFtcIm1vZHVsZXNcIiwgXCJtb2R1bGUtcGF0aC1hXCJdKVxuICpcbiAqICAjIEFsc28gaW52YWxpZGF0ZXMgdGhlIGNhY2hlIGZvciBtb2R1bGUtYVxuICogIGNhY2hlLmludmFsaWRhdGVVcChbXCJtb2R1bGVzXCIsIFwibW9kdWxlLXBhdGgtYVwiLCBcInN1YmRpcmVjdG9yeVwiXSlcbiAqXG4gKiAgIyBJbnZhbGlkYXRlcyB0aGUgY2FjaGUgZm9yIGJvdGggbW9kdWxlc1xuICogIGNhY2hlLmludmFsaWRhdGVEb3duKFtcIm1vZHVsZXNcIl0pXG4gKiAgYGBgXG4gKlxuICogIFRoaXMgaXMgdXNlZnVsLCBmb3IgZXhhbXBsZSwgd2hlbiBsaXN0ZW5pbmcgZm9yIGZpbGVzeXN0ZW0gZXZlbnRzIHRvIG1ha2Ugc3VyZSBjYWNoZWQgaXRlbXMgc3RheSBpblxuICogIHN5bmMgYWZ0ZXIgbWFraW5nIGNoYW5nZXMgdG8gc291cmNlcy5cbiAqXG4gKiAgQSBzaW5nbGUgY2FjaGUgZW50cnkgY2FuIGFsc28gaGF2ZSBtdWx0aXBsZSBpbnZhbGlkYXRpb24gY29udGV4dHMsIHdoaWNoIGlzIGhlbHBmdWwgd2hlbiBhIGNhY2hlIGtleVxuICogIGNhbiBiZSBpbnZhbGlkYXRlZCBieSBjaGFuZ2VzIHRvIG11bHRpcGxlIGNvbnRleHRzIChzYXkgZm9yIGEgbW9kdWxlIHZlcnNpb24sIHdoaWNoIHNob3VsZCBhbHNvIGJlXG4gKiAgaW52YWxpZGF0ZWQgd2hlbiBkZXBlbmRlbmNpZXMgYXJlIHVwZGF0ZWQpLlxuICpcbiAqL1xuZXhwb3J0IGNsYXNzIFRyZWVDYWNoZSB7XG4gIHByaXZhdGUgcmVhZG9ubHkgY2FjaGU6IENhY2hlRW50cmllc1xuICBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRUcmVlOiBDb250ZXh0Tm9kZVxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY2FjaGUgPSBuZXcgTWFwPEN1cnJpZWRLZXksIENhY2hlRW50cnk+KClcbiAgICB0aGlzLmNvbnRleHRUcmVlID0gbWFrZUNvbnRleHROb2RlKFtdKVxuICB9XG5cbiAgc2V0KGtleTogQ2FjaGVLZXksIHZhbHVlOiBDYWNoZVZhbHVlLCAuLi5jb250ZXh0czogQ2FjaGVDb250ZXh0W10pIHtcbiAgICBpZiAoa2V5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBDYWNoZSBrZXkgbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBwYXJ0YCwgeyBrZXksIGNvbnRleHRzIH0pXG4gICAgfVxuXG4gICAgaWYgKGNvbnRleHRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBNdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIGNvbnRleHRgLCB7IGtleSwgY29udGV4dHMgfSlcbiAgICB9XG5cbiAgICBjb25zdCBjdXJyaWVkS2V5ID0gY3Vycnkoa2V5KVxuICAgIGxldCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGN1cnJpZWRLZXkpXG5cbiAgICBpZiAoZW50cnkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZW50cnkgPSB7IGtleSwgdmFsdWUsIGNvbnRleHRzOiB7fSB9XG4gICAgICB0aGlzLmNhY2hlLnNldChjdXJyaWVkS2V5LCBlbnRyeSlcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmcgZW50cnlcbiAgICAgIGVudHJ5LnZhbHVlID0gdmFsdWVcbiAgICB9XG5cbiAgICBjb250ZXh0cy5mb3JFYWNoKGMgPT4gZW50cnkhLmNvbnRleHRzW2N1cnJ5KGMpXSA9IGMpXG5cbiAgICBmb3IgKGNvbnN0IGNvbnRleHQgb2YgT2JqZWN0LnZhbHVlcyhjb250ZXh0cykpIHtcbiAgICAgIGxldCBub2RlID0gdGhpcy5jb250ZXh0VHJlZVxuXG4gICAgICBpZiAoY29udGV4dC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBDb250ZXh0IGtleSBtdXN0IGhhdmUgYXQgbGVhc3Qgb25lIHBhcnRgLCB7IGtleSwgY29udGV4dCB9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBjb250ZXh0S2V5OiBDYWNoZUNvbnRleHQgPSBbXVxuXG4gICAgICBmb3IgKGNvbnN0IHBhcnQgb2YgY29udGV4dCkge1xuICAgICAgICBjb250ZXh0S2V5LnB1c2gocGFydClcblxuICAgICAgICBpZiAobm9kZS5jaGlsZHJlbltwYXJ0XSkge1xuICAgICAgICAgIG5vZGUgPSBub2RlLmNoaWxkcmVuW3BhcnRdXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbm9kZSA9IG5vZGUuY2hpbGRyZW5bcGFydF0gPSBtYWtlQ29udGV4dE5vZGUoY29udGV4dEtleSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBub2RlLmVudHJpZXMuYWRkKGN1cnJpZWRLZXkpXG4gICAgfVxuICB9XG5cbiAgZ2V0KGtleTogQ2FjaGVLZXkpOiBDYWNoZVZhbHVlIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGN1cnJ5KGtleSkpXG4gICAgcmV0dXJuIGVudHJ5ID8gZW50cnkudmFsdWUgOiB1bmRlZmluZWRcbiAgfVxuXG4gIGdldE9yVGhyb3coa2V5OiBDYWNoZUtleSk6IENhY2hlVmFsdWUge1xuICAgIGNvbnN0IHZhbHVlID0gdGhpcy5nZXQoa2V5KVxuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgTm90Rm91bmRFcnJvcihgQ291bGQgbm90IGZpbmQga2V5ICR7a2V5fSBpbiBjYWNoZWAsIHsga2V5IH0pXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZVxuICB9XG5cbiAgZ2V0QnlDb250ZXh0KGNvbnRleHQ6IENhY2hlQ29udGV4dCk6IENhY2hlVmFsdWVzIHtcbiAgICBsZXQgcGFpcnM6IFtDYWNoZUtleSwgQ2FjaGVWYWx1ZV1bXSA9IFtdXG5cbiAgICBjb25zdCBub2RlID0gdGhpcy5nZXROb2RlKGNvbnRleHQpXG5cbiAgICBpZiAobm9kZSkge1xuICAgICAgcGFpcnMgPSBBcnJheS5mcm9tKG5vZGUuZW50cmllcykubWFwKGN1cnJpZWRLZXkgPT4ge1xuICAgICAgICBjb25zdCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGN1cnJpZWRLZXkpXG4gICAgICAgIGlmICghZW50cnkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgSW50ZXJuYWxFcnJvcihgSW52YWxpZCByZWZlcmVuY2UgZm91bmQgaW4gY2FjaGU6ICR7Y3VycmllZEtleX1gLCB7IGN1cnJpZWRLZXkgfSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gPFtDYWNoZUtleSwgQ2FjaGVWYWx1ZV0+W2VudHJ5LmtleSwgZW50cnkudmFsdWVdXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgTWFwPENhY2hlS2V5LCBDYWNoZVZhbHVlPihwYWlycylcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSBzcGVjaWZpYyBlbnRyeSBmcm9tIHRoZSBjYWNoZS5cbiAgICovXG4gIGRlbGV0ZShrZXk6IENhY2hlS2V5KSB7XG4gICAgY29uc3QgY3VycmllZEtleSA9IGN1cnJ5KGtleSlcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGN1cnJpZWRLZXkpXG5cbiAgICBpZiAoZW50cnkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5jYWNoZS5kZWxldGUoY3VycmllZEtleSlcblxuICAgIC8vIGNsZWFyIHRoZSBlbnRyeSBmcm9tIGl0cyBjb250ZXh0c1xuICAgIGZvciAoY29uc3QgY29udGV4dCBvZiBPYmplY3QudmFsdWVzKGVudHJ5LmNvbnRleHRzKSkge1xuICAgICAgY29uc3Qgbm9kZSA9IHRoaXMuZ2V0Tm9kZShjb250ZXh0KVxuICAgICAgbm9kZSAmJiBub2RlLmVudHJpZXMuZGVsZXRlKGN1cnJpZWRLZXkpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEludmFsaWRhdGVzIGFsbCBjYWNoZSBlbnRyaWVzIHdob3NlIGNvbnRleHQgZXF1YWxzIGBjb250ZXh0YFxuICAgKi9cbiAgaW52YWxpZGF0ZShjb250ZXh0OiBDYWNoZUNvbnRleHQpIHtcbiAgICBjb25zdCBub2RlID0gdGhpcy5nZXROb2RlKGNvbnRleHQpXG5cbiAgICBpZiAobm9kZSkge1xuICAgICAgLy8gY2xlYXIgYWxsIGNhY2hlIGVudHJpZXMgb24gdGhlIG5vZGVcbiAgICAgIHRoaXMuY2xlYXJOb2RlKG5vZGUsIGZhbHNlKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbnZhbGlkYXRlcyBhbGwgY2FjaGUgZW50cmllcyB3aGVyZSB0aGUgZ2l2ZW4gYGNvbnRleHRgIHN0YXJ0cyB3aXRoIHRoZSBlbnRyaWVzJyBjb250ZXh0XG4gICAqIChpLmUuIHRoZSB3aG9sZSBwYXRoIGZyb20gdGhlIHRyZWUgcm9vdCBkb3duIHRvIHRoZSBjb250ZXh0IGxlYWYpXG4gICAqL1xuICBpbnZhbGlkYXRlVXAoY29udGV4dDogQ2FjaGVDb250ZXh0KSB7XG4gICAgbGV0IG5vZGUgPSB0aGlzLmNvbnRleHRUcmVlXG5cbiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgY29udGV4dCkge1xuICAgICAgbm9kZSA9IG5vZGUuY2hpbGRyZW5bcGFydF1cbiAgICAgIGlmICghbm9kZSkge1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgdGhpcy5jbGVhck5vZGUobm9kZSwgZmFsc2UpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEludmFsaWRhdGVzIGFsbCBjYWNoZSBlbnRyaWVzIHdob3NlIGNvbnRleHQgX3N0YXJ0c18gd2l0aCB0aGUgZ2l2ZW4gYGNvbnRleHRgXG4gICAqIChpLmUuIHRoZSBjb250ZXh0IG5vZGUgYW5kIHRoZSB3aG9sZSB0cmVlIGJlbG93IGl0KVxuICAgKi9cbiAgaW52YWxpZGF0ZURvd24oY29udGV4dDogQ2FjaGVDb250ZXh0KSB7XG4gICAgY29uc3Qgbm9kZSA9IHRoaXMuZ2V0Tm9kZShjb250ZXh0KVxuXG4gICAgaWYgKG5vZGUpIHtcbiAgICAgIC8vIGNsZWFyIGFsbCBjYWNoZSBlbnRyaWVzIGluIHRoZSBub2RlIGFuZCByZWN1cnNpdmVseSB0aHJvdWdoIGFsbCBjaGlsZCBub2Rlc1xuICAgICAgdGhpcy5jbGVhck5vZGUobm9kZSwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldE5vZGUoY29udGV4dDogQ2FjaGVDb250ZXh0KSB7XG4gICAgbGV0IG5vZGUgPSB0aGlzLmNvbnRleHRUcmVlXG5cbiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgY29udGV4dCkge1xuICAgICAgbm9kZSA9IG5vZGUuY2hpbGRyZW5bcGFydF1cblxuICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgIC8vIG5vIGNhY2hlIGtleXMgdW5kZXIgdGhlIGdpdmVuIGNvbnRleHRcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG5vZGVcbiAgfVxuXG4gIHByaXZhdGUgY2xlYXJOb2RlKG5vZGU6IENvbnRleHROb2RlLCBjbGVhckNoaWxkTm9kZXM6IGJvb2xlYW4pIHtcbiAgICBmb3IgKGNvbnN0IGN1cnJpZWRLZXkgb2Ygbm9kZS5lbnRyaWVzKSB7XG4gICAgICBjb25zdCBlbnRyeSA9IHRoaXMuY2FjaGUuZ2V0KGN1cnJpZWRLZXkpXG5cbiAgICAgIGlmIChlbnRyeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICAvLyBhbHNvIGNsZWFyIHRoZSBpbnZhbGlkYXRlZCBlbnRyeSBmcm9tIGl0cyBvdGhlciBjb250ZXh0c1xuICAgICAgZm9yIChjb25zdCBjb250ZXh0IG9mIE9iamVjdC52YWx1ZXMoZW50cnkuY29udGV4dHMpKSB7XG4gICAgICAgIGlmICghaXNFcXVhbChjb250ZXh0LCBub2RlLmtleSkpIHtcbiAgICAgICAgICBjb25zdCBvdGhlck5vZGUgPSB0aGlzLmdldE5vZGUoY29udGV4dClcbiAgICAgICAgICBvdGhlck5vZGUgJiYgb3RoZXJOb2RlLmVudHJpZXMuZGVsZXRlKGN1cnJpZWRLZXkpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5jYWNoZS5kZWxldGUoY3VycmllZEtleSlcbiAgICB9XG5cbiAgICBub2RlLmVudHJpZXMgPSBuZXcgU2V0PEN1cnJpZWRLZXk+KClcblxuICAgIGlmIChjbGVhckNoaWxkTm9kZXMpIHtcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgT2JqZWN0LnZhbHVlcyhub2RlLmNoaWxkcmVuKSkge1xuICAgICAgICB0aGlzLmNsZWFyTm9kZShjaGlsZCwgdHJ1ZSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZUNvbnRleHROb2RlKGtleTogQ2FjaGVDb250ZXh0KTogQ29udGV4dE5vZGUge1xuICByZXR1cm4ge1xuICAgIGtleSxcbiAgICBjaGlsZHJlbjoge30sXG4gICAgZW50cmllczogbmV3IFNldDxDdXJyaWVkS2V5PigpLFxuICB9XG59XG5cbmZ1bmN0aW9uIGN1cnJ5KGtleTogQ2FjaGVLZXkgfCBDYWNoZUNvbnRleHQpIHtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGtleSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhdGhUb0NhY2hlQ29udGV4dChwYXRoOiBzdHJpbmcpOiBDYWNoZUNvbnRleHQge1xuICBjb25zdCBwYXJzZWQgPSBwYXJzZShub3JtYWxpemUocGF0aCkpXG4gIHJldHVybiBbXCJwYXRoXCIsIC4uLnBhcnNlZC5kaXIuc3BsaXQoc2VwKV1cbn1cbiJdfQ==
