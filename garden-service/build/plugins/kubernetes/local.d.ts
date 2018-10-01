import { GardenPlugin } from "../../types/plugin/plugin";
import { KubernetesBaseConfig } from "./kubernetes";
export interface LocalKubernetesConfig extends KubernetesBaseConfig {
    _system?: Symbol;
    _systemServices?: string[];
}
export declare const name = "local-kubernetes";
export declare function gardenPlugin({ projectName, config, logEntry }: {
    projectName: any;
    config: any;
    logEntry: any;
}): Promise<GardenPlugin>;
//# sourceMappingURL=local.d.ts.map