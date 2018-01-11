import { ModuleConfig } from "../types/module-config"
import { GardenContext } from "../context"

export interface ModuleConstructor {
  new(context: GardenContext, path: string, config: ModuleConfig): ModuleHandler
}

export abstract class ModuleHandler<T extends ModuleConfig = ModuleConfig> {
  abstract type: string
  name: string
  config: T

  constructor(protected context: GardenContext, public path: string, config: T) {
    this.config = this.validate(config) || config
    this.name = this.config.name
  }

  abstract validate(config: T): T | void
}
