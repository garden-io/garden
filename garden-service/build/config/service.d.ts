import * as Joi from "joi";
import { PrimitiveMap } from "./common";
export interface ServiceSpec {
}
export interface BaseServiceSpec extends ServiceSpec {
    name: string;
    dependencies: string[];
    outputs: PrimitiveMap;
}
export declare const serviceOutputsSchema: Joi.ObjectSchema;
export declare const baseServiceSchema: Joi.ObjectSchema;
export interface ServiceConfig<T extends ServiceSpec = ServiceSpec> extends BaseServiceSpec {
    spec: T;
}
export declare const serviceConfigSchema: Joi.ObjectSchema;
//# sourceMappingURL=service.d.ts.map