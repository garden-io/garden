import * as td from "testdouble"
import { resolve } from "path"
import { PluginContext } from "../src/plugin-context"
import {
  ContainerModule,
  containerModuleSpecSchema,
  ContainerServiceConfig,
} from "../src/plugins/container"
import {
  testGenericModule,
} from "../src/plugins/generic"
import { TaskResults } from "../src/task-graph"
import {
  validate,
} from "../src/types/common"
import {
  GardenPlugin,
  PluginActions,
  PluginFactory,
  ModuleActions,
} from "../src/types/plugin/plugin"
import { Garden } from "../src/garden"
import {
  ModuleConfig,
} from "../src/types/module"
import { mapValues } from "lodash"
import {
  DeleteConfigParams,
  GetConfigParams,
  ParseModuleParams,
  RunModuleParams,
  RunServiceParams,
  SetConfigParams,
} from "../src/types/plugin/params"
import {
  ModuleVersion,
} from "../src/vcs/base"

export const dataDir = resolve(__dirname, "data")
export const testNow = new Date()
export const testModuleVersionString = "1234512345"
export const testModuleVersion: ModuleVersion = {
  versionString: testModuleVersionString,
  dirtyTimestamp: null,
  dependencyVersions: {},
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

class TestModule extends ContainerModule {
  type = "test"

  async getVersion() {
    return testModuleVersion
  }
}

export const testPlugin: PluginFactory = (): GardenPlugin => {
  const _config = {}

  return {
    actions: {
      async configureEnvironment() {
        return {}
      },

      async setConfig({ key, value }: SetConfigParams) {
        _config[key.join(".")] = value
        return {}
      },

      async getConfig({ key }: GetConfigParams) {
        return { value: _config[key.join(".")] || null }
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
      test: {
        testModule: testGenericModule,

        async parseModule({ moduleConfig }: ParseModuleParams<TestModule>) {
          moduleConfig.spec = validate(
            moduleConfig.spec,
            containerModuleSpecSchema,
            { context: `test module ${moduleConfig.name}` },
          )

          // validate services
          const services: ContainerServiceConfig[] = moduleConfig.spec.services.map(spec => ({
            name: spec.name,
            dependencies: spec.dependencies,
            outputs: spec.outputs,
            spec,
          }))

          const tests = moduleConfig.spec.tests.map(t => ({
            name: t.name,
            dependencies: t.dependencies,
            spec: t,
            timeout: t.timeout,
            variables: t.variables,
          }))

          return {
            module: moduleConfig,
            services,
            tests,
          }
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

        async runService({ ctx, service, interactive, runtimeContext, silent, timeout }: RunServiceParams) {
          return ctx.runModule({
            moduleName: service.module.name,
            command: [service.name],
            interactive,
            runtimeContext,
            silent,
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

export const testPluginB: PluginFactory = async (params) => {
  const plugin = await testPlugin(params)
  plugin.moduleActions = {
    test: plugin.moduleActions!.test,
  }
  return plugin
}
testPluginB.pluginName = "test-plugin-b"

export const testPluginC: PluginFactory = async (params) => {
  const plugin = await testPlugin(params)
  plugin.moduleActions = {
    "test-c": plugin.moduleActions!.test,
  }
  return plugin
}
testPluginC.pluginName = "test-plugin-c"

export const defaultModuleConfig: ModuleConfig = {
  type: "test",
  name: "test",
  path: "bla",
  allowPush: false,
  variables: {},
  build: { dependencies: [] },
  spec: {
    services: [
      {
        name: "testService",
        dependencies: [],
      },
    ],
  },
}

export const makeTestModule = (ctx: PluginContext, params: Partial<ModuleConfig> = {}) => {
  return new TestModule(
    ctx,
    { ...defaultModuleConfig, ...params },
    defaultModuleConfig.spec.services,
    [],
  )
}

export const makeTestGarden = async (projectRoot: string, extraPlugins: PluginFactory[] = []) => {
  const testPlugins: PluginFactory[] = [
    testPlugin,
    testPluginB,
    testPluginC,
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

export function stubAction<T extends keyof PluginActions>(
  garden: Garden, pluginName: string, type: T, handler?: PluginActions[T],
) {
  return td.replace(garden["actionHandlers"][type], pluginName, handler)
}

export function stubModuleAction<T extends keyof ModuleActions<any>>(
  garden: Garden, moduleType: string, pluginName: string, actionType: T, handler: ModuleActions<any>[T],
) {
  handler["actionType"] = actionType
  handler["pluginName"] = pluginName
  handler["moduleType"] = moduleType
  return td.replace(garden["moduleActionHandlers"][actionType][moduleType], pluginName, handler)
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
