import { resolve } from "path"
import { TestGarden, dataDir, makeTestGarden } from "../../helpers"
import { expect } from "chai"
import { CacheContext, pathToCacheContext } from "../../../src/cache"
import pEvent = require("p-event")

describe("Watcher", () => {
  let garden: TestGarden
  let modulePath: string
  let doubleModulePath: string
  let moduleContext: CacheContext

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-watch"))
    modulePath = resolve(garden.projectRoot, "module-a")
    doubleModulePath = resolve(garden.projectRoot, "double-module")
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
    const path = resolve(modulePath, "garden.yml")
    emitEvent("change", path)
    expect(garden.events.log).to.eql([
      { name: "moduleConfigChanged", payload: { names: ["module-a"], path } },
    ])
  })

  it("should clear all module caches when a module config is changed", async () => {
    emitEvent("change", resolve(modulePath, "garden.yml"))
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a projectConfigChanged changed event when project config is changed", async () => {
    emitEvent("change", resolve(garden.projectRoot, "garden.yml"))
    expect(garden.events.log).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should emit a projectConfigChanged changed event when project config is removed", async () => {
    emitEvent("unlink", resolve(garden.projectRoot, "garden.yml"))
    expect(garden.events.log).to.eql([
      { name: "projectConfigChanged", payload: {} },
    ])
  })

  it("should clear all module caches when project config is changed", async () => {
    emitEvent("change", resolve(garden.projectRoot, "garden.yml"))
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when adding a garden.yml file", async () => {
    const path = resolve(garden.projectRoot, "module-b", "garden.yml")
    emitEvent("add", path)
    expect(garden.events.log).to.eql([
      { name: "configAdded", payload: { path } },
    ])
  })

  it("should emit a configRemoved event when removing a garden.yml file", async () => {
    const path = resolve(garden.projectRoot, "module-b", "garden.yml")
    emitEvent("unlink", path)
    expect(garden.events.log).to.eql([
      { name: "configRemoved", payload: { path } },
    ])
  })

  context("should emit a moduleSourcesChanged event", () => {

    it("containing the module's name when one of its files is changed", async () => {
      const pathChanged = resolve(modulePath, "foo.txt")
      emitEvent("change", pathChanged)
      expect(garden.events.log).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
      ])
    })

    it("containing both modules' names when a source file is changed for two co-located modules", async () => {
      const pathChanged = resolve(doubleModulePath, "foo.txt")
      emitEvent("change", pathChanged)
      expect(garden.events.log).to.eql([
        { name: "moduleSourcesChanged", payload: { names: ["module-b", "module-c"], pathChanged } },
      ])
    })

  })

  it("should clear a module's cache when a module file is changed", async () => {
    const pathChanged = resolve(modulePath, "foo.txt")
    emitEvent("change", pathChanged)
    expect(garden.cache.getByContext(moduleContext)).to.eql(new Map())
  })

  it("should emit a configAdded event when a directory is added that contains a garden.yml file", async () => {
    emitEvent("addDir", modulePath)
    expect(await waitForEvent("configAdded")).to.eql({
      path: resolve(modulePath, "garden.yml"),
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
    expect(garden.events.log).to.eql([
      { name: "moduleRemoved", payload: {} },
    ])
  })

  it("should emit a moduleSourcesChanged event if a directory within a module is removed", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent("unlinkDir", pathChanged)
    expect(garden.events.log).to.eql([
      { name: "moduleSourcesChanged", payload: { names: ["module-a"], pathChanged } },
    ])
  })
})
