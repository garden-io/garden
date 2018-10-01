import { PluginContext } from "../../plugin-context";
import { KubeApi } from "./api";
import { KubernetesProvider } from "./kubernetes";
export declare function ensureNamespace(api: KubeApi, namespace: string): Promise<void>;
export declare function getNamespace({ ctx, provider, suffix, skipCreate }: {
    ctx: PluginContext;
    provider: KubernetesProvider;
    suffix?: string;
    skipCreate?: boolean;
}): Promise<string>;
export declare function getAppNamespace(ctx: PluginContext, provider: KubernetesProvider): Promise<string>;
export declare function getMetadataNamespace(ctx: PluginContext, provider: KubernetesProvider): Promise<string>;
export declare function getAllGardenNamespaces(api: KubeApi): Promise<string[]>;
//# sourceMappingURL=namespace.d.ts.map