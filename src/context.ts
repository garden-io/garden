import { parse, relative } from "path"
import * as Joi from "joi"
import { loadModuleConfig, Module, ModuleConfig } from "./types/module"
import { loadProjectConfig, ProjectConfig } from "./types/project-config"
import { getIgnorer, scanDirectory } from "./util"
import { MODULE_CONFIG_FILENAME } from "./constants"
import { ConfigurationError, PluginError } from "./exceptions"
import { VcsHandler } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { NpmPackageModuleHandler } from "./moduleHandlers/npm-package"
import { Task, TaskGraph } from "./task-graph"
import { getLogger, Logger } from "./log"
import {
  moduleActionNames, PluginActions, PluginFactory, PluginInterface,
} from "./types/plugin"
import { JoiIdentifier } from "./types/common"
import { GenericModuleHandler } from "./moduleHandlers/generic"
import { GenericFunctionModuleHandler } from "./moduleHandlers/function"
import { ContainerModuleHandler } from "./moduleHandlers/container"

interface ModuleMap { [key: string]: Module }

// TODO: We can maybe avoid the any types here with a little bit of TS gymnastics.
type PluginActionMap = {
  [A in keyof PluginActions<any>]: {
    [key: string]: PluginActions<any>[A],
  }
}

export class GardenContext {
  public log: Logger
  public actionHandlers: PluginActionMap

  private _config: ProjectConfig
  private plugins: { [key: string]: PluginInterface<any> }
  private modules: ModuleMap
  private taskGraph: TaskGraph

  vcs: VcsHandler

  constructor(public projectRoot: string, logger?: Logger) {
    this.log = logger || getLogger()
    this._config = loadProjectConfig(this.projectRoot)
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this)
    this.taskGraph = new TaskGraph(this)

    this.plugins = {}
    this.actionHandlers = {
      parseModule: {},
      getModuleBuildStatus: {},
      buildModule: {},
    }

    // Load built-in module handlers
    this.registerPlugin((ctx) => new GenericModuleHandler(ctx))
    this.registerPlugin((ctx) => new ContainerModuleHandler(ctx))
    this.registerPlugin((ctx) => new GenericFunctionModuleHandler(ctx))
    this.registerPlugin((ctx) => new NpmPackageModuleHandler(ctx))
  }

  async addTask(task: Task) {
    await this.taskGraph.addTask(task)
  }

  async processTasks() {
    return this.taskGraph.processTasks()
  }

  registerPlugin<T extends ModuleConfig>(pluginFactory: PluginFactory<T>) {
    const plugin = pluginFactory(this)
    const pluginName = Joi.attempt(plugin.name, JoiIdentifier())

    if (this.plugins[pluginName]) {
      throw new PluginError(`Plugin ${pluginName} declared more than once`, {
        previous: this.plugins[pluginName],
        adding: plugin,
      })
    }

    this.plugins[pluginName] = plugin

    // TODO: Figure out how to make this more type-safe
    for (const action of moduleActionNames) {
      if (plugin[action]) {
        const moduleTypes = plugin.supportedModuleTypes

        if (!moduleTypes || !moduleTypes.length) {
          throw new PluginError(
            `Plugin ${pluginName} specifies module action ${action} but no supported module types`,
            { action, moduleTypes },
          )
        }

        for (const moduleType of moduleTypes) {
          this.actionHandlers[action][moduleType] = (...args) => {
            return plugin[action].apply(plugin, args)
          }
        }
      }
    }

    // TODO: further validate plugin schema at runtime
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
          const modulePath = parsedPath.dir
          const config = await loadModuleConfig(modulePath)

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

          const parseHandler = this.actionHandlers.parseModule[config.type]

          if (!parseHandler) {
            throw new ConfigurationError(`Unrecognized module type ${config.type}`, {
              type: config.type,
              availableTypes: Object.keys(this.actionHandlers.parseModule),
            })
          }

          modules[config.name] = parseHandler(this, config)
        }
      }

      this.modules = modules
    }

    return this.modules
  }
}
