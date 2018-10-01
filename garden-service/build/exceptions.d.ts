export interface GardenError {
    type: string;
    message: string;
    detail?: any;
    stack?: string;
}
export declare abstract class GardenBaseError extends Error implements GardenError {
    abstract type: string;
    detail: any;
    constructor(message: string, detail: object);
}
export declare function toGardenError(err: Error | GardenError): GardenError;
export declare class AuthenticationError extends GardenBaseError {
    type: string;
}
export declare class ConfigurationError extends GardenBaseError {
    type: string;
}
export declare class LocalConfigError extends GardenBaseError {
    type: string;
}
export declare class ValidationError extends GardenBaseError {
    type: string;
}
export declare class PluginError extends GardenBaseError {
    type: string;
}
export declare class ParameterError extends GardenBaseError {
    type: string;
}
export declare class NotImplementedError extends GardenBaseError {
    type: string;
}
export declare class DeploymentError extends GardenBaseError {
    type: string;
}
export declare class RuntimeError extends GardenBaseError {
    type: string;
}
export declare class InternalError extends GardenBaseError {
    type: string;
}
export declare class TimeoutError extends GardenBaseError {
    type: string;
}
export declare class NotFoundError extends GardenBaseError {
    type: string;
}
//# sourceMappingURL=exceptions.d.ts.map