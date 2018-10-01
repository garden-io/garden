import { TestSpec } from "../config/test";
import { ModuleSpec, ModuleConfig } from "../config/module";
import { ServiceSpec } from "../config/service";
import { ModuleVersion } from "../vcs/base";
import { Garden } from "../garden";
import { Service } from "./service";
import * as Joi from "joi";
export interface BuildCopySpec {
    source: string;
    target: string;
}
export interface Module<M extends ModuleSpec = any, S extends ServiceSpec = any, T extends TestSpec = any> extends ModuleConfig<M, S, T> {
    buildPath: string;
    version: ModuleVersion;
    services: Service<Module<M, S, T>>[];
    serviceNames: string[];
    serviceDependencyNames: string[];
    _ConfigType: ModuleConfig<M, S, T>;
}
export declare const moduleSchema: Joi.ObjectSchema;
export interface ModuleMap<T extends Module = Module> {
    [key: string]: T;
}
export interface ModuleConfigMap<T extends ModuleConfig = ModuleConfig> {
    [key: string]: T;
}
export declare function moduleFromConfig(garden: Garden, config: ModuleConfig): Promise<Module>;
export declare function getModuleCacheContext(config: ModuleConfig): string[];
export declare function getModuleKey(name: string, plugin?: string): string;
//# sourceMappingURL=module.d.ts.map