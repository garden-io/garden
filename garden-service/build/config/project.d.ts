import * as Joi from "joi";
import { Primitive } from "./common";
export interface ProviderConfig {
    name: string;
    [key: string]: any;
}
export declare const providerConfigBaseSchema: Joi.ObjectSchema;
export interface Provider<T extends ProviderConfig = any> {
    name: string;
    config: T;
}
export interface CommonEnvironmentConfig {
    providers: ProviderConfig[];
    variables: {
        [key: string]: Primitive;
    };
}
export declare const environmentConfigSchema: Joi.ObjectSchema;
export interface Environment extends CommonEnvironmentConfig {
    name: string;
}
export declare const environmentSchema: Joi.ObjectSchema;
export interface SourceConfig {
    name: string;
    repositoryUrl: string;
}
export declare const projectSourceSchema: Joi.ObjectSchema;
export declare const projectSourcesSchema: Joi.ArraySchema;
export interface ProjectConfig {
    name: string;
    defaultEnvironment: string;
    environmentDefaults: CommonEnvironmentConfig;
    environments: Environment[];
    sources?: SourceConfig[];
}
export declare const defaultProviders: {
    name: string;
}[];
export declare const defaultEnvironments: Environment[];
export declare const projectNameSchema: Joi.StringSchema;
export declare const projectSchema: Joi.ObjectSchema;
export declare const defaultProvider: Provider;
//# sourceMappingURL=project.d.ts.map