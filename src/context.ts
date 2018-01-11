import { loadModuleConfig, ModuleConfig } from "./types/module-config"
import { loadProjectConfig, ProjectConfig } from "./types/project-config"
import { LoggerInstance } from "winston"
import { getIgnorer, getLogger, scanDirectory } from "./util"
import { parse, relative } from "path"
import { MODULE_CONFIG_FILENAME } from "./constants"
import { ConfigurationError } from "./exceptions"
import { VcsHandler } from "./vcs/base"
import { GitHandler } from "./vcs/git"

interface ModuleMap { [ key: string]: ModuleConfig }

export class GardenContext {
  public log: LoggerInstance

  private config: ProjectConfig
  private modules: ModuleMap

  vcs: VcsHandler

  constructor(public projectRoot: string, logger?: LoggerInstance) {
    this.log = logger || getLogger()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this)

  }

  async getConfig(): Promise<ProjectConfig> {
    if (!this.config) {
      this.config = await loadProjectConfig(this.projectRoot)
    }
    return this.config
  }

  async getModules(): Promise<ModuleMap> {
    if (!this.modules) {
      const modules: ModuleMap = {}
      const ignorer = getIgnorer(this.projectRoot)
      const scanOpts = {
        filter: (path) => {
          const relPath = relative(this.projectRoot, path)
          return !ignorer.ignores(relPath)
        },
      }

      for await (const item of scanDirectory(this.projectRoot, scanOpts)) {
        const parsedPath = parse(item.path)
        if (parsedPath.base === MODULE_CONFIG_FILENAME) {
          const config = await loadModuleConfig(parsedPath.dir)

          if (modules[config.name]) {
            const pathA = modules[config.name].path
            const pathB = relative(this.projectRoot, item.path)

            throw new ConfigurationError(
              `Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`,
              {
                pathA,
                pathB,
              },
            )
          }

          modules[config.name] = config
        }
      }

      this.modules = modules
    }
    return this.modules
  }
}
