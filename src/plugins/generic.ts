import { exec } from "child-process-promise"
import { BuildResult, BuildStatus, Plugin, TestModuleParams, TestResult } from "../types/plugin"
import { Module, ModuleConfigType } from "../types/module"
import { GardenContext } from "../context"
import { spawn } from "../util"

export class GenericModuleHandler<T extends Module = Module> extends Plugin<T> {
  name = "generic"
  supportedModuleTypes = ["generic"]

  parseModule({ ctx, config }: { ctx: GardenContext, config: ModuleConfigType<T> }) {
    return new Module<ModuleConfigType<T>>(ctx, config)
  }

  async getModuleBuildStatus({ module }: { module: T }): Promise<BuildStatus> {
    // Each module handler should keep track of this for now. Defaults to return false if a build command is specified.
    return { ready: !module.config.build.command }
  }

  async buildModule({ module }: { module: T }): Promise<BuildResult> {
    // By default we run the specified build command in the module root, if any.
    // TODO: Keep track of which version has been built (needs local data store/cache).
    if (module.config.build.command) {
      const result = await exec(module.config.build.command, { cwd: module.path })

      return { fresh: true, buildLog: result.stdout }
    } else {
      return {}
    }
  }

  async testModule({ module, testSpec }: TestModuleParams<T>): Promise<TestResult> {
    const result = await spawn(testSpec.command[0], testSpec.command.slice(1), { cwd: module.path, ignoreError: true })

    return {
      success: result.code === 0,
      output: result.output,
    }
  }
}
