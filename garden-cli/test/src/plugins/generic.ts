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
import {
  buildVersionFilename,
} from "../../../src/plugins/generic"
import { Environment } from "../../../src/types/common"
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
  let env: Environment

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, [gardenPlugin])
    ctx = garden.pluginContext
    env = garden.getEnvironment()
    await garden.clearBuilds()
  })

  describe("getModuleBuildStatus", () => {
    it("should read a build version file if it exists", async () => {
      const module = await ctx.getModule(moduleName)
      const version = await module.getVersion()
      const buildPath = await module.getBuildPath()
      const versionFilePath = join(buildPath, buildVersionFilename)

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
      const versionFilePath = join(buildPath, buildVersionFilename)

      await ctx.buildModule({ moduleName })

      const versionFileContents = await readVersionFile(versionFilePath)

      expect(versionFileContents).to.eql({
        latestCommit: version.versionString,
        dirtyTimestamp: version.dirtyTimestamp,
      })
    })
  })
})
