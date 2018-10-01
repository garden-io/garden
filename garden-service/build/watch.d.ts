import { Module } from "./types/module";
import { Garden } from "./garden";
export declare type AutoReloadDependants = {
    [key: string]: Module[];
};
export declare type ChangeHandler = (module: Module | null, configChanged: boolean) => Promise<void>;
export declare function withDependants(garden: Garden, modules: Module[], autoReloadDependants: AutoReloadDependants): Promise<Module[]>;
export declare function computeAutoReloadDependants(garden: Garden): Promise<AutoReloadDependants>;
export declare class FSWatcher {
    private garden;
    private watcher;
    constructor(garden: Garden);
    watchModules(modules: Module[], changeHandler: ChangeHandler): Promise<void>;
    private makeFileChangedHandler;
    private makeDirAddedHandler;
    private makeDirRemovedHandler;
    private invalidateCached;
    private invalidateCachedForAll;
    close(): void;
}
//# sourceMappingURL=watch.d.ts.map