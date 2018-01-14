import Bluebird = require("bluebird")
import { exec } from "child-process-promise"
import { ModuleConfig } from "../types/module-config"
import { GardenContext } from "../context"
import { BuildTask } from "../tasks/build"

export interface ModuleConstructor {
  new(context: GardenContext, path: string, config: ModuleConfig): ModuleHandler
}

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
}

export abstract class ModuleHandler<T extends ModuleConfig = ModuleConfig> {
  abstract type: string
  name: string
  config: T
  buildDependencies: ModuleHandler[] = []

  constructor(protected context: GardenContext, public path: string, config: T) {
    this.config = this.validate(config) || config
    this.name = this.config.name
  }

  abstract validate(config: T): T | void

  async getVersion() {
    const treeVersion = await this.context.vcs.getTreeVersion([this.path])

    const versionChain = await Bluebird.map(
      this.buildDependencies,
      async (d: ModuleHandler) => await d.getVersion(),
    )
    versionChain.push(treeVersion)

    // The module version is the latest of any of the dependency modules or itself.
    const sortedVersions = await this.context.vcs.sortVersions(versionChain)

    return sortedVersions[0]
  }

  async isBuilt(): Promise<boolean> {
    // Each module handler should keep track of this for now. Defaults to return false if a build command is specified.
    return !this.config.build.command
  }

  async build({ force = false }): Promise<BuildResult> {
    // By default we run the specified build command in the module root, if any.
    // TODO: Keep track of which version has been built (needs local data store/cache).
    force

    if (this.config.build.command) {
      const result = await exec(this.config.build.command, { cwd: this.context.projectRoot })

      return { fresh: true, buildLog: result.stdout }
    } else {
      return {}
    }
  }

  getBuildTask(force: boolean = false) {
    return new BuildTask(this, force)
  }
}
