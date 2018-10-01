import * as Joi from "joi";
import { GardenPlugin } from "../../types/plugin/plugin";
import { Provider, ProviderConfig } from "../../config/project";
import { ContainerRegistryConfig } from "../container";
export declare const name = "kubernetes";
export interface SecretRef {
    name: string;
    namespace: string;
}
export interface IngressTlsCertificate {
    name: string;
    hostnames?: string[];
    secretRef: SecretRef;
}
export interface KubernetesBaseConfig extends ProviderConfig {
    context: string;
    defaultHostname?: string;
    defaultUsername?: string;
    forceSsl: boolean;
    imagePullSecrets: SecretRef[];
    ingressHttpPort: number;
    ingressHttpsPort: number;
    ingressClass: string;
    namespace?: string;
    tlsCertificates: IngressTlsCertificate[];
}
export interface KubernetesConfig extends KubernetesBaseConfig {
    deploymentRegistry: ContainerRegistryConfig;
}
export declare type KubernetesProvider = Provider<KubernetesConfig>;
export declare const k8sContextSchema: Joi.StringSchema;
export declare const kubernetesConfigBase: Joi.ObjectSchema;
export declare function gardenPlugin({ config }: {
    config: KubernetesConfig;
}): GardenPlugin;
//# sourceMappingURL=kubernetes.d.ts.map