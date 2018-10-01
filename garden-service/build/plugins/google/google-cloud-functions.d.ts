import { Module } from "../../types/module";
import { ValidateModuleResult } from "../../types/plugin/outputs";
import { GetServiceStatusParams, ValidateModuleParams } from "../../types/plugin/params";
import { ServiceStatus } from "../../types/service";
import * as Joi from "joi";
import { GenericTestSpec } from "../generic";
import { GoogleCloudServiceSpec } from "./common";
import { GardenPlugin } from "../../types/plugin/plugin";
import { ModuleSpec } from "../../config/module";
export interface GcfServiceSpec extends GoogleCloudServiceSpec {
    entrypoint?: string;
    function: string;
    hostname?: string;
    path: string;
}
export declare const gcfServicesSchema: Joi.ArraySchema;
export interface GcfModuleSpec extends ModuleSpec {
    functions: GcfServiceSpec[];
    tests: GenericTestSpec[];
}
export interface GcfModule extends Module<GcfModuleSpec, GcfServiceSpec, GenericTestSpec> {
}
export declare function parseGcfModule({ moduleConfig }: ValidateModuleParams<GcfModule>): Promise<ValidateModuleResult<GcfModule>>;
export declare const gardenPlugin: () => GardenPlugin;
export declare function getServiceStatus({ ctx, service }: GetServiceStatusParams<GcfModule>): Promise<ServiceStatus>;
//# sourceMappingURL=google-cloud-functions.d.ts.map