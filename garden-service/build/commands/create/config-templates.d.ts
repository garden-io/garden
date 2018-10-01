import * as Joi from "joi";
import { DeepPartial } from "../../util/util";
import { ContainerModuleSpec } from "../../plugins/container";
import { GcfModuleSpec } from "../../plugins/google/google-cloud-functions";
import { ProjectConfig } from "../../config/project";
import { BaseModuleSpec, ModuleConfig } from "../../config/module";
/**
 * Ideally there would be some mechanism to discover available module types,
 * and for plugins to expose a minimal config for the given type along with
 * a list of providers per environment, rather than hard coding these values.
 *
 * Alternatively, consider co-locating the templates with the plugins.
 */
export declare const MODULE_PROVIDER_MAP: {
    container: string;
    "google-cloud-function": string;
    "npm-package": string;
};
export declare const availableModuleTypes: ("container" | "npm-package" | "google-cloud-function")[];
export declare type ModuleType = keyof typeof MODULE_PROVIDER_MAP;
export declare const moduleSchema: Joi.ObjectSchema;
export interface ConfigOpts {
    name: string;
    path: string;
    config: {
        module: Partial<ModuleConfig>;
    } | Partial<ProjectConfig>;
}
export interface ModuleConfigOpts extends ConfigOpts {
    type: ModuleType;
    config: {
        module: Partial<ModuleConfig>;
    };
}
export interface ProjectConfigOpts extends ConfigOpts {
    config: Partial<ProjectConfig>;
}
export declare function containerTemplate(moduleName: string): DeepPartial<ContainerModuleSpec>;
export declare function googleCloudFunctionTemplate(moduleName: string): DeepPartial<GcfModuleSpec>;
export declare function npmPackageTemplate(_moduleName: string): any;
export declare const projectTemplate: (name: string, moduleTypes: ("container" | "npm-package" | "google-cloud-function")[]) => Partial<ProjectConfig>;
export declare const moduleTemplate: (name: string, type: "container" | "npm-package" | "google-cloud-function") => Partial<BaseModuleSpec>;
//# sourceMappingURL=config-templates.d.ts.map