import { ContainerModule, ContainerModuleSpec, ContainerServiceSpec } from "../container";
import { GardenPlugin } from "../../types/plugin/plugin";
export interface GoogleAppEngineServiceSpec extends ContainerServiceSpec {
    project?: string;
}
export interface GoogleAppEngineModule extends ContainerModule<ContainerModuleSpec, GoogleAppEngineServiceSpec> {
}
export declare const gardenPlugin: () => GardenPlugin;
//# sourceMappingURL=google-app-engine.d.ts.map