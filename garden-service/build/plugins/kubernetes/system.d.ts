import { Garden } from "../../garden";
import { KubernetesProvider } from "./kubernetes";
export declare const GARDEN_SYSTEM_NAMESPACE = "garden-system";
export declare const systemSymbol: unique symbol;
export declare function isSystemGarden(provider: KubernetesProvider): boolean;
export declare function getSystemGarden(provider: KubernetesProvider): Promise<Garden>;
//# sourceMappingURL=system.d.ts.map