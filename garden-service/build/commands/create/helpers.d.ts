import * as Joi from "joi";
import { ModuleConfigOpts, ModuleType, ConfigOpts } from "./config-templates";
import { LogNode } from "../../logger/log-node";
export declare function prepareNewModuleConfig(name: string, type: ModuleType, path: string): ModuleConfigOpts;
export declare function dumpConfig(configOpts: ConfigOpts, schema: Joi.Schema, logger: LogNode): Promise<void>;
//# sourceMappingURL=helpers.d.ts.map