import * as Joi from "joi";
import { ServiceConfig, ServiceSpec } from "./service";
import { PrimitiveMap } from "./common";
import { TestConfig, TestSpec } from "./test";
export interface BuildCopySpec {
    source: string;
    target: string;
}
export interface BuildDependencyConfig {
    name: string;
    plugin?: string;
    copy: BuildCopySpec[];
}
export declare const buildDependencySchema: Joi.ObjectSchema;
export interface BuildConfig {
    command: string[];
    dependencies: BuildDependencyConfig[];
}
export interface ModuleSpec {
}
export interface BaseModuleSpec {
    allowPublish: boolean;
    build: BuildConfig;
    description?: string;
    name: string;
    path: string;
    type: string;
    variables: PrimitiveMap;
    repositoryUrl?: string;
}
export declare const baseModuleSpecSchema: Joi.ObjectSchema;
export interface ModuleConfig<M extends ModuleSpec = any, S extends ServiceSpec = any, T extends TestSpec = any> extends BaseModuleSpec {
    plugin?: string;
    serviceConfigs: ServiceConfig<S>[];
    testConfigs: TestConfig<T>[];
    spec: M;
}
export declare const moduleConfigSchema: Joi.ObjectSchema;
//# sourceMappingURL=module.d.ts.map