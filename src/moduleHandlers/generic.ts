import { ModuleHandler } from "./base"
import { ModuleConfig } from "../types/module-config"

interface GenericModuleConfig extends ModuleConfig { }

export class GenericModule extends ModuleHandler<GenericModuleConfig> {
  type = "generic"

  validate(config: GenericModuleConfig) { }
}
