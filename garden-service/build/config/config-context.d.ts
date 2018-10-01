import { Module } from "../types/module";
import { PrimitiveMap, Primitive } from "./common";
import { Provider, Environment } from "./project";
import { ModuleConfig } from "./module";
import { Service } from "../types/service";
import * as Joi from "joi";
import { Garden } from "../garden";
export declare type ContextKey = string[];
export interface ContextResolveParams {
    key: ContextKey;
    nodePath: ContextKey;
    stack?: string[];
}
export declare function schema(joiSchema: Joi.Schema): (target: any, propName: any) => void;
export declare abstract class ConfigContext {
    private readonly _rootContext;
    private readonly _resolvedValues;
    constructor(rootContext?: ConfigContext);
    static getSchema(): Joi.ObjectSchema;
    resolve({ key, nodePath, stack }: ContextResolveParams): Promise<Primitive>;
}
declare class LocalContext extends ConfigContext {
    env: typeof process.env;
    platform: string;
    constructor(root: ConfigContext);
}
/**
 * This context is available for template strings under the `project` key in configuration files.
 */
export declare class ProjectConfigContext extends ConfigContext {
    local: LocalContext;
    constructor();
}
declare class EnvironmentContext extends ConfigContext {
    name: string;
    constructor(root: ConfigContext, name: string);
}
declare class ModuleContext extends ConfigContext {
    path: string;
    version: string;
    buildPath: string;
    constructor(root: ConfigContext, module: Module);
}
declare class ServiceContext extends ConfigContext {
    outputs: PrimitiveMap;
    version: string;
    constructor(root: ConfigContext, service: Service, outputs: PrimitiveMap);
}
/**
 * This context is available for template strings under the `module` key in configuration files.
 * It is a superset of the context available under the `project` key.
 */
export declare class ModuleConfigContext extends ProjectConfigContext {
    environment: EnvironmentContext;
    modules: Map<string, () => Promise<ModuleContext>>;
    services: Map<string, () => Promise<ServiceContext>>;
    providers: Map<string, Provider>;
    variables: PrimitiveMap;
    constructor(garden: Garden, environment: Environment, moduleConfigs: ModuleConfig[]);
}
export {};
//# sourceMappingURL=config-context.d.ts.map