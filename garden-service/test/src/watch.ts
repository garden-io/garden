import { resolve } from "path"
import { TestGarden, dataDir, makeTestGarden } from "../helpers"
import { expect } from "chai"
import { CacheContext, pathToCacheContext } from "../../src/cache"
import pEvent = require("p-event")

describe("Watcher", () => {
  let garden: TestGarden
  let modulePath: string
  let moduleContext: CacheContext

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-watch"))
    modulePath = resolve(garden.projectRoot, "module-a")
    moduleContext = pathToCacheContext(modulePath)
    await garden.startWatcher()
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
    emitEvent("change", resolve(modulePath, "garden.yml"))
    expect(garden.events.log).to.eql([
      { name: "moduleConfigChanged", payload: { name: "module-a" } },
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

  it("should emit a moduleSourcesChanged event when a module file is changed", async () => {
    const pathChanged = resolve(modulePath, "foo.txt")
    emitEvent("change", pathChanged)
    expect(garden.events.log).to.eql([
      { name: "moduleSourcesChanged", payload: { name: "module-a", pathChanged } },
    ])
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
      name: "module-a",
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
      { name: "moduleRemoved", payload: { name: "module-a" } },
    ])
  })

  it("should emit a moduleSourcesChanged event if a directory within a module is removed", async () => {
    const pathChanged = resolve(modulePath, "subdir")
    emitEvent("unlinkDir", pathChanged)
    expect(garden.events.log).to.eql([
      { name: "moduleSourcesChanged", payload: { name: "module-a", pathChanged } },
    ])
  })
})
