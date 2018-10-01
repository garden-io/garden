import { ModuleConfig } from "./module";
import * as Joi from "joi";
import { ProjectConfig } from "../config/project";
export interface GardenConfig {
    version: string;
    dirname: string;
    path: string;
    module?: ModuleConfig;
    project?: ProjectConfig;
}
export declare const configSchema: Joi.ObjectSchema;
export declare function loadConfig(projectRoot: string, path: string): Promise<GardenConfig | undefined>;
export declare function findProjectConfig(path: string): Promise<GardenConfig | undefined>;
//# sourceMappingURL=base.d.ts.map