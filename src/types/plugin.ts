import { Module } from "./module"
import { GardenContext } from "../context"
import { Nullable } from "../util"

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

export interface PluginActions<T extends Module> {
  parseModule: (context: GardenContext, config: T["config"]) => T
  getModuleBuildStatus: (module: T) => Promise<BuildStatus>
  buildModule: (module: T, { force: boolean }) => Promise<BuildResult>
}

type PluginActionName = keyof PluginActions<any>

// A little convoluted, but serves the purpose of making sure we don't forget to include actions
// in the `pluginActionNames` array
class _PluginActionKeys implements Nullable<PluginActions<Module>> {
  parseModule = null
  getModuleBuildStatus = null
  buildModule = null
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
