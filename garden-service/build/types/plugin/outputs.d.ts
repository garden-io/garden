import * as Joi from "joi";
import { ModuleVersion } from "../../vcs/base";
import { PrimitiveMap } from "../../config/common";
import { Module } from "../module";
import { ServiceStatus } from "../service";
import { ModuleConfig } from "../../config/module";
export interface EnvironmentStatus {
    ready: boolean;
    needUserInput?: boolean;
    detail?: any;
}
export declare const environmentStatusSchema: Joi.ObjectSchema;
export declare type EnvironmentStatusMap = {
    [key: string]: EnvironmentStatus;
};
export interface PrepareEnvironmentResult {
}
export declare const prepareEnvironmentResultSchema: Joi.ObjectSchema;
export interface CleanupEnvironmentResult {
}
export declare const cleanupEnvironmentResultSchema: Joi.ObjectSchema;
export interface GetSecretResult {
    value: string | null;
}
export declare const getSecretResultSchema: Joi.ObjectSchema;
export interface SetSecretResult {
}
export declare const setSecretResultSchema: Joi.ObjectSchema;
export interface DeleteSecretResult {
    found: boolean;
}
export declare const deleteSecretResultSchema: Joi.ObjectSchema;
export interface ExecInServiceResult {
    code: number;
    output: string;
    stdout?: string;
    stderr?: string;
}
export declare const execInServiceResultSchema: Joi.ObjectSchema;
export interface ServiceLogEntry {
    serviceName: string;
    timestamp: Date;
    msg: string;
}
export declare const serviceLogEntrySchema: Joi.ObjectSchema;
export interface GetServiceLogsResult {
}
export declare const getServiceLogsResultSchema: Joi.ObjectSchema;
export interface ModuleTypeDescription {
    docs: string;
    schema: object;
}
export declare const moduleTypeDescriptionSchema: Joi.ObjectSchema;
export declare type ValidateModuleResult<T extends Module = Module> = ModuleConfig<T["spec"], T["serviceConfigs"][0]["spec"], T["testConfigs"][0]["spec"]>;
export declare const validateModuleResultSchema: Joi.ObjectSchema;
export interface BuildResult {
    buildLog?: string;
    fetched?: boolean;
    fresh?: boolean;
    version?: string;
    details?: any;
}
export declare const buildModuleResultSchema: Joi.ObjectSchema;
export interface PushResult {
    pushed: boolean;
    message?: string;
}
export declare const pushModuleResultSchema: Joi.ObjectSchema;
export interface PublishResult {
    published: boolean;
    message?: string;
}
export declare const publishModuleResultSchema: Joi.ObjectSchema;
export interface RunResult {
    moduleName: string;
    command: string[];
    version: ModuleVersion;
    success: boolean;
    startedAt: Date;
    completedAt: Date;
    output: string;
}
export declare const runResultSchema: Joi.ObjectSchema;
export interface TestResult extends RunResult {
    testName: string;
}
export declare const testResultSchema: Joi.ObjectSchema;
export declare const getTestResultSchema: Joi.ObjectSchema;
export interface BuildStatus {
    ready: boolean;
}
export declare const buildStatusSchema: Joi.ObjectSchema;
export interface PluginActionOutputs {
    getEnvironmentStatus: Promise<EnvironmentStatus>;
    prepareEnvironment: Promise<PrepareEnvironmentResult>;
    cleanupEnvironment: Promise<CleanupEnvironmentResult>;
    getSecret: Promise<GetSecretResult>;
    setSecret: Promise<SetSecretResult>;
    deleteSecret: Promise<DeleteSecretResult>;
}
export interface ServiceActionOutputs {
    getServiceStatus: Promise<ServiceStatus>;
    deployService: Promise<ServiceStatus>;
    deleteService: Promise<ServiceStatus>;
    getServiceOutputs: Promise<PrimitiveMap>;
    execInService: Promise<ExecInServiceResult>;
    getServiceLogs: Promise<{}>;
    runService: Promise<RunResult>;
}
export interface ModuleActionOutputs extends ServiceActionOutputs {
    describeType: Promise<ModuleTypeDescription>;
    validate: Promise<ValidateModuleResult>;
    getBuildStatus: Promise<BuildStatus>;
    build: Promise<BuildResult>;
    pushModule: Promise<PushResult>;
    publishModule: Promise<PublishResult>;
    runModule: Promise<RunResult>;
    testModule: Promise<TestResult>;
    getTestResult: Promise<TestResult | null>;
}
//# sourceMappingURL=outputs.d.ts.map