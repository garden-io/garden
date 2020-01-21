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
import td from "testdouble"
import tmp from "tmp-promise"
import { realpath, readFile, writeFile } from "fs-extra"
import { GARDEN_VERSIONFILE_NAME } from "../../../../src/constants"
import { defaultDotIgnoreFiles } from "../../../../src/util/fs"
import { LogEntry } from "../../../../src/logger/log-entry"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testVersions: TreeVersions = {}

  async getRepoRoot() {
    return "/foo"
  }

  async getFiles() {
    return []
  }

  async getOriginName() {
    return undefined
  }

  async getTreeVersion(log: LogEntry, moduleConfig: ModuleConfig) {
    return this.testVersions[moduleConfig.path] || super.getTreeVersion(log, moduleConfig)
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
    handlerA = new TestVcsHandler(projectRootA, defaultDotIgnoreFiles)
    gardenA = await makeTestGardenA()
  })

  describe("getTreeVersion", () => {
    it("should sort the list of files in the returned version", async () => {
      const getFiles = td.replace(handlerA, "getFiles")
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      td.when(
        getFiles({
          log: gardenA.log,
          path: moduleConfig.path,
          include: undefined,
          exclude: undefined,
          pathDescription: "module root",
        })
      ).thenResolve([
        { path: "c", hash: "c" },
        { path: "b", hash: "b" },
        { path: "d", hash: "d" },
      ])
      const version = await handlerA.getTreeVersion(gardenA.log, moduleConfig)
      expect(version.files).to.eql(["b", "c", "d"])
    })

    it("should not include the module config file in the file list", async () => {
      const getFiles = td.replace(handlerA, "getFiles")
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      td.when(
        getFiles({
          log: gardenA.log,
          path: moduleConfig.path,
          include: undefined,
          exclude: undefined,
          pathDescription: "module root",
        })
      ).thenResolve([
        { path: moduleConfig.configPath, hash: "c" },
        { path: "b", hash: "b" },
        { path: "d", hash: "d" },
      ])
      const version = await handlerA.getTreeVersion(gardenA.log, moduleConfig)
      expect(version.files).to.eql(["b", "d"])
    })

    it("should respect the include field, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModuleConfig(garden.log, "module-a")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(gardenA.log, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should respect the exclude field, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModuleConfig(garden.log, "module-b")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(garden.log, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should respect both include and exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModuleConfig(garden.log, "module-c")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(garden.log, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModuleConfig(garden.log, "module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await garden.vcs.getTreeVersion(garden.log, moduleConfigA1)
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await garden.vcs.getTreeVersion(garden.log, moduleConfigA1)
        expect(version1).to.eql(version2)
      } finally {
        await writeFile(configPath, orgConfig)
      }
    })
  })

  describe("resolveTreeVersion", () => {
    it("should return the version from a version file if it exists", async () => {
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      const result = await handlerA.resolveTreeVersion(gardenA.log, moduleConfig)

      expect(result).to.eql({
        contentHash: "1234567890",
        files: [],
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-b")

      const version = {
        contentHash: "qwerty",
        files: [],
      }
      handlerA.setTestVersion(moduleConfig.path, version)

      const result = await handlerA.resolveTreeVersion(gardenA.log, moduleConfig)
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

      // uses the echo-string variable
      moduleABefore = await templateGarden.resolveModuleConfig(templateGarden.log, "module-a")
      // does not use the echo-string variable
      moduleBBefore = await templateGarden.resolveModuleConfig(templateGarden.log, "module-b")

      const configContext = new ModuleConfigContext(
        templateGarden,
        await templateGarden.resolveProviders(),
        { ...templateGarden.variables, "echo-string": "something else" },
        await templateGarden.getRawModuleConfigs()
      )

      moduleAAfter = await templateGarden.resolveModuleConfig(templateGarden.log, "module-a", {
        configContext,
      })
      moduleBAfter = await templateGarden.resolveModuleConfig(templateGarden.log, "module-b", {
        configContext,
      })
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
        const originalConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
        const stirredConfig = cloneDeep(originalConfig)
        delete stirredConfig.name
        stirredConfig.name = originalConfig.name

        expect(getVersionString(originalConfig, namedVersions)).to.eql(getVersionString(stirredConfig, namedVersions))
      })

      it("is stable with respect to named version order", async () => {
        const config = await gardenA.resolveModuleConfig(gardenA.log, "module-a")

        expect(getVersionString(config, [namedVersionA, namedVersionB, namedVersionC])).to.eql(
          getVersionString(config, [namedVersionB, namedVersionA, namedVersionC])
        )
      })

      it("should be stable between runtimes", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        // fixed-version-hashes-1 expects this var to be set
        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const config = await garden.resolveModuleConfig(garden.log, "module-a")

        const fixedVersionString = "v-748612a7c4"
        expect(getVersionString(config, [namedVersionA, namedVersionB, namedVersionC])).to.eql(fixedVersionString)

        delete process.env.TEST_ENV_VAR
      })
    })
  })

  describe("resolveVersion", () => {
    it("should return module version if there are no dependencies", async () => {
      const module = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      const result = await handlerA.resolveVersion(gardenA.log, module, [])

      expect(result).to.eql({
        versionString: getVersionString(module, [{ ...versionA, name: "module-a" }]),
        dependencyVersions: {},
        files: [],
      })
    })

    it("should hash together the version of the module and all dependencies", async () => {
      const [moduleA, moduleB, moduleC] = await gardenA["resolveModuleConfigs"](gardenA.log, [
        "module-a",
        "module-b",
        "module-c",
      ])

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

      expect(await handlerA.resolveVersion(gardenA.log, moduleC, [moduleA, moduleB])).to.eql({
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
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      const version = await handlerA.resolveVersion(gardenA.log, moduleConfig, [])
      expect(version.files).to.not.include(moduleConfig.configPath!)
    })

    it("should be affected by changes to the module's config", async () => {
      const moduleConfig = await gardenA.resolveModuleConfig(gardenA.log, "module-a")
      const version1 = await handlerA.resolveVersion(gardenA.log, moduleConfig, [])
      moduleConfig.name = "foo"
      const version2 = await handlerA.resolveVersion(gardenA.log, moduleConfig, [])
      expect(version1).to.not.eql(version2)
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModuleConfig(garden.log, "module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await garden.vcs.resolveVersion(garden.log, moduleConfigA1, [])
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await garden.vcs.resolveVersion(garden.log, moduleConfigA1, [])
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
        files: [join(tmpPath, "some", "file")],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })

    it("should handle relative paths in input", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: ["some/file"],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })

    it("should normalize Windows-style paths to POSIX-style", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [`some\\file`],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })
  })
})
