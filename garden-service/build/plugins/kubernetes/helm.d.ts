import { Primitive } from "../../config/common";
import { Module } from "../../types/module";
import { ModuleAndServiceActions } from "../../types/plugin/plugin";
import { KubernetesProvider } from "./kubernetes";
import { ServiceSpec } from "../../config/service";
export interface KubernetesObject {
    apiVersion: string;
    kind: string;
    metadata: {
        annotations?: object;
        name: string;
        namespace?: string;
        labels?: object;
    };
    spec?: any;
}
export interface HelmServiceSpec extends ServiceSpec {
    chart: string;
    repo?: string;
    dependencies: string[];
    version?: string;
    parameters: {
        [key: string]: Primitive;
    };
}
export declare type HelmModuleSpec = HelmServiceSpec;
export interface HelmModule extends Module<HelmModuleSpec, HelmServiceSpec> {
}
export declare const helmHandlers: Partial<ModuleAndServiceActions<HelmModule>>;
export declare function helm(provider: KubernetesProvider, ...args: string[]): Promise<string>;
//# sourceMappingURL=helm.d.ts.map