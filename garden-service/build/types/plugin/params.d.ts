import Stream from "ts-stream";
import { LogEntry } from "../../logger/log-entry";
import { PluginContext } from "../../plugin-context";
import { ModuleVersion } from "../../vcs/base";
import { Primitive } from "../../config/common";
import { Module } from "../module";
import { RuntimeContext, Service } from "../service";
import { EnvironmentStatus, ServiceLogEntry } from "./outputs";
import * as Joi from "joi";
export interface PluginActionContextParams {
    ctx: PluginContext;
}
export interface PluginActionParamsBase extends PluginActionContextParams {
    logEntry?: LogEntry;
}
export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
    module: T;
}
export interface PluginServiceActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
    runtimeContext?: RuntimeContext;
    service: Service<T>;
}
/**
 * Plugin actions
 */
export interface DescribeModuleTypeParams {
}
export declare const describeModuleTypeParamsSchema: Joi.ObjectSchema;
export interface ValidateModuleParams<T extends Module = Module> {
    ctx: PluginContext;
    logEntry?: LogEntry;
    moduleConfig: T["_ConfigType"];
}
export declare const validateModuleParamsSchema: Joi.ObjectSchema;
export interface GetEnvironmentStatusParams extends PluginActionParamsBase {
}
export declare const getEnvironmentStatusParamsSchema: Joi.ObjectSchema;
export interface PrepareEnvironmentParams extends PluginActionParamsBase {
    status: EnvironmentStatus;
    force: boolean;
}
export declare const prepareEnvironmentParamsSchema: Joi.ObjectSchema;
export interface CleanupEnvironmentParams extends PluginActionParamsBase {
}
export declare const cleanupEnvironmentParamsSchema: Joi.ObjectSchema;
export interface GetSecretParams extends PluginActionParamsBase {
    key: string;
}
export declare const getSecretParamsSchema: Joi.ObjectSchema;
export interface SetSecretParams extends PluginActionParamsBase {
    key: string;
    value: Primitive;
}
export declare const setSecretParamsSchema: Joi.ObjectSchema;
export interface DeleteSecretParams extends PluginActionParamsBase {
    key: string;
}
export declare const deleteSecretParamsSchema: Joi.ObjectSchema;
export interface PluginActionParams {
    getEnvironmentStatus: GetEnvironmentStatusParams;
    prepareEnvironment: PrepareEnvironmentParams;
    cleanupEnvironment: CleanupEnvironmentParams;
    getSecret: GetSecretParams;
    setSecret: SetSecretParams;
    deleteSecret: DeleteSecretParams;
}
/**
 * Module actions
 */
export interface GetBuildStatusParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}
export declare const getBuildStatusParamsSchema: Joi.ObjectSchema;
export interface BuildModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}
export declare const buildModuleParamsSchema: Joi.ObjectSchema;
export interface PushModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}
export declare const pushModuleParamsSchema: Joi.ObjectSchema;
export interface PublishModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}
export declare const publishModuleParamsSchema: Joi.ObjectSchema;
export interface RunModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
    command: string[];
    interactive: boolean;
    runtimeContext: RuntimeContext;
    silent: boolean;
    timeout?: number;
}
export declare const runModuleParamsSchema: Joi.ObjectSchema;
export interface TestModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
    interactive: boolean;
    runtimeContext: RuntimeContext;
    silent: boolean;
    testConfig: T["testConfigs"][0];
}
export declare const testModuleParamsSchema: Joi.ObjectSchema;
export interface GetTestResultParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
    testName: string;
    version: ModuleVersion;
}
export declare const getTestResultParamsSchema: Joi.ObjectSchema;
/**
 * Service actions
 */
export interface GetServiceStatusParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    runtimeContext: RuntimeContext;
}
export declare const getServiceStatusParamsSchema: Joi.ObjectSchema;
export interface DeployServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    force: boolean;
    runtimeContext: RuntimeContext;
}
export declare const deployServiceParamsSchema: Joi.ObjectSchema;
export interface DeleteServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    runtimeContext: RuntimeContext;
}
export declare const deleteServiceParamsSchema: Joi.ObjectSchema;
export interface GetServiceOutputsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
}
export declare const getServiceOutputsParamsSchema: Joi.ObjectSchema;
export interface ExecInServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    command: string[];
    runtimeContext: RuntimeContext;
}
export declare const execInServiceParamsSchema: Joi.ObjectSchema;
export interface GetServiceLogsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    runtimeContext: RuntimeContext;
    stream: Stream<ServiceLogEntry>;
    tail: boolean;
    startTime?: Date;
}
export declare const getServiceLogsParamsSchema: Joi.ObjectSchema;
export interface RunServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
    interactive: boolean;
    runtimeContext: RuntimeContext;
    silent: boolean;
    timeout?: number;
}
export declare const runServiceParamsSchema: Joi.ObjectSchema;
export interface ServiceActionParams<T extends Module = Module> {
    getServiceStatus: GetServiceStatusParams<T>;
    deployService: DeployServiceParams<T>;
    deleteService: DeleteServiceParams<T>;
    getServiceOutputs: GetServiceOutputsParams<T>;
    execInService: ExecInServiceParams<T>;
    getServiceLogs: GetServiceLogsParams<T>;
    runService: RunServiceParams<T>;
}
export interface ModuleActionParams<T extends Module = Module> {
    describeType: DescribeModuleTypeParams;
    validate: ValidateModuleParams<T>;
    getBuildStatus: GetBuildStatusParams<T>;
    build: BuildModuleParams<T>;
    pushModule: PushModuleParams<T>;
    publishModule: PublishModuleParams<T>;
    runModule: RunModuleParams<T>;
    testModule: TestModuleParams<T>;
    getTestResult: GetTestResultParams<T>;
}
//# sourceMappingURL=params.d.ts.map