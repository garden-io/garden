import { JoiObject } from "joi";
import * as Joi from "joi";
import { ConfigurationError, LocalConfigError } from "../exceptions";
export declare type Primitive = string | number | boolean;
export interface PrimitiveMap {
    [key: string]: Primitive;
}
export interface DeepPrimitiveMap {
    [key: string]: Primitive | DeepPrimitiveMap;
}
export declare const enumToArray: (Enum: any) => string[];
export declare const joiPrimitive: () => Joi.AlternativesSchema;
export declare const identifierRegex: RegExp;
export declare const envVarRegex: RegExp;
export declare const joiIdentifier: () => Joi.StringSchema;
export declare const joiStringMap: (valueSchema: JoiObject) => Joi.ObjectSchema;
export declare const joiIdentifierMap: (valueSchema: JoiObject) => Joi.ObjectSchema;
export declare const joiVariables: () => Joi.ObjectSchema;
export declare const joiEnvVarName: () => Joi.StringSchema;
export declare const joiEnvVars: () => Joi.ObjectSchema;
export declare const joiArray: (schema: any) => Joi.ArraySchema;
export declare const joiRepositoryUrl: () => Joi.StringSchema;
export declare function isPrimitive(value: any): boolean;
export interface ValidateOptions {
    context?: string;
    ErrorClass?: typeof ConfigurationError | typeof LocalConfigError;
}
export declare function validate<T>(value: T, schema: Joi.Schema, { context, ErrorClass }?: ValidateOptions): T;
//# sourceMappingURL=common.d.ts.map