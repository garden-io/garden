import { Module } from "../../types/module";
import { PrepareEnvironmentParams } from "../../types/plugin/params";
import { Service } from "../../types/service";
import { GenericTestSpec } from "../generic";
import { GCloud } from "./gcloud";
import { ModuleSpec } from "../../config/module";
import { BaseServiceSpec } from "../../config/service";
import { Provider } from "../../config/project";
export declare const GOOGLE_CLOUD_DEFAULT_REGION = "us-central1";
export interface GoogleCloudServiceSpec extends BaseServiceSpec {
    project?: string;
}
export interface GoogleCloudModule<M extends ModuleSpec = ModuleSpec, S extends GoogleCloudServiceSpec = GoogleCloudServiceSpec, T extends GenericTestSpec = GenericTestSpec> extends Module<M, S, T> {
}
export declare function getEnvironmentStatus(): Promise<{
    ready: boolean;
    detail: {
        sdkInstalled: boolean;
        sdkInitialized: boolean;
        betaComponentsInstalled: boolean;
        sdkInfo: {};
    };
}>;
export declare function prepareEnvironment({ status, logEntry }: PrepareEnvironmentParams): Promise<{}>;
export declare function gcloud(project?: string, account?: string): GCloud;
export declare function getProject<T extends GoogleCloudModule>(service: Service<T>, provider: Provider): any;
//# sourceMappingURL=common.d.ts.map