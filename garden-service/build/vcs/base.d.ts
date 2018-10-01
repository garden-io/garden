import * as Joi from "joi";
import { ExternalSourceType } from "../util/ext-source-util";
import { ModuleConfig } from "../config/module";
import { LogNode } from "../logger/log-node";
export declare const NEW_MODULE_VERSION = "0000000000";
export interface TreeVersion {
    latestCommit: string;
    dirtyTimestamp: number | null;
}
export interface TreeVersions {
    [moduleName: string]: TreeVersion;
}
export interface ModuleVersion {
    versionString: string;
    dirtyTimestamp: number | null;
    dependencyVersions: TreeVersions;
}
export declare const treeVersionSchema: Joi.ObjectSchema;
export declare const moduleVersionSchema: Joi.ObjectSchema;
export interface RemoteSourceParams {
    url: string;
    name: string;
    sourceType: ExternalSourceType;
    logEntry: LogNode;
}
export declare abstract class VcsHandler {
    protected projectRoot: string;
    constructor(projectRoot: string);
    abstract name: string;
    abstract getTreeVersion(path: string): Promise<TreeVersion>;
    abstract ensureRemoteSource(params: RemoteSourceParams): Promise<string>;
    abstract updateRemoteSource(params: RemoteSourceParams): any;
    resolveTreeVersion(path: string): Promise<TreeVersion>;
    resolveVersion(moduleConfig: ModuleConfig, dependencies: ModuleConfig[]): Promise<ModuleVersion>;
    getRemoteSourcesDirname(type: ExternalSourceType): string;
    getRemoteSourcePath(name: any, url: any, sourceType: any): string;
}
export declare function readTreeVersionFile(path: string): Promise<TreeVersion | null>;
export declare function writeTreeVersionFile(path: string, version: TreeVersion): Promise<void>;
export declare function readModuleVersionFile(path: string): Promise<ModuleVersion | null>;
export declare function writeModuleVersionFile(path: string, version: ModuleVersion): Promise<void>;
export declare function getVersionString(treeVersion: TreeVersion): string;
//# sourceMappingURL=base.d.ts.map