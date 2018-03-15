import * as td from "testdouble"
import { resolve } from "path"
import { ParseModuleParams, Plugin, PluginActions, PluginFactory } from "../src/types/plugin"
import { GardenContext } from "../src/context"
import { Module } from "../src/types/module"
import { ContainerModule } from "../src/plugins/container"

export const dataDir = resolve(__dirname, "data")

export function getDataDir(name: string) {
  return resolve(dataDir, name)
}

export const projectRootA = getDataDir("test-project-a")

class TestModule extends Module {
  type = "test"
}

export const testPluginA: Plugin<Module> = {
  name: "test-plugin",
  supportedModuleTypes: ["generic"],

  configureEnvironment: async () => { },
  getServiceStatus: async () => ({}),
  deployService: async () => ({}),
}

class TestPluginB implements Plugin<Module> {
  name = "test-plugin-b"
  supportedModuleTypes = ["test"]

  async parseModule({ ctx, config }: ParseModuleParams) {
    return new Module(ctx, config)
  }
  async configureEnvironment() { }
  async getServiceStatus() { return {} }
  async deployService() { return {} }
}

export const makeTestModule = (ctx, name = "test") => {
  return new TestModule(ctx, {
    version: "0",
    type: "test",
    name,
    path: "bla",
    variables: {},
    build: { dependencies: [] },
    services: {
      testService: { dependencies: [] },
    },
    test: {},
  })
}

export const makeTestContext = async (projectRoot: string, extraPlugins: PluginFactory[] = []) => {
  const testPlugins = [
    (_ctx) => testPluginA,
    (_ctx) => new TestPluginB(),
  ]
  const plugins: PluginFactory[] = testPlugins.concat(extraPlugins)

  return await GardenContext.factory(projectRoot, { plugins })
}

export const makeTestContextA = async (extraPlugins: PluginFactory[] = []) => {
  return makeTestContext(projectRootA, extraPlugins)
}

export function stubPluginAction<T extends keyof PluginActions<any>> (
  ctx: GardenContext, pluginName: string, type: T, handler?: PluginActions<any>[T],
) {
  return td.replace(ctx["actionHandlers"][type], pluginName, handler)
}
