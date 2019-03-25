import {
  VcsHandler,
  NEW_MODULE_VERSION,
  TreeVersions,
  TreeVersion,
  getVersionString,
  getLatestDirty,
} from "../../../../src/vcs/base"
import { projectRootA, makeTestGardenA, makeTestGarden, getDataDir } from "../../../helpers"
import { expect } from "chai"
import { cloneDeep } from "lodash"
import { Garden } from "../../../../src/garden"
import { ModuleConfigContext } from "../../../../src/config/config-context"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testVersions: TreeVersions = {}

  async getLatestCommit() {
    return NEW_MODULE_VERSION
  }

  async getDirtyFiles() {
    return []
  }

  async getTreeVersion(path: string) {
    return this.testVersions[path] || {
      latestCommit: NEW_MODULE_VERSION,
      dirtyTimestamp: null,
    }
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
  let handler: TestVcsHandler
  let garden: Garden

  // note: module-a has a version file with this content
  const versionA = {
    latestCommit: "1234567890",
    dirtyTimestamp: null,
  }

  beforeEach(async () => {
    handler = new TestVcsHandler(projectRootA)
    garden = await makeTestGardenA()
  })

  describe("resolveTreeVersion", () => {
    it("should return the version from a version file if it exists", async () => {
      const module = await garden.resolveModuleConfig("module-a")
      const result = await handler.resolveTreeVersion(module.path)

      expect(result).to.eql({
        latestCommit: "1234567890",
        dirtyTimestamp: null,
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const module = await garden.resolveModuleConfig("module-b")

      const version = {
        latestCommit: "qwerty",
        dirtyTimestamp: 456,
      }
      handler.setTestVersion(module.path, version)

      const result = await handler.resolveTreeVersion(module.path)
      expect(result).to.eql(version)
    })
  })

  describe("getVersionString", () => {
    let moduleABefore
    let moduleAAfter
    let moduleBBefore
    let moduleBAfter

    before(async () => {
      const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))

      moduleABefore = await templateGarden.resolveModuleConfig("module-a") // uses the echo-string variable
      moduleBBefore = await templateGarden.resolveModuleConfig("module-b") // does not use the echo-string variable

      const moduleAAfterEnv = cloneDeep(templateGarden.environment)
      moduleAAfterEnv.variables["echo-string"] = "something else"
      const changedModuleConfigContext = new ModuleConfigContext(
        templateGarden, moduleAAfterEnv, await templateGarden.getRawModuleConfigs())

      moduleAAfter = await templateGarden.resolveModuleConfig("module-a", changedModuleConfigContext)
      moduleBAfter = await templateGarden.resolveModuleConfig("module-b", changedModuleConfigContext)
    })

    it("should return a different version for a module when a variable used by it changes", async () => {
      const moduleABeforeVersion = getVersionString(moduleABefore, [], null)
      const moduleAAfterVersion = getVersionString(moduleAAfter, [], null)

      expect(moduleABeforeVersion).to.not.eql(moduleAAfterVersion)
    })

    it("should return the same version for a module when a variable not used by it changes", async () => {
      const moduleBBeforeVersion = getVersionString(moduleBBefore, [], null)
      const moduleBAfterVersion = getVersionString(moduleBAfter, [], null)

      expect(moduleBBeforeVersion).to.eql(moduleBAfterVersion)
    })

  })

  context("internal helpers", () => {

    const namedVersionA = {
      name: "module-a",
      latestCommit: "qwerty",
      dirtyTimestamp: null,
    }

    const namedVersionB = {
      name: "module-b",
      latestCommit: "qwerty",
      dirtyTimestamp: 123,
    }

    const namedVersionC = {
      name: "module-c",
      latestCommit: "qwerty",
      dirtyTimestamp: 456,
    }

    const namedVersions = [namedVersionA, namedVersionB, namedVersionC]

    describe("hashVersions", () => {

      it("is stable with respect to key order in moduleConfig", async () => {
        const originalConfig = await garden.resolveModuleConfig("module-a")
        const stirredConfig = cloneDeep(originalConfig)
        delete stirredConfig.name
        stirredConfig.name = originalConfig.name

        expect(getVersionString(originalConfig, namedVersions, null))
          .to.eql(getVersionString(stirredConfig, namedVersions, null))
      })

      it("is stable with respect to named version order", async () => {
        const config = await garden.resolveModuleConfig("module-a")

        expect(getVersionString(config, [namedVersionA, namedVersionB, namedVersionC], null))
          .to.eql(getVersionString(config, [namedVersionB, namedVersionA, namedVersionC], null))
      })

    })

    describe("getLatestDirty", () => {

      it("returns the latest dirty timestamp if one or more versions provided have one", () => {
        expect(getLatestDirty(namedVersions)).to.eql(456)
      })

      it("returns null if none of the versions provided has a dirty has one", () => {
        expect(getLatestDirty([namedVersionA])).to.eql(null)
      })

    })

  })

  describe("resolveVersion", () => {

    it("should return module version if there are no dependencies", async () => {
      const module = await garden.resolveModuleConfig("module-a")
      const result = await handler.resolveVersion(module, [])

      expect(result).to.eql({
        versionString: getVersionString(module, [{ ...versionA, name: "module-a" }], null),
        dirtyTimestamp: null,
        dependencyVersions: {},
      })
    })

    it("should return module version if there are no dependencies and properly handle a dirty timestamp", async () => {
      const module = await garden.resolveModuleConfig("module-b")
      const latestCommit = "abcdef"
      const dirtyTimestamp = 1234
      const version = {
        latestCommit,
        dirtyTimestamp,
      }

      handler.setTestVersion(module.path, version)

      const result = await handler.resolveVersion(module, [])

      expect(result).to.eql({
        dirtyTimestamp,
        versionString: getVersionString(module, [{ ...version, name: "module-b" }], dirtyTimestamp),
        dependencyVersions: {},
      })
    })

    it("should return the dirty version if there is a single one", async () => {
      const [moduleA, moduleB, moduleC] = await garden.resolveModuleConfigs(["module-a", "module-b", "module-c"])

      const dirtyTimestamp = 123

      const versionB = {
        latestCommit: "qwerty",
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        dirtyTimestamp,
        latestCommit: versionStringC,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        dirtyTimestamp,
        versionString: getVersionString(moduleC, [
          { ...versionA, name: "module-a" },
          { ...versionB, name: "module-b" },
          { ...versionC, name: "module-c" },
        ], 123),
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it("should return the latest dirty version if there are multiple", async () => {
      const [moduleA, moduleB, moduleC] = await garden.resolveModuleConfigs(["module-a", "module-b", "module-c"])

      const latestDirty = 456

      const versionB = {
        latestCommit: "qwerty",
        dirtyTimestamp: latestDirty,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        latestCommit: versionStringC,
        dirtyTimestamp: 123,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: getVersionString(moduleC, [
          { ...versionA, name: "module-a" },
          { ...versionB, name: "module-b" },
          { ...versionC, name: "module-c" },
        ], latestDirty),
        dirtyTimestamp: latestDirty,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it("should hash together the version of the module and all dependencies if none are dirty", async () => {
      const [moduleA, moduleB, moduleC] = await garden.resolveModuleConfigs(["module-a", "module-b", "module-c"])

      const versionStringB = "qwerty"
      const versionB = {
        latestCommit: versionStringB,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        latestCommit: versionStringC,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: getVersionString(moduleC, [
          { ...versionA, name: "module-a" },
          { ...versionB, name: "module-b" },
          { ...versionC, name: "module-c" },
        ], null),
        dirtyTimestamp: null,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it(
      "should hash together the dirty versions and add the timestamp if there are multiple with same timestamp",
      async () => {

        const [moduleA, moduleB, moduleC] = await garden.resolveModuleConfigs(["module-a", "module-b", "module-c"])

        const dirtyTimestamp = 1234

        const versionStringB = "qwerty"
        const versionB = {
          dirtyTimestamp,
          latestCommit: versionStringB,
        }
        handler.setTestVersion(moduleB.path, versionB)

        const versionStringC = "asdfgh"
        const versionC = {
          dirtyTimestamp,
          latestCommit: versionStringC,
        }
        handler.setTestVersion(moduleC.path, versionC)

        expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
          versionString: getVersionString(moduleC, [
            { ...versionA, name: "module-a" },
            { ...versionB, name: "module-b" },
            { ...versionC, name: "module-c" },
          ], dirtyTimestamp),
          dirtyTimestamp,
          dependencyVersions: {
            "module-a": versionA,
            "module-b": versionB,
          },
        })
      })
  })
})
