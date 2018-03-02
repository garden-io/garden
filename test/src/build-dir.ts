import { join, resolve } from "path"
import { pathExists, readdir } from "fs-extra"
import { expect } from "chai"
const nodetree = require("nodetree")
import { values } from "lodash"
import { defaultPlugins } from "../../src/plugins";
import { GardenContext } from "../../src/context";
import { BuildTask } from "../../src/tasks/build";

/*
  Module dependency diagram for test-project-build-products

  a   b
   \ /
    d    c
      \ /
       e
 */

describe("BuildDir", () => {
  describe("sync", async () => {
    const projectRoot = join(__dirname, "..", "data", "test-project-build-products")
    const ctx = await GardenContext.factory(projectRoot, { plugins: defaultPlugins })

    it("should have ensured the existence of the build dir when GardenContext was initialized", async () => {
      const buildDirExists = await pathExists(ctx.buildDir.buildDirPath)
      expect(buildDirExists).to.eql(true)
    })

    it("should clear the build dir when requested", async () => {
      await ctx.buildDir.clear()
      const nodeCount = await readdir(ctx.buildDir.buildDirPath)
      expect(nodeCount).to.eql([])
    })

    it("should sync sources to the build dir", async () => {
      const modules = await ctx.getModules()
      const moduleA = modules["module-a"]
      await ctx.buildDir.syncFromSrc(moduleA)
      const buildDirA = ctx.buildDir.buildPath(moduleA)

      const copiedPaths = [
        join(buildDirA, "garden.yml"),
        join(buildDirA, "some-dir", "some-file")
      ]

      const buildDirPrettyPrint = nodetree(ctx.buildDir.buildDirPath)

      for (const p of copiedPaths) {
        expect(await pathExists(p)).to.eql(true, buildDirPrettyPrint)
      }
    })

    it("should sync dependency products to their specified destinations", async () => {
      try {
        await ctx.buildDir.clear()
        const modules = await ctx.getModules()

        for (const module of values(modules)) {
          await ctx.addTask(new BuildTask(ctx, module, false))
        }

        await ctx.processTasks()

        const buildDirD = ctx.buildDir.buildPath(modules["module-d"])
        const buildDirE = ctx.buildDir.buildPath(modules["module-e"])

        // All these destinations should be populated now.
        const buildProductDestinations = [
          join(buildDirD, 'a', 'a.txt'),
          join(buildDirD, 'b', 'build', 'b1.txt'),
          join(buildDirD, 'b', 'build', 'build_subdir', 'b2.txt'),
          join(buildDirE, 'd', 'build', 'd.txt')
        ]

        for (const p of buildProductDestinations) {
          expect(await pathExists(p)).to.eql(true, `${p} not found`)
        }

        // This file was not requested by module-d's garden.yml's copy directive for module-b.
        const notCopiedPath = join(buildDirD, 'B', 'build', 'unused.txt')
        expect(await pathExists(notCopiedPath)).to.eql(false)
      } catch (e) {
        const buildDirPrettyPrint = nodetree(ctx.buildDir.buildDirPath)
        console.log(buildDirPrettyPrint)
        throw e
      }
    })

  })
})
