import { exec } from "child-process-promise"
import { BuildResult, BuildStatus, Plugin } from "../types/plugin"
import { Module, ModuleConfig } from "../types/module"
import { GardenContext } from "../context"

export class GenericModuleHandler<T extends Module = Module> extends Plugin<T> {
  name = "generic"
  supportedModuleTypes = ["generic"]

  parseModule(context: GardenContext, config: ModuleConfig) {
    return new Module(context, config)
  }

  async getModuleBuildStatus(module: Module): Promise<BuildStatus> {
    // Each module handler should keep track of this for now. Defaults to return false if a build command is specified.
    return { ready: !module.config.build.command }
  }

  async buildModule(module: Module): Promise<BuildResult> {
    // By default we run the specified build command in the module root, if any.
    // TODO: Keep track of which version has been built (needs local data store/cache).
    if (module.config.build.command) {
      const result = await exec(module.config.build.command, { cwd: this.context.projectRoot })

      return { fresh: true, buildLog: result.stdout }
    } else {
      return {}
    }
  }
}
