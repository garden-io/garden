import { DeployServiceParams, GetServiceStatusParams, PushModuleParams } from "../../types/plugin/params";
import { ContainerModule, ContainerService } from "../container";
import { RuntimeContext, ServiceStatus } from "../../types/service";
import { KubernetesObject } from "./helm";
import { PluginContext } from "../../plugin-context";
import { KubernetesProvider } from "./kubernetes";
export declare const DEFAULT_CPU_REQUEST = "10m";
export declare const DEFAULT_CPU_LIMIT = "500m";
export declare const DEFAULT_MEMORY_REQUEST = "128Mi";
export declare const DEFAULT_MEMORY_LIMIT = "512Mi";
export declare function getContainerServiceStatus({ ctx, module, service, runtimeContext }: GetServiceStatusParams<ContainerModule>): Promise<ServiceStatus>;
export declare function deployContainerService(params: DeployServiceParams<ContainerModule>): Promise<ServiceStatus>;
export declare function createContainerObjects(ctx: PluginContext, service: ContainerService, runtimeContext: RuntimeContext): Promise<any[]>;
export declare function createDeployment(provider: KubernetesProvider, service: ContainerService, runtimeContext: RuntimeContext, namespace: string): Promise<KubernetesObject>;
export declare function deleteContainerService({ namespace, provider, serviceName, logEntry }: {
    namespace: any;
    provider: any;
    serviceName: any;
    logEntry: any;
}): Promise<void>;
export declare function deleteContainerDeployment({ namespace, provider, serviceName, logEntry }: {
    namespace: any;
    provider: any;
    serviceName: any;
    logEntry: any;
}): Promise<void>;
export declare function pushModule({ ctx, module, logEntry }: PushModuleParams<ContainerModule>): Promise<{
    pushed: boolean;
    message?: undefined;
} | {
    pushed: boolean;
    message: string;
}>;
//# sourceMappingURL=deployment.d.ts.map