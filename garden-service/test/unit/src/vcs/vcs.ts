import {
  VcsHandler,
  TreeVersions,
  TreeVersion,
  getVersionString,
  writeTreeVersionFile,
  readTreeVersionFile,
} from "../../../../src/vcs/vcs"
import { projectRootA, makeTestGardenA, makeTestGarden, getDataDir } from "../../../helpers"
import { expect } from "chai"
import { cloneDeep } from "lodash"
import { Garden } from "../../../../src/garden"
import { ModuleConfigContext } from "../../../../src/config/config-context"
import { ModuleConfig } from "../../../../src/config/module"
import { GitHandler } from "../../../../src/vcs/git"
import { resolve, join } from "path"
import * as td from "testdouble"
import * as tmp from "tmp-promise"
import { realpath, readFile, writeFile } from "fs-extra"
import { GARDEN_VERSIONFILE_NAME } from "../../../../src/constants"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testVersions: TreeVersions = {}

  async getFiles() {
    return []
  }

  async getTreeVersion(path: string, include: string[] | null) {
    return this.testVersions[path] || super.getTreeVersion(path, include)
  }

  setTestVersion(path: string, version: TreeVersion) {
    this.testVersions[path] = version
  }

  async ensureRemoteSource(): Promise<string> {
    return ""
  }

  async updateRemoteSource() {
    return
  }

}
describe("VcsHandler", () => {
  let handlerA: TestVcsHandler
  let gardenA: Garden

  // note: module-a has a version file with this content
  const versionA = {
    contentHash: "1234567890",
    files: [],
  }

  beforeEach(async () => {
    handlerA = new TestVcsHandler(projectRootA)
    gardenA = await makeTestGardenA()
  })

  describe("getTreeVersion", () => {
    it("should sort the list of files in the returned version", async () => {
      const getFiles = td.replace(handlerA, "getFiles")
      const path = "foo"
      td.when(getFiles(path, undefined)).thenResolve([
        { path: "c", hash: "c" },
        { path: "b", hash: "b" },
        { path: "d", hash: "d" },
      ])
      const version = await handlerA.getTreeVersion(path, null)
      expect(version.files).to.eql(["b", "c", "d"])
    })

    it("should respect the include field, if specified", async () => {
      const includeProjectRoot = getDataDir("test-projects", "include-field")
      const includeGarden = await makeTestGarden(includeProjectRoot)
      const module = await includeGarden.resolveModuleConfig("module-a")
      const includeHandler = new GitHandler(includeGarden.gardenDirPath)

      const withInclude = await includeHandler.getTreeVersion(module.path, module.include!)
      const withoutInclude = await includeHandler.getTreeVersion(module.path, null)

      expect(withInclude).to.eql({
        contentHash: "6413e73ab3",
        files: [
          resolve(module.path, "yes.txt"),
        ],
      })

      expect(withoutInclude).to.eql({
        contentHash: "80077a6c44",
        files: [
          resolve(module.path, "garden.yml"),
          resolve(module.path, "nope.txt"),
          resolve(module.path, "yes.txt"),
        ],
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const module = await gardenA.resolveModuleConfig("module-b")

      const version = {
        contentHash: "qwerty",
        files: [],
      }
      handlerA.setTestVersion(module.path, version)

      const result = await handlerA.resolveTreeVersion(module.path, null)
      expect(result).to.eql(version)
    })
  })

  describe("resolveTreeVersion", () => {
    it("should return the version from a version file if it exists", async () => {
      const module = await gardenA.resolveModuleConfig("module-a")
      const result = await handlerA.resolveTreeVersion(module.path, null)

      expect(result).to.eql({
        contentHash: "1234567890",
        files: [],
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const module = await gardenA.resolveModuleConfig("module-b")

      const version = {
        contentHash: "qwerty",
        files: [],
      }
      handlerA.setTestVersion(module.path, version)

      const result = await handlerA.resolveTreeVersion(module.path, null)
      expect(result).to.eql(version)
    })
  })

  describe("getVersionString", () => {
    let moduleABefore: ModuleConfig
    let moduleAAfter: ModuleConfig
    let moduleBBefore: ModuleConfig
    let moduleBAfter: ModuleConfig

    before(async () => {
      const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))

      moduleABefore = await templateGarden.resolveModuleConfig("module-a") // uses the echo-string variable
      moduleBBefore = await templateGarden.resolveModuleConfig("module-b") // does not use the echo-string variable

      const configContext = new ModuleConfigContext(
        templateGarden,
        templateGarden.environmentName,
        await templateGarden.resolveProviders(),
        { ...templateGarden.variables, "echo-string": "something else" },
        await templateGarden.getRawModuleConfigs(),
      )

      moduleAAfter = await templateGarden.resolveModuleConfig("module-a", { configContext })
      moduleBAfter = await templateGarden.resolveModuleConfig("module-b", { configContext })
    })

    it("should return a different version for a module when a variable used by it changes", async () => {
      const moduleABeforeVersion = getVersionString(moduleABefore, [])
      const moduleAAfterVersion = getVersionString(moduleAAfter, [])

      expect(moduleABeforeVersion).to.not.eql(moduleAAfterVersion)
    })

    it("should return the same version for a module when a variable not used by it changes", async () => {
      const moduleBBeforeVersion = getVersionString(moduleBBefore, [])
      const moduleBAfterVersion = getVersionString(moduleBAfter, [])

      expect(moduleBBeforeVersion).to.eql(moduleBAfterVersion)
    })
  })

  context("internal helpers", () => {

    const namedVersionA = {
      name: "module-a",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersionB = {
      name: "module-b",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersionC = {
      name: "module-c",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersions = [namedVersionA, namedVersionB, namedVersionC]

    describe("hashVersions", () => {
      it("is stable with respect to key order in moduleConfig", async () => {
        const originalConfig = await gardenA.resolveModuleConfig("module-a")
        const stirredConfig = cloneDeep(originalConfig)
        delete stirredConfig.name
        stirredConfig.name = originalConfig.name

        expect(getVersionString(originalConfig, namedVersions))
          .to.eql(getVersionString(stirredConfig, namedVersions))
      })

      it("is stable with respect to named version order", async () => {
        const config = await gardenA.resolveModuleConfig("module-a")

        expect(getVersionString(config, [namedVersionA, namedVersionB, namedVersionC]))
          .to.eql(getVersionString(config, [namedVersionB, namedVersionA, namedVersionC]))
      })
    })
  })

  describe("resolveVersion", () => {
    it("should return module version if there are no dependencies", async () => {
      const module = await gardenA.resolveModuleConfig("module-a")
      const result = await handlerA.resolveVersion(module, [])

      expect(result).to.eql({
        versionString: getVersionString(module, [{ ...versionA, name: "module-a" }]),
        dependencyVersions: {},
        files: [],
      })
    })

    it("should hash together the version of the module and all dependencies", async () => {
      const [moduleA, moduleB, moduleC] = await gardenA.resolveModuleConfigs(["module-a", "module-b", "module-c"])

      const versionStringB = "qwerty"
      const versionB = {
        contentHash: versionStringB,
        files: [],
      }
      handlerA.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        contentHash: versionStringC,
        files: [],
      }
      handlerA.setTestVersion(moduleC.path, versionC)

      expect(await handlerA.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: getVersionString(moduleC, [
          { ...versionA, name: "module-a" },
          { ...versionB, name: "module-b" },
          { ...versionC, name: "module-c" },
        ]),
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
        files: [],
      })
    })

    it("should not include module's garden.yml in version file list", async () => {
      const moduleConfig = await gardenA.resolveModuleConfig("module-a")
      const version = await handlerA.resolveVersion(moduleConfig, [])
      expect(version.files).to.not.include(moduleConfig.configPath!)
    })

    it("should be affected by changes to the module's config", async () => {
      const moduleConfig = await gardenA.resolveModuleConfig("module-a")
      const version1 = await handlerA.resolveVersion(moduleConfig, [])
      moduleConfig.name = "foo"
      const version2 = await handlerA.resolveVersion(moduleConfig, [])
      expect(version1).to.not.eql(version2)
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModuleConfig("module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await garden.vcs.resolveVersion(moduleConfigA1, [])
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await garden.vcs.resolveVersion(moduleConfigA1, [])
        expect(version1).to.eql(version2)
      } finally {
        await writeFile(configPath, orgConfig)
      }
    })
  })
})

describe("writeTreeVersionFile", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("writeVersionFile", () => {
    it("should write relative paths for files", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [
          join(tmpPath, "some", "file"),
        ],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: [
          "some/file",
        ],
      })
    })

    it("should handle relative paths in input", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [
          "some/file",
        ],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: [
          "some/file",
        ],
      })
    })

    it("should normalize Windows-style paths to POSIX-style", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [
          `some\\file`,
        ],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: [
          "some/file",
        ],
      })
    })
  })
})
