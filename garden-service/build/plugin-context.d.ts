import { Garden } from "./garden";
import * as Joi from "joi";
import { Provider } from "./config/project";
declare type WrappedFromGarden = Pick<Garden, "projectName" | "projectRoot" | "projectSources" | "localConfigStore" | "environment">;
export interface PluginContext extends WrappedFromGarden {
    provider: Provider;
    providers: {
        [name: string]: Provider;
    };
}
export declare const pluginContextSchema: Joi.ObjectSchema;
export declare function createPluginContext(garden: Garden, providerName: string): PluginContext;
export {};
//# sourceMappingURL=plugin-context.d.ts.map