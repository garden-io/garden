import * as Joi from "joi";
import { PrimitiveMap } from "../config/common";
import { Module } from "./module";
import { ServiceConfig } from "../config/service";
import { Garden } from "../garden";
export interface Service<M extends Module = Module> {
    name: string;
    module: M;
    config: M["serviceConfigs"][0];
    spec: M["serviceConfigs"][0]["spec"];
}
export declare const serviceSchema: Joi.ObjectSchema;
export declare function serviceFromConfig<M extends Module = Module>(module: M, config: ServiceConfig): Service<M>;
export declare type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy" | "unknown" | "outdated" | "missing";
export declare type ServiceProtocol = "http" | "https";
export interface ServiceIngressSpec {
    hostname?: string;
    path: string;
    port: number;
    protocol: ServiceProtocol;
}
export interface ServiceIngress extends ServiceIngressSpec {
    hostname: string;
}
export declare const ingressHostnameSchema: Joi.StringSchema;
export declare const serviceIngressSpecSchema: Joi.ObjectSchema;
export declare const serviceIngressSchema: Joi.ObjectSchema;
export interface ServiceStatus {
    providerId?: string;
    providerVersion?: string;
    version?: string;
    state?: ServiceState;
    runningReplicas?: number;
    ingresses?: ServiceIngress[];
    lastMessage?: string;
    lastError?: string;
    createdAt?: string;
    updatedAt?: string;
    detail?: any;
}
export declare const serviceStatusSchema: Joi.ObjectSchema;
export declare type RuntimeContext = {
    envVars: PrimitiveMap;
    dependencies: {
        [name: string]: {
            version: string;
            outputs: PrimitiveMap;
        };
    };
};
export declare const runtimeContextSchema: Joi.ObjectSchema;
export declare function prepareRuntimeContext(garden: Garden, module: Module, serviceDependencies: Service[]): Promise<RuntimeContext>;
export declare function getIngressUrl(ingress: ServiceIngress): string;
//# sourceMappingURL=service.d.ts.map