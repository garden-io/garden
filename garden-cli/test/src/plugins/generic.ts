import { expect } from "chai"
import {
  join,
  resolve,
} from "path"
import { Garden } from "../../../src/garden"
import { PluginContext } from "../../../src/plugin-context"
import {
  gardenPlugin,
} from "../../../src/plugins/container"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../../src/constants"
import {
  readVersionFile,
  writeVersionFile,
} from "../../../src/vcs/base"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

describe("generic plugin", () => {
  const projectRoot = resolve(dataDir, "test-project-a")
  const moduleName = "module-a"

  let garden: Garden
  let ctx: PluginContext

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, [gardenPlugin])
    ctx = garden.pluginContext
    await garden.clearBuilds()
  })

  describe("getModuleBuildStatus", () => {
    it("should read a build version file if it exists", async () => {
      const module = await ctx.getModule(moduleName)
      const version = await module.getVersion()
      const buildPath = await module.getBuildPath()
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await writeVersionFile(versionFilePath, {
        latestCommit: version.versionString,
        dirtyTimestamp: version.dirtyTimestamp,
      })

      const result = await ctx.getModuleBuildStatus({ moduleName })

      expect(result.ready).to.be.true
    })
  })

  describe("buildModule", () => {
    it("should write a build version file after building", async () => {
      const module = await ctx.getModule(moduleName)
      const version = await module.getVersion()
      const buildPath = await module.getBuildPath()
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await ctx.buildModule({ moduleName })

      const versionFileContents = await readVersionFile(versionFilePath)

      expect(versionFileContents).to.eql({
        latestCommit: version.versionString,
        dirtyTimestamp: version.dirtyTimestamp,
      })
    })
  })
})
