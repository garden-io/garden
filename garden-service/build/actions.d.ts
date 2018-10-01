import { Garden } from "./garden";
import { PrimitiveMap } from "./config/common";
import { Module } from "./types/module";
import { BuildResult, BuildStatus, DeleteSecretResult, EnvironmentStatusMap, ExecInServiceResult, GetSecretResult, GetServiceLogsResult, PushResult, RunResult, SetSecretResult, TestResult, PublishResult } from "./types/plugin/outputs";
import { BuildModuleParams, DeleteSecretParams, DeployServiceParams, DeleteServiceParams, ExecInServiceParams, GetSecretParams, GetBuildStatusParams, GetServiceLogsParams, GetServiceOutputsParams, GetServiceStatusParams, GetTestResultParams, ModuleActionParams, PluginActionContextParams, PluginActionParams, PluginActionParamsBase, PluginServiceActionParamsBase, PushModuleParams, RunModuleParams, RunServiceParams, SetSecretParams, TestModuleParams, GetEnvironmentStatusParams, PluginModuleActionParamsBase, PublishModuleParams } from "./types/plugin/params";
import { ServiceStatus } from "./types/service";
import { Omit } from "./util/util";
import { RuntimeContext } from "./types/service";
import { ProcessResults } from "./process";
import { LogEntry } from "./logger/log-entry";
import { CleanupEnvironmentParams } from "./types/plugin/params";
declare type TypeGuard = {
    readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>;
};
export interface ContextStatus {
    providers: EnvironmentStatusMap;
    services: {
        [name: string]: ServiceStatus;
    };
}
export interface DeployServicesParams {
    serviceNames?: string[];
    force?: boolean;
    forceBuild?: boolean;
}
declare type ActionHelperParams<T extends PluginActionParamsBase> = Omit<T, keyof PluginActionContextParams> & {
    pluginName?: string;
};
declare type ModuleActionHelperParams<T extends PluginModuleActionParamsBase> = Omit<T, keyof PluginActionContextParams> & {
    pluginName?: string;
};
declare type ServiceActionHelperParams<T extends PluginServiceActionParamsBase> = Omit<T, "module" | "runtimeContext" | keyof PluginActionContextParams> & {
    runtimeContext?: RuntimeContext;
    pluginName?: string;
};
declare type RequirePluginName<T> = T & {
    pluginName: string;
};
export declare class ActionHelper implements TypeGuard {
    private garden;
    constructor(garden: Garden);
    getEnvironmentStatus({ pluginName }: ActionHelperParams<GetEnvironmentStatusParams>): Promise<EnvironmentStatusMap>;
    /**
     * Checks environment status and calls prepareEnvironment for each provider that isn't flagged as ready.
     *
     * If any of the getEnvironmentStatus handlers returns needUserInput=true, this throws and guides the user to
     * run `garden init`
     */
    prepareEnvironment({ force, pluginName, logEntry, allowUserInput }: {
        force?: boolean;
        pluginName?: string;
        logEntry?: LogEntry;
        allowUserInput?: boolean;
    }): Promise<{}>;
    cleanupEnvironment({ pluginName }: ActionHelperParams<CleanupEnvironmentParams>): Promise<EnvironmentStatusMap>;
    getSecret(params: RequirePluginName<ActionHelperParams<GetSecretParams>>): Promise<GetSecretResult>;
    setSecret(params: RequirePluginName<ActionHelperParams<SetSecretParams>>): Promise<SetSecretResult>;
    deleteSecret(params: RequirePluginName<ActionHelperParams<DeleteSecretParams>>): Promise<DeleteSecretResult>;
    getBuildStatus<T extends Module>(params: ModuleActionHelperParams<GetBuildStatusParams<T>>): Promise<BuildStatus>;
    build<T extends Module>(params: ModuleActionHelperParams<BuildModuleParams<T>>): Promise<BuildResult>;
    pushModule<T extends Module>(params: ModuleActionHelperParams<PushModuleParams<T>>): Promise<PushResult>;
    publishModule<T extends Module>(params: ModuleActionHelperParams<PublishModuleParams<T>>): Promise<PublishResult>;
    runModule<T extends Module>(params: ModuleActionHelperParams<RunModuleParams<T>>): Promise<RunResult>;
    testModule<T extends Module>(params: ModuleActionHelperParams<TestModuleParams<T>>): Promise<TestResult>;
    getTestResult<T extends Module>(params: ModuleActionHelperParams<GetTestResultParams<T>>): Promise<TestResult | null>;
    getServiceStatus(params: ServiceActionHelperParams<GetServiceStatusParams>): Promise<ServiceStatus>;
    deployService(params: ServiceActionHelperParams<DeployServiceParams>): Promise<ServiceStatus>;
    deleteService(params: ServiceActionHelperParams<DeleteServiceParams>): Promise<ServiceStatus>;
    getServiceOutputs(params: ServiceActionHelperParams<GetServiceOutputsParams>): Promise<PrimitiveMap>;
    execInService(params: ServiceActionHelperParams<ExecInServiceParams>): Promise<ExecInServiceResult>;
    getServiceLogs(params: ServiceActionHelperParams<GetServiceLogsParams>): Promise<GetServiceLogsResult>;
    runService(params: ServiceActionHelperParams<RunServiceParams>): Promise<RunResult>;
    getStatus(): Promise<ContextStatus>;
    deployServices({ serviceNames, force, forceBuild }: DeployServicesParams): Promise<ProcessResults>;
    private commonParams;
    private callActionHandler;
    private callModuleHandler;
    private callServiceHandler;
}
export {};
//# sourceMappingURL=actions.d.ts.map