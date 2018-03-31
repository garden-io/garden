import * as td from "testdouble"
import { resolve } from "path"
import {
  DeleteConfigParams,
  GetConfigParams, ParseModuleParams, Plugin, PluginActions, PluginFactory,
  SetConfigParams,
} from "../src/types/plugin"
import { GardenContext } from "../src/context"
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

export class TestPlugin implements Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic"]

  private _config: object

  constructor() {
    this._config = {}
  }

  async parseModule({ ctx, config }: ParseModuleParams) {
    return new Module(ctx, config)
  }

  async configureEnvironment() { }
  async getServiceStatus() { return {} }
  async deployService() { return {} }

  async setConfig({ key, value }: SetConfigParams) {
    this._config[key.join(".")] = value
  }

  async getConfig({ key }: GetConfigParams) {
    return this._config[key.join(".")]
  }

  async deleteConfig({ key }: DeleteConfigParams) {
    const k = key.join(".")
    if (this._config[k]) {
      delete this._config[k]
      return { found: true }
    } else {
      return { found: false }
    }
  }
}

class TestPluginB extends TestPlugin {
  name = "test-plugin-b"
  supportedModuleTypes = ["test"]
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
  const testPlugins: PluginFactory[] = [
    (_ctx) => new TestPlugin(),
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

export async function expectErrorType(fn: Function, type: string) {
  try {
    await fn()
  } catch (err) {
    expect(err.type).to.equal(type)
    return
  }

  throw new Error(`Expected ${type} error`)
}
