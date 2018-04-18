import * as td from "testdouble"
import { resolve } from "path"
import {
  DeleteConfigParams,
  GetConfigParams,
  ParseModuleParams,
  GardenPlugin,
  PluginActions,
  PluginFactory,
  SetConfigParams,
  ModuleActions,
} from "../src/types/plugin"
import { Garden } from "../src/garden"
import { Module } from "../src/types/module"
import { expect } from "chai"

export const dataDir = resolve(__dirname, "data")

export function getDataDir(name: string) {
  return resolve(dataDir, name)
}

export const projectRootA = getDataDir("test-project-a")

class TestModule extends Module {
  type = "test"
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

export const makeTestModule = (ctx, name = "test") => {
  return new TestModule(ctx, {
    type: "test",
    name,
    path: "bla",
    allowPush: false,
    variables: {},
    build: { dependencies: [] },
    services: {
      testService: { dependencies: [] },
    },
    test: {},
  })
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
