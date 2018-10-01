/// <reference types="node" />
import { Core_v1Api, Extensions_v1beta1Api, RbacAuthorization_v1Api, Apps_v1Api, Apiextensions_v1beta1Api, V1Secret, Policy_v1beta1Api } from "@kubernetes/client-node";
import { GardenBaseError } from "../../exceptions";
import { KubernetesObject } from "./helm";
import { KubernetesProvider } from "./kubernetes";
declare const crudMap: {
    Secret: {
        type: typeof V1Secret;
        group: string;
        read: string;
        create: string;
        patch: string;
        delete: string;
    };
};
declare type CrudMapType = typeof crudMap;
export declare class KubernetesError extends GardenBaseError {
    type: string;
    code?: number;
    response?: any;
}
export declare class KubeApi {
    provider: KubernetesProvider;
    context: string;
    apiExtensions: Apiextensions_v1beta1Api;
    apps: Apps_v1Api;
    core: Core_v1Api;
    extensions: Extensions_v1beta1Api;
    policy: Policy_v1beta1Api;
    rbac: RbacAuthorization_v1Api;
    constructor(provider: KubernetesProvider);
    readBySpec(namespace: string, spec: KubernetesObject): Promise<{
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1beta1CustomResourceDefinition;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1StatefulSet;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1ConfigMap;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1Endpoints;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1LimitRange;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1PersistentVolumeClaim;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1Pod;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1PodTemplate;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1ReplicationController;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1ResourceQuota;
    } | {
        response: import("http").ClientResponse;
        body: V1Secret;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1Service;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1ServiceAccount;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1beta1DaemonSet;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").ExtensionsV1beta1Deployment;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1beta1Ingress;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1beta1ReplicaSet;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1beta1PodDisruptionBudget;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1ClusterRoleBinding;
    } | {
        response: import("http").ClientResponse;
        body: import("@kubernetes/client-node/dist/api").V1Role;
    }>;
    upsert<K extends keyof CrudMapType>(kind: K, namespace: string, obj: KubernetesObject): Promise<KubernetesObject>;
    /**
     * Wrapping the API objects to deal with bugs.
     */
    private proxyApi;
}
export {};
//# sourceMappingURL=api.d.ts.map