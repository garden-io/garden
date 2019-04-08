import { resolve } from "path"
import { TestGarden, dataDir, makeTestGarden } from "../../helpers"
import { expect } from "chai"
import { CacheContext, pathToCacheContext } from "../../../src/cache"
import { CONFIG_FILENAME } from "../../../src/constants"
import pEvent = require("p-event")
import { createFile, remove, pathExists } from "fs-extra"

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

  function emitEvent(name: string, payload: any) {
    (<any>garden).watcher.watcher.emit(name, payload)
  }

  async function waitForEvent(name: string) {
    return pEvent(<any>garden.events, name, { timeout: 2000 })
  }

  it("should emit a moduleConfigChanged changed event when module config is changed", async () => {
    const path = resolve(modulePath, CONFIG_FILENAME)
    emitEvent("change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleConfigChanged", payload: { names: ["module-a"], path } },
    ])
  })

  it("should emit a moduleConfigChanged event when module config is changed and include field is set", async () => {
    const path = resolve(includeModulePath, CONFIG_FILENAME)
    emitEvent("change", path)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleConfigChanged", payload: { names: ["with-include"], path } },
    ])
  })

  it("should clear all module caches when a module config is changed", async () => {
    emitEvent("change", resolve(modulePath, CONFIG_FILENAME))
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a projectConfigChanged changed event when project config is changed", async () => {
    emitEvent("change", resolve(garden.projectRoot, CONFIG_FILENAME))
    expect(garden.events.eventLog).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should emit a projectConfigChanged changed event when project config is removed", async () => {
    emitEvent("unlink", resolve(garden.projectRoot, CONFIG_FILENAME))
    expect(garden.events.eventLog).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should clear all module caches when project config is changed", async () => {
    emitEvent("change", resolve(garden.projectRoot, CONFIG_FILENAME))
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when adding a garden.yml file", async () => {
    const path = resolve(garden.projectRoot, "module-b", CONFIG_FILENAME)
    emitEvent("add", path)
    expect(await waitForEvent("configAdded")).to.eql({ path })
  })

  it("should emit a configRemoved event when removing a garden.yml file", async () => {
    const path = resolve(garden.projectRoot, "module-b", CONFIG_FILENAME)
    emitEvent("unlink", path)
    expect(garden.events.eventLog).to.eql([
      { name: "configRemoved", payload: { path } },
    ])
  })

  context("should emit a moduleSourcesChanged event", () => {
    it("containing the module's name when one of its files is changed", async () => {
      const pathChanged = resolve(modulePath, "foo.txt")
      emitEvent("change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
      ])
    })

    it("if a file is changed and it matches a module's include list", async () => {
      const pathChanged = resolve(includeModulePath, "subdir", "foo2.txt")
      emitEvent("change", pathChanged)
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
      emitEvent("change", pathChanged)
      expect(garden.events.eventLog).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-b", "module-c"], pathChanged } },
      ])
    })
  })

  it("should not emit moduleSourcesChanged if file is changed and doesn't match module's include list", async () => {
    const pathChanged = resolve(includeModulePath, "foo.txt")
    emitEvent("change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should not emit moduleSourcesChanged if file is changed and it's in a gardenignore in the module", async () => {
    const pathChanged = resolve(modulePath, "module-excluded.txt")
    emitEvent("change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should not emit moduleSourcesChanged if file is changed and it's in a gardenignore in the project", async () => {
    const pathChanged = resolve(modulePath, "project-excluded.txt")
    emitEvent("change", pathChanged)
    expect(garden.events.eventLog).to.eql([])
  })

  it("should clear a module's cache when a module file is changed", async () => {
    const pathChanged = resolve(modulePath, "foo.txt")
    emitEvent("change", pathChanged)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when a directory is added that contains a garden.yml file", async () => {
    emitEvent("addDir", modulePath)
    expect(await waitForEvent("configAdded")).to.eql({
      path: resolve(modulePath, CONFIG_FILENAME),
    })
  })

  it("should emit a moduleSourcesChanged event when a directory is added under a module directory", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent("addDir", pathChanged)
    expect(await waitForEvent("moduleSourcesChanged")).to.eql({
      names: ["module-a"],
      pathChanged,
    })
  })

  it("should clear a module's cache when a directory is added under a module directory", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent("addDir", pathChanged)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a moduleRemoved event if a directory containing a module is removed", async () => {
    emitEvent("unlinkDir", modulePath)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleRemoved", payload: {} },
    ])
  })

  it("should emit a moduleSourcesChanged event if a directory within a module is removed", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent("unlinkDir", pathChanged)
    expect(garden.events.eventLog).to.eql([
      { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
    ])
  })
})
