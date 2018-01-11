import { ModuleHandler } from "./base"
import { ModuleConfig } from "../types/module-config"

interface NpmPackageModuleConfig extends ModuleConfig { }

export class NpmPackageModule extends ModuleHandler<NpmPackageModuleConfig> {
  type = "npm-package"

  validate(config: NpmPackageModuleConfig) {
    // TODO: check package.json
  }
}
