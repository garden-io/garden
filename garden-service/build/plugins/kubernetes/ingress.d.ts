import { ContainerService } from "../container";
import { ServiceIngress } from "../../types/service";
import { KubeApi } from "./api";
export declare function createIngresses(api: KubeApi, namespace: string, service: ContainerService): Promise<{
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        annotations: {
            "kubernetes.io/ingress.class": string;
            "ingress.kubernetes.io/force-ssl-redirect": string;
        };
        namespace: string;
    };
    spec: any;
}[]>;
export declare function getIngresses(service: ContainerService, api: KubeApi): Promise<ServiceIngress[]>;
//# sourceMappingURL=ingress.d.ts.map