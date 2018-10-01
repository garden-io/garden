import * as Joi from "joi";
import { Garden } from "../../garden";
import { PluginContext } from "../../plugin-context";
import { Module } from "../../types/module";
import { Service } from "../../types/service";
import { GenericModuleSpec, GenericTestSpec } from "../generic";
import { BaseServiceSpec } from "../../config/service";
import { GardenPlugin } from "../../types/plugin/plugin";
import { Provider } from "../../config/project";
export declare const stackFilename = "stack.yml";
export declare const FAAS_CLI_IMAGE_ID = "openfaas/faas-cli:0.7.3";
export interface OpenFaasModuleSpec extends GenericModuleSpec {
    handler: string;
    image: string;
    lang: string;
}
export declare const openfaasModuleSpecSchame: Joi.ObjectSchema;
export interface OpenFaasModule extends Module<OpenFaasModuleSpec, BaseServiceSpec, GenericTestSpec> {
}
export interface OpenFaasService extends Service<OpenFaasModule> {
}
export interface OpenFaasConfig extends Provider {
    hostname: string;
}
export declare function gardenPlugin({ config }: {
    config: OpenFaasConfig;
}): GardenPlugin;
export declare function getOpenFaasGarden(ctx: PluginContext): Promise<Garden>;
//# sourceMappingURL=openfaas.d.ts.map