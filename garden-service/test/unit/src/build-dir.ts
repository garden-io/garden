const nodetree = require("nodetree")
import { join } from "path"
import { pathExists, readdir, createFile } from "fs-extra"
import { expect } from "chai"
import { BuildTask } from "../../../src/tasks/build"
import { makeTestGarden, dataDir } from "../../helpers"
import { getConfigFilePath } from "../../../src/util/fs"
import { Garden } from "../../../src/garden"

/*
  Module dependency diagram for test-project-build-products

    a   b
     \ /
      d   c  e (e is a local exec module)
        \ | /
          f
 */

const projectRoot = join(dataDir, "test-project-build-products")

const makeGarden = async () => {
  return await makeTestGarden(projectRoot)
}

describe("BuildDir", () => {
  let garden: Garden

  before(async () => {
    garden = await makeGarden()
  })

  afterEach(async () => {
    await garden.buildDir.clear()
  })

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const buildDirExists = await pathExists(garden.buildDir.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  it("should clear the build dir when requested", async () => {
    const nodeCount = await readdir(garden.buildDir.buildDirPath)
    expect(nodeCount).to.eql([])
  })

  it("should ensure that a module's build subdir exists before returning from buildPath", async () => {
    const moduleA = await garden.resolveModuleConfig(garden.log, "module-a")
    const buildPath = await garden.buildDir.buildPath(moduleA)
    expect(await pathExists(buildPath)).to.eql(true)
  })

  describe("syncFromSrc", () => {
    it("should sync sources to the build dir", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = await graph.getModule("module-a")
      await garden.buildDir.syncFromSrc(moduleA, garden.log)
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      const copiedPaths = [join(buildDirA, "some-dir", "some-file")]

      for (const p of copiedPaths) {
        expect(await pathExists(p)).to.eql(true)
      }
    })

    it("should not sync sources for local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = await graph.getModule("module-e")
      await garden.buildDir.syncFromSrc(moduleE, garden.log)
      // This is the dir Garden would have synced the sources into
      const buildDirF = join(garden.buildDir.buildDirPath, moduleE.name)

      expect(await pathExists(buildDirF)).to.eql(false)
    })

    it("should respect the file list in the module's version", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = await graph.getModule("module-a")

      moduleA.version.files = [await getConfigFilePath(moduleA.path)]

      await garden.buildDir.syncFromSrc(moduleA, garden.log)
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      expect(await pathExists(await getConfigFilePath(buildDirA))).to.eql(true)
      expect(await pathExists(join(buildDirA, "some-dir", "some-file"))).to.eql(false)
    })

    it("should delete files that are not being synced from the module source directory", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = await graph.getModule("module-a")

      const buildDirA = await garden.buildDir.buildPath(moduleA)
      const deleteMe = join(buildDirA, "delete-me")

      await createFile(deleteMe)

      moduleA.version.files = [await getConfigFilePath(moduleA.path)]

      await garden.buildDir.syncFromSrc(moduleA, garden.log)

      expect(await pathExists(deleteMe)).to.be.false
    })
  })

  it("should sync dependency products to their specified destinations", async () => {
    const log = garden.log

    try {
      const graph = await garden.getConfigGraph(garden.log)
      const modules = await graph.getModules()
      const tasks = modules.map(
        (module) =>
          new BuildTask({
            garden,
            log,
            module,
            force: true,
          })
      )

      await garden.processTasks(tasks)

      const moduleD = await garden.resolveModuleConfig(garden.log, "module-d")
      const moduleF = await garden.resolveModuleConfig(garden.log, "module-f")
      const buildDirD = await garden.buildDir.buildPath(moduleD)
      const buildDirF = await garden.buildDir.buildPath(moduleF)

      // All these destinations should be populated now.
      const buildProductDestinations = [
        join(buildDirD, "a", "a.txt"),
        join(buildDirD, "b", "build", "b1.txt"),
        join(buildDirD, "b", "build_subdir", "b2.txt"),
        join(buildDirF, "d", "build", "d.txt"),
        join(buildDirF, "e", "e1.txt"),
        join(buildDirF, "e", "build", "e2.txt"),
      ]

      for (const p of buildProductDestinations) {
        expect(await pathExists(p)).to.eql(true, `${p} not found`)
      }

      // This file was not requested by module-d's garden.yml's copy directive for module-b.
      const notCopiedPath = join(buildDirD, "B", "build", "unused.txt")
      expect(await pathExists(notCopiedPath)).to.eql(false)
    } catch (e) {
      // tslint:disable-next-line: no-console
      console.log(nodetree(garden.buildDir.buildDirPath))
      throw e
    }
  })

  describe("buildPath", () => {
    it("should ensure the build path and return it", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = await graph.getModule("module-a")
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      expect(await pathExists(buildDirA)).to.eql(true)
      expect(buildDirA).to.eql(join(garden.buildDir.buildDirPath, "module-a"))
    })

    it("should return the module path for a local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = await graph.getModule("module-e")
      const buildDirE = await garden.buildDir.buildPath(moduleE)

      expect(buildDirE).to.eql(moduleE.path)
    })
  })
})
