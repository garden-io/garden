import { resolve, join } from "path"
import { expect } from "chai"
import pEvent = require("p-event")

import {
  TestGarden,
  dataDir,
  makeTestGarden,
  withDefaultGlobalOpts,
  makeExtModuleSourcesGarden,
  resetLocalConfig,
  makeExtProjectSourcesGarden,
} from "../../helpers"
import { CacheContext, pathToCacheContext } from "../../../src/cache"
import { createFile, remove, pathExists } from "fs-extra"
import { getConfigFilePath } from "../../../src/util/fs"
import { LinkModuleCommand } from "../../../src/commands/link/module"
import { cleanUpGlobalWatcher } from "../../../src/watch"
import { LinkSourceCommand } from "../../../src/commands/link/source"
import { sleep } from "../../../src/util/util"

function emitEvent(garden: TestGarden, name: string, payload: any) {
  garden["watcher"]["watcher"].emit(name, payload)
}

describe("Watcher", () => {
  let garden: TestGarden
  let modulePath: string
  let doubleModulePath: string
  let includeModulePath: string
  let moduleContext: CacheContext

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-watch"))
    modulePath = resolve(garden.projectRoot, "module-a")
    doubleModulePath = resolve(garden.projectRoot, "double-module")
    includeModulePath = resolve(garden.projectRoot, "with-include")
    moduleContext = pathToCacheContext(modulePath)
    await garden.startWatcher(await garden.getConfigGraph())
  })

  beforeEach(async () => {
    garden.events.clearLog()
  })

  after(async () => {
    await garden.close()
  })

  async function waitForEvent(name: string) {
    return pEvent(<any>garden.events, name, { timeout: 2000 })
  }

  it("should emit a moduleConfigChanged changed event when module config is changed", async () => {
    const path = await getConfigFilePath(modulePath)
    emitEvent(garden, "change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleConfigChanged", payload: { names: ["module-a"], path } },
    ])
  })

  it("should emit a moduleConfigChanged event when module config is changed and include field is set", async () => {
    const path = await getConfigFilePath(includeModulePath)
    emitEvent(garden, "change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleConfigChanged", payload: { names: ["with-include"], path } },
    ])
  })

  it("should clear all module caches when a module config is changed", async () => {
    const path = await getConfigFilePath(modulePath)
    emitEvent(garden, "change", path)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a projectConfigChanged changed event when project config is changed", async () => {
    const path = await getConfigFilePath(garden.projectRoot)
    emitEvent(garden, "change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should emit a projectConfigChanged changed event when project config is removed", async () => {
    const path = await getConfigFilePath(garden.projectRoot)
    emitEvent(garden, "unlink", path)
    expect(garden.events.eventLog).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should emit a projectConfigChanged changed event when ignore files are changed", async () => {
    const path = join(await getConfigFilePath(garden.projectRoot), ".gardenignore")
    emitEvent(garden, "change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should clear all module caches when project config is changed", async () => {
    const path = await getConfigFilePath(garden.projectRoot)
    emitEvent(garden, "change", path)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when adding a garden.yml file", async () => {
    const path = await getConfigFilePath(join(garden.projectRoot, "module-b"))
    emitEvent(garden, "add", path)
    expect(await waitForEvent("configAdded")).to.eql({ path })
  })

  it("should emit a configRemoved event when removing a garden.yml file", async () => {
    const path = await getConfigFilePath(join(garden.projectRoot, "module-b"))
    emitEvent(garden, "unlink", path)
    expect(garden.events.eventLog).to.eql([
      { name: "configRemoved", payload: { path } },
    ])
  })

  context("should emit a moduleSourcesChanged event", () => {
    it("containing the module's name when one of its files is changed", async () => {
      const pathChanged = resolve(modulePath, "foo.txt")
      emitEvent(garden, "change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
      ])
    })

    it("if a file is changed and it matches a module's include list", async () => {
      const pathChanged = resolve(includeModulePath, "subdir", "foo2.txt")
      emitEvent(garden, "change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["with-include"], pathChanged } },
      ])
    })

    it("if a file is added to a module", async () => {
      const pathChanged = resolve(modulePath, "new.txt")
      try {
        await createFile(pathChanged)
        expect(await waitForEvent("moduleSourcesChanged")).to.eql({ names: ["module-a"], pathChanged })
      } finally {
        await pathExists(pathChanged) && await remove(pathChanged)
      }
    })

    it("containing both modules' names when a source file is changed for two co-located modules", async () => {
      const pathChanged = resolve(doubleModulePath, "foo.txt")
      emitEvent(garden, "change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-b", "module-c"], pathChanged } },
      ])
    })
  })

  it("should not emit moduleSourcesChanged if file is changed and doesn't match module's include list", async () => {
    const pathChanged = resolve(includeModulePath, "foo.txt")
    emitEvent(garden, "change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should not emit moduleSourcesChanged if file is changed and it's in a gardenignore in the module", async () => {
    const pathChanged = resolve(modulePath, "module-excluded.txt")
    emitEvent(garden, "change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should not emit moduleSourcesChanged if file is changed and it's in a gardenignore in the project", async () => {
    const pathChanged = resolve(modulePath, "project-excluded.txt")
    emitEvent(garden, "change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should clear a module's cache when a module file is changed", async () => {
    const pathChanged = resolve(modulePath, "foo.txt")
    emitEvent(garden, "change", pathChanged)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when a directory is added that contains a garden.yml file", async () => {
    emitEvent(garden, "addDir", modulePath)
    expect(await waitForEvent("configAdded")).to.eql({
      path: await getConfigFilePath(modulePath),
    })
  })

  it("should emit a moduleSourcesChanged event when a directory is added under a module directory", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent(garden, "addDir", pathChanged)
    expect(await waitForEvent("moduleSourcesChanged")).to.eql({
      names: ["module-a"],
      pathChanged,
    })
  })

  it("should clear a module's cache when a directory is added under a module directory", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent(garden, "addDir", pathChanged)
    await waitForEvent("moduleSourcesChanged")
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a moduleRemoved event if a directory containing a module is removed", async () => {
    emitEvent(garden, "unlinkDir", modulePath)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleRemoved", payload: {} },
    ])
  })

  it("should emit a moduleSourcesChanged event if a directory within a module is removed", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent(garden, "unlinkDir", pathChanged)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
    ])
  })

  context("linked module sources", () => {
    const localModuleSourceDir = resolve(dataDir, "test-project-local-module-sources")
    const localModulePathA = join(localModuleSourceDir, "module-a")
    const localModulePathB = join(localModuleSourceDir, "module-b")

    before(async () => {
      // The watcher instance is global so we clean up the previous one before proceeding
      cleanUpGlobalWatcher()
      garden = await makeExtModuleSourcesGarden()

      // Link some modules
      const linkCmd = new LinkModuleCommand()
      await linkCmd.action({
        garden,
        log: garden.log,
        headerLog: garden.log,
        footerLog: garden.log,
        args: {
          module: "module-a",
          path: localModulePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log: garden.log,
        headerLog: garden.log,
        footerLog: garden.log,
        args: {
          module: "module-b",
          path: localModulePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })

      // We need to make a new instance of Garden after linking the sources
      // This is not an issue in practice because there are specific commands just for linking
      // so the user will always have a new instance of Garden when they run their next command.
      garden = await makeExtModuleSourcesGarden()
      await garden.startWatcher(await garden.getConfigGraph())
      // This ensures that the watcher is properly initialised when we call `watcher.getWatched()` below
      await sleep(100)
    })

    beforeEach(() => {
      garden.events.clearLog()
    })

    after(async () => {
      await resetLocalConfig(garden.gardenDirPath)
      await garden.close()
    })

    it("should watch all linked repositories", () => {
      const watcher = garden["watcher"]["watcher"]
      const shouldWatch = [garden.projectRoot, localModulePathA, localModulePathB]
      const watched = Object.keys(watcher.getWatched())
      expect(shouldWatch.every(path => watched.includes(path))).to.be.true
    })

    it("should emit a moduleSourcesChanged event when a linked module source is changed", async () => {
      const pathChanged = resolve(localModuleSourceDir, "module-a", "foo.txt")
      emitEvent(garden, "change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
      ])
    })
  })

  context("linked project sources", () => {
    const localProjectSourceDir = resolve(dataDir, "test-project-local-project-sources")
    const localSourcePathA = join(localProjectSourceDir, "source-a")
    const localSourcePathB = join(localProjectSourceDir, "source-b")

    before(async () => {
      // The watcher instance is global so we clean up the previous one before proceeding
      cleanUpGlobalWatcher()
      garden = await makeExtProjectSourcesGarden()

      // Link some projects
      const linkCmd = new LinkSourceCommand()
      await linkCmd.action({
        garden,
        log: garden.log,
        headerLog: garden.log,
        footerLog: garden.log,
        args: {
          source: "source-a",
          path: localSourcePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log: garden.log,
        headerLog: garden.log,
        footerLog: garden.log,
        args: {
          source: "source-b",
          path: localSourcePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })

      // We need to make a new instance of Garden after linking the sources
      // This is not an issue in practice because there are specific commands just for linking
      // so the user will always have a new instance of Garden when they run their next command.
      garden = await makeExtProjectSourcesGarden()
      await garden.startWatcher(await garden.getConfigGraph())
      // This ensures that the watcher is properly initialised when we call `watcher.getWatched()` below
      await sleep(100)
    })

    beforeEach(() => {
      garden.events.clearLog()
    })

    after(async () => {
      await resetLocalConfig(garden.gardenDirPath)
      await garden.close()
    })

    it("should watch all linked repositories", () => {
      const watcher = garden["watcher"]["watcher"]
      const shouldWatch = [garden.projectRoot, localSourcePathA, localSourcePathB]
      const watched = Object.keys(watcher.getWatched())
      expect(shouldWatch.every(path => watched.includes(path))).to.be.true
    })

    it("should emit a moduleSourcesChanged event when a linked project source is changed", async () => {
      const pathChanged = resolve(localProjectSourceDir, "source-a", "module-a", "foo.txt")
      emitEvent(garden, "change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
      ])
    })
  })

})
