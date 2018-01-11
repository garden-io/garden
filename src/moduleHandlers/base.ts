import { ModuleConfig } from "../types/module-config"
import { GardenContext } from "../context"

export abstract class ModuleHandler<T extends ModuleConfig> {
  abstract type: string
  config: T

  constructor(private context: GardenContext, private path: string, config: T) {
    this.config = this.validate(config) || config
  }

  abstract validate(config: T): T | void
}
