import { GenericModuleHandler } from "./generic"

export class NpmPackageModuleHandler extends GenericModuleHandler {
  name = "npm-package-module"
  supportedModuleTypes = ["npm-package"]

  // TODO: check package.json
  // parseModule(module: Module) {
  // }
}
