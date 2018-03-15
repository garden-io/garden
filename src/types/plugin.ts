import { Module, TestSpec } from "./module"
import { GardenContext } from "../context"
import { Environment, PrimitiveMap } from "./common"
import { Nullable } from "../util"
import { Service, ServiceContext, ServiceStatus } from "./service"
import { LogEntry } from "../logger"
import { Stream } from "ts-stream"
import { Moment } from "moment"

export interface PluginActionParamsBase {
  ctx: GardenContext
  logEntry?: LogEntry
}

export interface ParseModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  config: T["_ConfigType"]
}

export interface GetModuleBuildStatusParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface BuildModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface TestModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
  testSpec: TestSpec,
  env: Environment,
}

export interface GetEnvironmentStatusParams extends PluginActionParamsBase {
  env: Environment,
}

export interface ConfigureEnvironmentParams extends PluginActionParamsBase {
  env: Environment,
}

export interface GetServiceStatusParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
}

export interface DeployServiceParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  serviceContext: ServiceContext,
  env: Environment,
  exposePorts?: boolean,
}

export interface GetServiceOutputsParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
}

export interface ExecInServiceParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
  command: string[],
}

export interface GetServiceLogsParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
  stream: Stream<ServiceLogEntry>,
  tail?: boolean,
  startTime?: Date,
}

export interface PluginActionParams<T extends Module = Module> {
  parseModule: ParseModuleParams<T>
  getModuleBuildStatus: GetModuleBuildStatusParams<T>
  buildModule: BuildModuleParams<T>
  testModule: TestModuleParams<T>

  getEnvironmentStatus: GetEnvironmentStatusParams
  configureEnvironment: ConfigureEnvironmentParams

  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  getServiceOutputs: GetServiceOutputsParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>
}

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
}

export interface TestResult {
  success: boolean
  output: string
}

export interface BuildStatus {
  ready: boolean
}

interface EnvironmentStatus {
  configured: boolean
  detail?: any
}

interface ExecInServiceResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export interface ServiceLogEntry {
  serviceName: string
  timestamp: Moment | Date
  msg: string
}

interface PluginActionOutputs<T extends Module = Module> {
  parseModule: Promise<T>
  getModuleBuildStatus: Promise<BuildStatus>
  buildModule: Promise<BuildResult>
  testModule: Promise<TestResult>

  getEnvironmentStatus: Promise<EnvironmentStatus>
  configureEnvironment: Promise<void>

  getServiceStatus: Promise<ServiceStatus>
  deployService: Promise<any>   // TODO: specify
  getServiceOutputs: Promise<PrimitiveMap>
  execInService: Promise<ExecInServiceResult>
  getServiceLogs: Promise<void>
}

export type PluginActions<T extends Module> = {
  [P in keyof PluginActionParams<T>]: (params: PluginActionParams<T>[P]) => PluginActionOutputs<T>[P]
}

export type PluginActionName = keyof PluginActions<any>

// A little convoluted, but serves the purpose of making sure we don't forget to include actions
// in the `pluginActionNames` array
class _PluginActionKeys implements Nullable<PluginActions<Module>> {
  parseModule = null
  getModuleBuildStatus = null
  buildModule = null
  testModule = null
  getEnvironmentStatus = null
  configureEnvironment = null
  getServiceStatus = null
  deployService = null
  getServiceOutputs = null
  execInService = null
  getServiceLogs = null
}

export const pluginActionNames: PluginActionName[] =
  <PluginActionName[]>Object.keys(new _PluginActionKeys())

export interface Plugin<T extends Module> extends Partial<PluginActions<T>> {
  name: string

  // Specify which module types are applicable to the module actions
  supportedModuleTypes: string[]
}

export type PluginFactory = (ctx: GardenContext) => Plugin<any>
