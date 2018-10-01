import { LinkedSource } from "../config-store";
import { Module } from "../types/module";
import { Garden } from "../garden";
export declare type ExternalSourceType = "project" | "module";
export declare function getRemoteSourcesDirname(type: ExternalSourceType): string;
/**
 * A remote source dir name has the format 'source-name--HASH_OF_REPO_URL'
 * so that we can detect if the repo url has changed
 */
export declare function getRemoteSourcePath({ name, url, sourceType }: {
    name: string;
    url: string;
    sourceType: ExternalSourceType;
}): string;
export declare function hashRepoUrl(url: string): string;
export declare function hasRemoteSource(module: Module): boolean;
export declare function getConfigKey(type: ExternalSourceType): string;
/**
 * Check if any module is linked, including those within an external project source.
 * Returns true if module path is not under the project root or alternatively if the module is a Garden module.
 */
export declare function isModuleLinked(module: Module, garden: Garden): boolean;
export declare function getLinkedSources(garden: Garden, type: ExternalSourceType): Promise<LinkedSource[]>;
export declare function addLinkedSources({ garden, sourceType, sources }: {
    garden: Garden;
    sourceType: ExternalSourceType;
    sources: LinkedSource[];
}): Promise<LinkedSource[]>;
export declare function removeLinkedSources({ garden, sourceType, names }: {
    garden: Garden;
    sourceType: ExternalSourceType;
    names: string[];
}): Promise<LinkedSource[]>;
//# sourceMappingURL=ext-source-util.d.ts.map