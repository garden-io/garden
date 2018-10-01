import { PluginContext } from "../../plugin-context";
import { Service, ServiceState } from "../../types/service";
import { KubeApi } from "./api";
import { KubernetesObject } from "./helm";
import { KubernetesProvider } from "./kubernetes";
import { LogEntry } from "../../logger/log-entry";
export interface RolloutStatus {
    state: ServiceState;
    obj: KubernetesObject;
    lastMessage?: string;
    lastError?: string;
    resourceVersion?: number;
}
/**
 * Check the rollout status for the given Deployment, DaemonSet or StatefulSet.
 *
 * NOTE: This mostly replicates the logic in `kubectl rollout status`. Using that directly here
 * didn't pan out, since it doesn't look for events and just times out when errors occur during rollout.
 */
export declare function checkDeploymentStatus(api: KubeApi, namespace: string, obj: KubernetesObject, resourceVersion?: number): Promise<RolloutStatus>;
/**
 * Check if the specified Kubernetes objects are deployed and fully rolled out
 */
export declare function checkObjectStatus(api: KubeApi, namespace: string, objects: KubernetesObject[], prevStatuses?: RolloutStatus[]): Promise<{
    ready: boolean;
    statuses: RolloutStatus[];
}>;
interface WaitParams {
    ctx: PluginContext;
    provider: KubernetesProvider;
    service: Service;
    objects: KubernetesObject[];
    logEntry?: LogEntry;
}
/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export declare function waitForObjects({ ctx, provider, service, objects, logEntry }: WaitParams): Promise<void>;
/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export declare function compareDeployedObjects(ctx: PluginContext, objects: KubernetesObject[]): Promise<boolean>;
/**
 * Recursively removes all null value properties from objects
 */
export declare function removeNull<T>(value: T | Iterable<T>): T | Iterable<T> | {
    [K in keyof T]: T[K];
};
export {};
//# sourceMappingURL=status.d.ts.map