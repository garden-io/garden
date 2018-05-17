const nodetree = require("nodetree")
import { join } from "path"
import { pathExists, readdir } from "fs-extra"
import { expect } from "chai"
import { BuildTask } from "../../src/tasks/build"
import { makeTestGarden } from "../helpers"
import { keyBy } from "lodash"

/*
  Module dependency diagram for test-project-build-products

    a   b
     \ /
      d    c
        \ /
         e
 */

const projectRoot = join(__dirname, "..", "data", "test-project-build-products")

const makeGarden = async () => {
  return await makeTestGarden(projectRoot)
}

describe("BuildDir", () => {

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const garden = await makeGarden()
    const buildDirExists = await pathExists(garden.buildDir.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  it("should clear the build dir when requested", async () => {
    const garden = await makeGarden()
    await garden.buildDir.clear()
    const nodeCount = await readdir(garden.buildDir.buildDirPath)
    expect(nodeCount).to.eql([])
  })

  it("should ensure that a module's build subdir exists before returning from buildPath", async () => {
    const garden = await makeGarden()
    await garden.buildDir.clear()
    const moduleA = await garden.getModule("module-a")
    const buildPath = await garden.buildDir.buildPath(moduleA)
    expect(await pathExists(buildPath)).to.eql(true)
  })

  it("should sync sources to the build dir", async () => {
    const garden = await makeGarden()
    const moduleA = await garden.getModule("module-a")
    await garden.buildDir.syncFromSrc(moduleA)
    const buildDirA = await garden.buildDir.buildPath(moduleA)

    const copiedPaths = [
      join(buildDirA, "garden.yml"),
      join(buildDirA, "some-dir", "some-file"),
    ]

    const buildDirPrettyPrint = nodetree(garden.buildDir.buildDirPath)

    for (const p of copiedPaths) {
      expect(await pathExists(p)).to.eql(true, buildDirPrettyPrint)
    }
  })

  it("should sync dependency products to their specified destinations", async () => {
    const garden = await makeGarden()
    try {
      await garden.clearBuilds()
      const modules = await garden.getModules()

      for (const module of modules) {
        await garden.addTask(new BuildTask(garden.pluginContext, module, false))
      }

      await garden.processTasks()
      const modulesByName = keyBy(modules, "name")

      const buildDirD = await garden.buildDir.buildPath(modulesByName["module-d"])
      const buildDirE = await garden.buildDir.buildPath(modulesByName["module-e"])

      // All these destinations should be populated now.
      const buildProductDestinations = [
        join(buildDirD, "a", "a.txt"),
        join(buildDirD, "b", "build", "b1.txt"),
        join(buildDirD, "b", "build_subdir", "b2.txt"),
        join(buildDirE, "d", "build", "d.txt"),
      ]

      for (const p of buildProductDestinations) {
        expect(await pathExists(p)).to.eql(true, `${p} not found`)
      }

      // This file was not requested by module-d's garden.yml's copy directive for module-b.
      const notCopiedPath = join(buildDirD, "B", "build", "unused.txt")
      expect(await pathExists(notCopiedPath)).to.eql(false)
    } catch (e) {
      const buildDirPrettyPrint = nodetree(garden.buildDir.buildDirPath)
      console.log(buildDirPrettyPrint)
      throw e
    }
  })

})
