import { Module } from "./types/module";
export declare class BuildDir {
    private projectRoot;
    buildDirPath: string;
    constructor(projectRoot: string, buildDirPath: string);
    static factory(projectRoot: string): Promise<BuildDir>;
    syncFromSrc(module: Module): Promise<void>;
    syncDependencyProducts(module: Module): Promise<void>;
    clear(): Promise<void>;
    buildPath(moduleName: string): Promise<string>;
    private sync;
}
//# sourceMappingURL=build-dir.d.ts.map