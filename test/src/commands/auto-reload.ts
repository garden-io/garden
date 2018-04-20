import * as Bluebird from "bluebird"
import { expect } from "chai"
import { join } from "path"
import { pathExists, remove, writeFile } from "fs-extra"
import { merge, sortedUniq, values } from "lodash"
import { FSWatcher } from "../../../src/watch"
import {
  computeAutoReloadDependants,
} from "../../../src/watch"
import { makeTestGarden } from "../../helpers"
import { Garden } from "../../../src/garden"

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

const projectRoot = join(__dirname, "data", "auto-reload-project")

const makeGarden = async () => {
  return await makeTestGarden(projectRoot)
}

async function changeSource(garden: Garden, moduleName: string) {
  await writeFile(join(projectRoot, moduleName, "bar"), "bar")
  console.log("wrote", join(projectRoot, moduleName, "bar"))
}

async function resetSources(ctx) {
  const dirNames = ["module-a", "module-b", "module-c", "module-d", "module-e", "module-f"]

  await Bluebird.each(dirNames, async (dirName) => {
    const dirPath = join(projectRoot, dirName)

    await writeFile(join(dirPath, "foo"), "foo")

    const barPath = join(dirPath, "bar")
    console.log("barPath", barPath)
    if (await pathExists(barPath)) {
      await remove(barPath)
    }
  })
}

async function watch(
  watcher: FSWatcher, garden: Garden, moduleNames: string[],
  changeHandler?: (changedModule, taskResults, response) => void,
) {
  console.log("start of watch")
  const modules = values(await garden.getModules(moduleNames))
  // const autoReloadDependants = await computeAutoReloadDependants(modules)

  await watcher.watchModules(modules, "testAutoReload", async (changedModule, response) => {
    console.log(`files changed for module ${changedModule.name}`)

    // await addTasksForAutoReload(garden.pluginContext, changedModule, autoReloadDependants)
    const taskResults = await garden.processTasks()

    if (changeHandler) {
      changeHandler(changedModule, taskResults, response)
    }
  })

  console.log("end of watch")
}

// async function testAutoReload(ctx: GardenContext, moduleName: string) {
//   const modules = values(await ctx.getModules())
//   const autoReloadDependants = await computeAutoReloadDependants(modules)
//   const entryModule = modules.find(m => m.name === moduleName) as Module
//
//   await addTasksForAutoReload(ctx, entryModule, autoReloadDependants)
//   return await ctx.processTasks()
// }

const setup = async () => {
  const garden = await makeGarden()
  // await resetSources(garden)
  const autoReloadDependants = await computeAutoReloadDependants(values(await garden.getModules()))
  const watcher = new FSWatcher()

  return { autoReloadDependants, garden, watcher }
}

describe("commands.autoreload", () => {

  // WIP
  it.skip("should re-deploy a module and its dependant modules when its sources change", async () => {
    const { autoReloadDependants, garden, watcher } = await setup()

    let entryModuleNames: string[] = []
    let reloadResults = {}

    const changeHandler = async (changedModule, taskResults, response) => {
      // watchCounter = watchCounter + 1
      entryModuleNames.push(changedModule.name)
      // console.log("module changed:", changedModule.name, "entryModuleNames:", [...entryModuleNames])
      console.log("module changed:", changedModule.name, "entryModuleNames:", [...entryModuleNames], "response", response.files.map(f => f.name))
      // await addTasksForAutoReload(garden.pluginContext, changedModule, autoReloadDependants)
      merge(reloadResults, taskResults)
    }

    await watch(watcher, garden, ["module-a"], changeHandler)

    // for (const module of values(await garden.getModules())) {
    //   await addTasksForAutoReload(garden.pluginContext, module, autoReloadDependants)
    // }
    //
    // const results = await garden.processTasks()
    // console.log("results", results)

    await changeSource(garden, "module-a")
    // await changeSource(garden, "module-b")
    // await changeSource(garden, "module-f")

    // console.log("start of sleep")
    // await sleep(2000)
    // console.log("end of sleep")

    watcher.end()

    expect(sortedUniq(entryModuleNames))
      .to.eql(["module-a", "module-b"])

    const expectedResult = {
      "build.module-a": { fresh: true, buildLog: "A\n" },

      "build.module-b": { fresh: true, buildLog: "B\n" },
      "deploy.service-b": { version: "1", state: "ready" },

      "build.module-c": { fresh: true, buildLog: "C\n" },
      "deploy.service-c": { version: "1", state: "ready" },

      "build.module-d": { fresh: true, buildLog: "D\n" },
      "deploy.service-d": { version: "1", state: "ready" },

      "build.module-e": { fresh: true, buildLog: "E\n" },
      "deploy.service-e": { version: "1", state: "ready" },
    }

    expect(reloadResults).to.eql(expectedResult)
  })
})
