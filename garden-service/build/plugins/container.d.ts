import * as Joi from "joi";
import { Module } from "../types/module";
import { PrimitiveMap } from "../config/common";
import { GardenPlugin } from "../types/plugin/plugin";
import { ValidateModuleParams } from "../types/plugin/params";
import { Service } from "../types/service";
import { GenericTestSpec } from "./generic";
import { ModuleSpec, ModuleConfig } from "../config/module";
import { BaseServiceSpec, ServiceConfig } from "../config/service";
export interface ContainerIngressSpec {
    hostname?: string;
    path: string;
    port: string;
}
export declare type ServicePortProtocol = "TCP" | "UDP";
export interface ServicePortSpec {
    name: string;
    protocol: ServicePortProtocol;
    containerPort: number;
    hostPort?: number;
    nodePort?: number;
}
export interface ServiceVolumeSpec {
    name: string;
    containerPath: string;
    hostPath?: string;
}
export interface ServiceHealthCheckSpec {
    httpGet?: {
        path: string;
        port: string;
        scheme?: "HTTP" | "HTTPS";
    };
    command?: string[];
    tcpPort?: string;
}
export interface ContainerServiceSpec extends BaseServiceSpec {
    command: string[];
    daemon: boolean;
    ingresses: ContainerIngressSpec[];
    env: PrimitiveMap;
    healthCheck?: ServiceHealthCheckSpec;
    ports: ServicePortSpec[];
    volumes: ServiceVolumeSpec[];
}
export declare type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>;
export interface ContainerRegistryConfig {
    hostname: string;
    port?: number;
    namespace: string;
}
export declare const containerRegistryConfigSchema: Joi.ObjectSchema;
export interface ContainerService extends Service<ContainerModule> {
}
export interface ContainerTestSpec extends GenericTestSpec {
}
export declare const containerTestSchema: Joi.ObjectSchema;
export interface ContainerModuleSpec extends ModuleSpec {
    buildArgs: PrimitiveMap;
    image?: string;
    services: ContainerServiceSpec[];
    tests: ContainerTestSpec[];
}
export declare type ContainerModuleConfig = ModuleConfig<ContainerModuleSpec>;
export declare const defaultNamespace = "_";
export declare const defaultTag = "latest";
export declare const containerModuleSpecSchema: Joi.ObjectSchema;
export interface ContainerModule<M extends ContainerModuleSpec = ContainerModuleSpec, S extends ContainerServiceSpec = ContainerServiceSpec, T extends ContainerTestSpec = ContainerTestSpec> extends Module<M, S, T> {
}
interface ParsedImageId {
    host?: string;
    namespace?: string;
    repository: string;
    tag: string;
}
export declare const helpers: {
    /**
     * Returns the image ID used locally, when building and deploying to local environments
     * (when we don't need to push to remote registries).
     */
    getLocalImageId(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>): Promise<string>;
    /**
     * Returns the image ID to be used for publishing to container registries
     * (not to be confused with the ID used when pushing to private deployment registries).
     */
    getPublicImageId(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>): Promise<string>;
    /**
     * Returns the image ID to be used when pushing to deployment registries.
     */
    getDeploymentImageId(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>, registryConfig?: ContainerRegistryConfig | undefined): Promise<string>;
    parseImageId(imageId: string): ParsedImageId;
    unparseImageId(parsed: ParsedImageId): string;
    pullImage(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>): Promise<void>;
    imageExistsLocally(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>): Promise<string | null>;
    dockerCli(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>, args: any): Promise<any>;
    hasDockerfile(module: ContainerModule<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>): Promise<boolean>;
};
export declare function validateContainerModule({ moduleConfig }: ValidateModuleParams<ContainerModule>): Promise<ModuleConfig<ContainerModuleSpec, ContainerServiceSpec, ContainerTestSpec>>;
export declare const gardenPlugin: () => GardenPlugin;
export {};
//# sourceMappingURL=container.d.ts.map