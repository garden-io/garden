import * as Bluebird from "bluebird"
import { expect } from "chai"
import { join } from "path"
import { pathExists, remove, writeFile } from "fs-extra"
import { differenceWith, entries, isEqual, values, mapValues } from "lodash"
import { defaultPlugins } from "../../../src/plugins"
import {  ServiceStatus } from "../../../src/types/service"
import { FSWatcher } from "../../../src/fs-watcher"
import {
  addTasksForAutoReload,
  computeAutoReloadDependants,
} from "../../../src/commands/auto-reload"
import { GardenContext } from "../../../src/context"
import { Module } from "../../../src/types/module"
import { DeployServiceParams, GetServiceStatusParams, Plugin } from "../../../src/types/plugin"
import { ServiceState } from "../../../src/types/service"

/*

  Build dependency diagram for auto-reload-project:

      a
      |
      b   c
     / \ / \
    d   e   f

  module-a has no service (i.e. is a build-only module).

  Service dependency diagram:

      b   c
     / \ / \
    d   e   f

 */

class TestProvider implements Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic", "container"]

  testStatuses: { [key: string]: ServiceStatus } = {}

  async getServiceStatus({ service }: GetServiceStatusParams): Promise<ServiceStatus> {
    return this.testStatuses[service.name] || {}
  }

  async deployService({ service }: DeployServiceParams) {
    const newStatus = {
      version: "1",
      state: <ServiceState>"ready",
    }

    this.testStatuses[service.name] = newStatus

    return newStatus
  }
}

const projectRoot = join(__dirname, "data", "auto-reload-project")

async function makeContext() {
  // return await makeTestContext(projectRoot, defaultPlugins.concat([() => new TestProvider()]))
  return await GardenContext.factory(projectRoot, { plugins: defaultPlugins.concat([() => new TestProvider()]) })
}

async function changeSource(ctx: GardenContext, moduleName: string) {
}

async function resetSources(ctx) {
  const dirNames = ["module-a", "module-b", "module-c", "module-d", "module-e", "module-f"]

  const defaultContents = {
    "module-a": "a",
    "module-b": "b",
    "module-c": "c",
    "module-d": "d",
    "module-e": "e",
    "module-f": "f",
  }

  Bluebird.each(dirNames, async (dirName) => {
    const dirPath = join(projectRoot, dirName)

    await writeFile(join(dirPath, "foo"), "foo")

    const barPath = join(dirPath, "bar")
    if (await pathExists(barPath)) {
      await remove(barPath)
    }
  })
}

async function watch(watcher: FSWatcher, moduleNames: string[], changeHandler?: (changedModule, taskResults, response) => void) {
  const ctx = watcher.ctx
  const allModules = values(await ctx.getModules())
  const modules = allModules.filter((m) => !m.skipAutoReload)
  const autoReloadDependants = await computeAutoReloadDependants(modules)

  await watcher.watchModules(modules, "testAutoReload", async (changedModule, response) => {
    ctx.log.info({ msg: `files changed for module ${changedModule.name}` })

    await addTasksForAutoReload(ctx, changedModule, autoReloadDependants)
    const taskResults = await ctx.processTasks()

    if (changeHandler) {
      changeHandler(changedModule, taskResults, response)
    }
  })
}

// async function testAutoReload(ctx: GardenContext, moduleName: string) {
//   const modules = values(await ctx.getModules())
//     .filter(m => !m.skipAutoReload)
//   const autoReloadDependants = await computeAutoReloadDependants(modules)
//   const entryModule = modules.find(m => m.name === moduleName) as Module
//
//   await addTasksForAutoReload(ctx, entryModule, autoReloadDependants)
//   return await ctx.processTasks()
// }

describe("commands.autoreload", () => {

  it("should re-deploy a module and its dependant modules when its sources change", async () => {
    const ctx = await makeContext()

    await resetSources(ctx)

    const watcher = new FSWatcher(ctx)
    let entryModuleNames = new Set()

    const changeHandler = (changedModule, taskResults, response) => {
      entryModuleNames.add(changedModule.name)
      console.log("module changed:", changedModule.name, "entryModuleNames:", [...entryModuleNames], "response:", response)
    }

    await watch(watcher, ["module-a", "module-b"], changeHandler)
    await changeSource(ctx, "module-a")
    await changeSource(ctx, "module-b")

    // watcher.end()

    // const result = await testAutoReload(ctx, "module-a")
    //
    // const expectedResult = {
    //   "build.module-a": { fresh: true, buildLog: "A\n" },
    //
    //   "build.module-b": { fresh: true, buildLog: "B\n" },
    //   "deploy.service-b": { version: "1", state: "ready" },
    //
    //   "build.module-c": { fresh: true, buildLog: "C\n" },
    //   "deploy.service-c": { version: "1", state: "ready" },
    //
    //   "build.module-d": { fresh: true, buildLog: "D\n" },
    //   "deploy.service-d": { version: "1", state: "ready" },
    //
    //   "build.module-e": { fresh: true, buildLog: "E\n" },
    //   "deploy.service-e": { version: "1", state: "ready" },
    // }
    //
    // expect(result).to.eql(expectedResult)
  })

})


