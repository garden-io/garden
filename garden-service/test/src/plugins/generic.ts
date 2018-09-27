import { expect } from "chai"
import {
  join,
  resolve,
} from "path"
import { Garden } from "../../../src/garden"
import { gardenPlugin } from "../../../src/plugins/generic"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../../src/constants"
import {
  writeModuleVersionFile,
  readModuleVersionFile,
} from "../../../src/vcs/base"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

describe("generic plugin", () => {
  const projectRoot = resolve(dataDir, "test-project-generic")
  const moduleName = "module-a"

  let garden: Garden

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { generic: gardenPlugin })
    await garden.clearBuilds()
  })

  describe("getBuildStatus", () => {
    it("should read a build version file if it exists", async () => {
      const module = await garden.getModule(moduleName)
      const version = module.version
      const buildPath = module.buildPath
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await writeModuleVersionFile(versionFilePath, version)

      const result = await garden.actions.getBuildStatus({ module })

      expect(result.ready).to.be.true
    })
  })

  describe("build", () => {
    it("should write a build version file after building", async () => {
      const module = await garden.getModule(moduleName)
      const version = module.version
      const buildPath = module.buildPath
      const versionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)

      await garden.actions.build({ module })

      const versionFileContents = await readModuleVersionFile(versionFilePath)

      expect(versionFileContents).to.eql(version)
    })
  })
})
