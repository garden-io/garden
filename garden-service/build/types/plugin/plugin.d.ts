import * as Joi from "joi";
import { Module } from "../module";
import { LogNode } from "../../logger/log-node";
import { Provider } from "../../config/project";
import { ModuleActionOutputs, PluginActionOutputs, ServiceActionOutputs } from "./outputs";
import { ModuleActionParams, PluginActionParams, ServiceActionParams } from "./params";
export declare type PluginActions = {
    [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P];
};
export declare type ServiceActions<T extends Module = Module> = {
    [P in keyof ServiceActionParams<T>]: (params: ServiceActionParams<T>[P]) => ServiceActionOutputs[P];
};
export declare type ModuleActions<T extends Module = Module> = {
    [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs[P];
};
export declare type ModuleAndServiceActions<T extends Module = Module> = ModuleActions<T> & ServiceActions<T>;
export declare type PluginActionName = keyof PluginActions;
export declare type ServiceActionName = keyof ServiceActions;
export declare type ModuleActionName = keyof ModuleActions;
export interface PluginActionDescription {
    description: string;
    paramsSchema: Joi.Schema;
    resultSchema: Joi.Schema;
}
export declare const pluginActionDescriptions: {
    [P in PluginActionName]: PluginActionDescription;
};
export declare const serviceActionDescriptions: {
    [P in ServiceActionName]: PluginActionDescription;
};
export declare const moduleActionDescriptions: {
    [P in ModuleActionName | ServiceActionName]: PluginActionDescription;
};
export declare const pluginActionNames: PluginActionName[];
export declare const serviceActionNames: ServiceActionName[];
export declare const moduleActionNames: ModuleActionName[];
export interface GardenPlugin {
    config?: object;
    configKeys?: string[];
    modules?: string[];
    actions?: Partial<PluginActions>;
    moduleActions?: {
        [moduleType: string]: Partial<ModuleAndServiceActions>;
    };
}
export interface PluginFactoryParams<T extends Provider = any> {
    config: T["config"];
    logEntry: LogNode;
    projectName: string;
}
export interface PluginFactory<T extends Provider = any> {
    (params: PluginFactoryParams<T>): GardenPlugin | Promise<GardenPlugin>;
}
export declare type RegisterPluginParam = string | PluginFactory;
export interface Plugins {
    [name: string]: RegisterPluginParam;
}
export declare const pluginSchema: Joi.ObjectSchema;
export declare const pluginModuleSchema: Joi.ObjectSchema;
//# sourceMappingURL=plugin.d.ts.map