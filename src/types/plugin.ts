import { Module, ModuleConfig } from "./module"
import { GardenContext } from "../context"

export type PluginFactory<T extends ModuleConfig> = (context: GardenContext) => PluginInterface<T>

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
}

export interface BuildStatus {
  ready: boolean
}

export interface PluginActions<T extends ModuleConfig> {
  // Module actions
  parseModule?: (context: GardenContext, config: T) => Module<T>
  getModuleBuildStatus?: (module: Module<T>) => Promise<BuildStatus>
  buildModule?: (module: Module<T>, { force: boolean }) => Promise<BuildResult>
}

// TODO: Use enum or something to avoid the double declaration.
export const moduleActionNames = ["parseModule", "getModuleBuildStatus", "buildModule"]

export interface PluginInterface<T extends ModuleConfig> extends PluginActions<T> {
  name: string

  // Specify which module types are applicable to the module actions
  supportedModuleTypes?: string[]
}

export abstract class Plugin<T extends ModuleConfig> implements PluginInterface<T> {
  abstract name: string

  constructor(protected context: GardenContext) { }
}
