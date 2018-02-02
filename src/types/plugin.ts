import { Module } from "./module"
import { GardenContext } from "../context"
import { Environment, PrimitiveMap } from "./common"
import { Nullable } from "../util"
import { Service, ServiceContext, ServiceStatus } from "./service"

export type PluginFactory = (context: GardenContext) => PluginInterface<any>

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
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

// TODO: Make all actions accept an object with parameters, instead of positional arguments.
// (This will make it easier to add parameters in the long run, without breaking existing signatures)
export interface PluginActions<T extends Module> {
  parseModule: (context: GardenContext, config: T["config"]) => T
  getModuleBuildStatus: (module: T) => Promise<BuildStatus>
  buildModule: (module: T) => Promise<BuildResult>

  getEnvironmentStatus: (env: Environment) => Promise<EnvironmentStatus>
  configureEnvironment: (env: Environment) => Promise<void>

  getServiceStatus:
  (service: Service<T>, env: Environment) => Promise<ServiceStatus>
  deployService:
  (service: Service<T>, serviceContext: ServiceContext, env: Environment) => Promise<any>
  getServiceOutputs:
  (service: Service<T>, env: Environment) => Promise<PrimitiveMap>
  execInService:
  (service: Service<T>, command: string[], env: Environment) => Promise<ExecInServiceResult>
}

type PluginActionName = keyof PluginActions<any>

// A little convoluted, but serves the purpose of making sure we don't forget to include actions
// in the `pluginActionNames` array
class _PluginActionKeys implements Nullable<PluginActions<Module>> {
  parseModule = null
  getModuleBuildStatus = null
  buildModule = null
  getEnvironmentStatus = null
  configureEnvironment = null
  getServiceStatus = null
  deployService = null
  getServiceOutputs = null
  execInService = null
}

export const pluginActionNames: PluginActionName[] =
  <PluginActionName[]>Object.keys(new _PluginActionKeys())

export interface PluginInterface<T extends Module> extends Partial<PluginActions<T>> {
  name: string

  // Specify which module types are applicable to the module actions
  supportedModuleTypes: string[]
}

export abstract class Plugin<T extends Module = Module> implements PluginInterface<T> {
  abstract name: string
  abstract supportedModuleTypes: string[]

  constructor(protected context: GardenContext) { }
}
