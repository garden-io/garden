import * as td from "testdouble"
import { resolve } from "path"
import { PluginContext } from "../src/plugin-context"
import { ContainerModule } from "../src/plugins/container"
import { TaskResults } from "../src/task-graph"
import {
  DeleteConfigParams,
  GetConfigParams,
  ParseModuleParams,
  GardenPlugin,
  PluginActions,
  PluginFactory,
  SetConfigParams,
  ModuleActions,
  RunModuleParams,
  RunServiceParams,
} from "../src/types/plugin"
import { Garden } from "../src/garden"
import {
  Module,
  ModuleConfig,
} from "../src/types/module"
import { mapValues } from "lodash"
import { TreeVersion } from "../src/vcs/base"

export const dataDir = resolve(__dirname, "data")
export const testNow = new Date()
export const testModuleVersionString = "1234512345"
export const testModuleVersion: TreeVersion = {
  versionString: testModuleVersionString,
  latestCommit: testModuleVersionString,
  dirtyTimestamp: null,
}

export function getDataDir(name: string) {
  return resolve(dataDir, name)
}

export async function profileBlock(description: string, block: () => Promise<any>) {
  const startTime = new Date().getTime()
  const result = await block()
  const executionTime = (new Date().getTime()) - startTime
  console.log(description, "took", executionTime, "ms")
  return result
}

export const projectRootA = getDataDir("test-project-a")

class TestModule extends Module {
  type = "test"

  async getVersion() {
    return testModuleVersion
  }
}

export const testPlugin: PluginFactory = (): GardenPlugin => {
  const _config = {}

  return {
    actions: {
      async configureEnvironment() { },

      async setConfig({ key, value }: SetConfigParams) {
        _config[key.join(".")] = value
      },

      async getConfig({ key }: GetConfigParams) {
        return _config[key.join(".")] || null
      },

      async deleteConfig({ key }: DeleteConfigParams) {
        const k = key.join(".")
        if (_config[k]) {
          delete _config[k]
          return { found: true }
        } else {
          return { found: false }
        }
      },
    },
    moduleActions: {
      generic: {
        async parseModule({ ctx, moduleConfig }: ParseModuleParams) {
          return new Module(ctx, moduleConfig)
        },
        async runModule(params: RunModuleParams) {
          const version = await params.module.getVersion()

          return {
            moduleName: params.module.name,
            command: params.command,
            completedAt: testNow,
            output: "OK",
            version,
            startedAt: testNow,
            success: true,
          }
        },
        async runService({ ctx, service, interactive, runtimeContext, timeout}: RunServiceParams) {
          return ctx.runModule({
            module: service.module,
            command: [service.name],
            interactive,
            runtimeContext,
            timeout,
          })
        },
        async getServiceStatus() { return {} },
        async deployService() { return {} },
      },
    },
  }
}
testPlugin.pluginName = "test-plugin"

export const testPluginB: PluginFactory = (params) => {
  const plugin = testPlugin(params)
  plugin.moduleActions = {
    test: plugin.moduleActions!.generic,
  }
  return plugin
}
testPluginB.pluginName = "test-plugin-b"

export const defaultModuleConfig: ModuleConfig = {
  type: "test",
  name: "test",
  path: "bla",
  allowPush: false,
  variables: {},
  build: { dependencies: [] },
  services: {
    testService: { dependencies: [] },
  },
  test: {},
}

export const makeTestModule = (ctx: PluginContext, params: Partial<ModuleConfig> = {}) => {
  return new TestModule(ctx, { ...defaultModuleConfig, ...params })
}

export const makeTestGarden = async (projectRoot: string, extraPlugins: PluginFactory[] = []) => {
  const testPlugins: PluginFactory[] = [
    testPlugin,
    testPluginB,
  ]
  const plugins: PluginFactory[] = testPlugins.concat(extraPlugins)

  return Garden.factory(projectRoot, { plugins })
}

export const makeTestContext = async (projectRoot: string, extraPlugins: PluginFactory[] = []) => {
  const garden = await makeTestGarden(projectRoot, extraPlugins)
  return garden.pluginContext
}

export const makeTestGardenA = async (extraPlugins: PluginFactory[] = []) => {
  return makeTestGarden(projectRootA, extraPlugins)
}

export const makeTestContextA = async (extraPlugins: PluginFactory[] = []) => {
  const garden = await makeTestGardenA(extraPlugins)
  return garden.pluginContext
}

export function stubAction<T extends keyof PluginActions> (
  garden: Garden, pluginName: string, type: T, handler?: PluginActions[T],
) {
  return td.replace(garden["actionHandlers"][type], pluginName, handler)
}

export function stubModuleAction<T extends keyof ModuleActions<any>> (
  garden: Garden, moduleType: string, pluginName: string, type: T, handler?: ModuleActions<any>[T],
) {
  return td.replace(garden["moduleActionHandlers"][moduleType][type], pluginName, handler)
}

export async function expectError(fn: Function, typeOrCallback: string | ((err: any) => void)) {
  try {
    await fn()
  } catch (err) {
    if (typeof typeOrCallback === "function") {
      return typeOrCallback(err)
    } else {
      if (!err.type) {
        throw new Error(`Expected GardenError with type ${typeOrCallback}, got: ${err}`)
      }
      if (err.type !== typeOrCallback) {
        throw new Error(`Expected ${typeOrCallback} error, got: ${err}`)
      }
    }
    return
  }

  if (typeof typeOrCallback === "string") {
    throw new Error(`Expected ${typeOrCallback} error (got no error)`)
  } else {
    throw new Error(`Expected error (got no error)`)
  }
}

export function taskResultOutputs(results: TaskResults) {
  return mapValues(results, r => r.output)
}
