import { VcsHandler, NEW_MODULE_VERSION, TreeVersions, TreeVersion } from "../../../src/vcs/base"
import { projectRootA, makeTestContextA } from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"
import { expect } from "chai"

class TestVcsHandler extends VcsHandler {
  private testVersions: TreeVersions = {}

  async getTreeVersion(paths: string[]) {
    const versionString = NEW_MODULE_VERSION
    return this.testVersions[paths[0]] || {
      versionString,
      latestCommit: versionString,
      dirtyTimestamp: null,
    }
  }

  setTestVersion(path: string, version: TreeVersion) {
    this.testVersions[path] = version
  }
}

describe("VcsHandler", () => {
  let handler: TestVcsHandler
  let ctx: PluginContext

  beforeEach(async () => {
    handler = new TestVcsHandler(projectRootA)
    ctx = await makeTestContextA()
  })

  describe("resolveVersion", () => {
    it("should return module version if there are no dependencies", async () => {
      const module = await ctx.getModule("module-a")
      const versionString = "abcdef"
      const version = {
        versionString,
        latestCommit: versionString,
        dirtyTimestamp: null,
      }

      handler.setTestVersion(module.path, version)

      const result = await handler.resolveVersion(module, [])

      expect(result).to.eql({
        versionString,
        dirtyTimestamp: null,
        dependencyVersions: {},
      })
    })

    it("should return the latest dirty version if any", async () => {
      const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

      const versionStringA = "abcdef"
      const versionA = {
        versionString: versionStringA,
        latestCommit: versionStringA,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleA.path, versionA)

      const versionB = {
        versionString: "qwerty-456",
        latestCommit: "qwerty",
        dirtyTimestamp: 456,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        versionString: versionStringC,
        latestCommit: versionStringC,
        dirtyTimestamp: 123,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: "qwerty-456",
        dirtyTimestamp: 456,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it("should hash together the version of the module and all dependencies if none are dirty", async () => {
      const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

      const versionStringA = "abcdef"
      const versionA = {
        versionString: versionStringA,
        latestCommit: versionStringA,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleA.path, versionA)

      const versionStringB = "qwerty"
      const versionB = {
        versionString: versionStringB,
        latestCommit: versionStringB,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        versionString: versionStringC,
        latestCommit: versionStringC,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: "vfd75ce5f36",
        dirtyTimestamp: null,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it("should hash together the dirty versions if there are multiple with same timestamp", async () => {
      const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

      const versionStringA = "abcdef"
      const versionA = {
        versionString: versionStringA,
        latestCommit: versionStringA,
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleA.path, versionA)

      const versionStringB = "qwerty"
      const versionB = {
        versionString: versionStringB,
        latestCommit: versionStringB,
        dirtyTimestamp: 1234,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        versionString: versionStringC,
        latestCommit: versionStringC,
        dirtyTimestamp: 1234,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: "vcfa6d28ec5",
        dirtyTimestamp: 1234,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })
  })
})
