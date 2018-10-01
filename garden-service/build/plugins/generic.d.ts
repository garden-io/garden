import * as Joi from "joi";
import { GardenPlugin } from "../types/plugin/plugin";
import { Module } from "../types/module";
import { BuildResult, BuildStatus, ValidateModuleResult, TestResult } from "../types/plugin/outputs";
import { BuildModuleParams, GetBuildStatusParams, ValidateModuleParams, TestModuleParams } from "../types/plugin/params";
import { BaseServiceSpec } from "../config/service";
import { BaseTestSpec } from "../config/test";
import { ModuleSpec } from "../config/module";
export declare const name = "generic";
export interface GenericTestSpec extends BaseTestSpec {
    command: string[];
    env: {
        [key: string]: string;
    };
}
export declare const genericTestSchema: Joi.ObjectSchema;
export interface GenericModuleSpec extends ModuleSpec {
    env: {
        [key: string]: string;
    };
    tests: GenericTestSpec[];
}
export declare const genericModuleSpecSchema: Joi.ObjectSchema;
export interface GenericModule extends Module<GenericModuleSpec, BaseServiceSpec, GenericTestSpec> {
}
export declare function parseGenericModule({ moduleConfig }: ValidateModuleParams<GenericModule>): Promise<ValidateModuleResult>;
export declare function getGenericModuleBuildStatus({ module }: GetBuildStatusParams): Promise<BuildStatus>;
export declare function buildGenericModule({ module }: BuildModuleParams<GenericModule>): Promise<BuildResult>;
export declare function testGenericModule({ module, testConfig }: TestModuleParams<GenericModule>): Promise<TestResult>;
export declare const genericPlugin: GardenPlugin;
export declare const gardenPlugin: () => GardenPlugin;
//# sourceMappingURL=generic.d.ts.map