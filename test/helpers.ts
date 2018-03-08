import { ParseModuleParams, Plugin, PluginFactory } from "../src/types/plugin"
import { join } from "path"
import { GardenContext } from "../src/context"
import { Module } from "../src/types/module"
import { ContainerModule } from "../src/plugins/container"

export const projectRootA = join(__dirname, "data", "test-project-a")

class TestModule extends Module {
  type = "test"
}

class TestPluginB implements Plugin<ContainerModule> {
  name = "test-plugin-b"
  supportedModuleTypes = ["test"]

  parseModule({ ctx }: ParseModuleParams) {
    return new ContainerModule(ctx, {
      version: "0",
      type: "test",
      name: "test",
      path: "bla",
      variables: {},
      build: { dependencies: [] },
      services: {
        testService: { daemon: false, dependencies: [], endpoints: [], ports: [], volumes: [] },
      },
      test: {},
    })
  }
  async configureEnvironment() { }
  async deployService() { return {} }
}

export const testPlugin: Plugin<Module> = {
  name: "test-plugin",
  supportedModuleTypes: ["generic"],

  configureEnvironment: async () => { },
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
    (_ctx) => testPlugin,
    (_ctx) => new TestPluginB(),
  ]
  const plugins: PluginFactory[] = testPlugins.concat(extraPlugins)

  return await GardenContext.factory(projectRoot, { plugins })
}

export const makeTestContextA = async (extraPlugins: PluginFactory[] = []) => {
  return makeTestContext(projectRootA, extraPlugins)
}
