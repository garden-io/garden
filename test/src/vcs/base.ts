import { VcsHandler, NEW_MODULE_VERSION, TreeVersions, TreeVersion } from "../../../src/vcs/base"
import { projectRootA, makeTestContextA } from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"
import { expect } from "chai"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testVersions: TreeVersions = {}

  async getTreeVersion(paths: string[]) {
    return this.testVersions[paths[0]] || {
      latestCommit: NEW_MODULE_VERSION,
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

  describe("resolveTreeVersion", () => {
    it("should return the version from a version file if it exists", async () => {
      const module = await ctx.getModule("module-a")
      const result = await handler.resolveTreeVersion(module)

      expect(result).to.eql({
        latestCommit: "1234567890",
        dirtyTimestamp: null,
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const module = await ctx.getModule("module-b")

      const version = {
        latestCommit: "qwerty",
        dirtyTimestamp: 456,
      }
      handler.setTestVersion(module.path, version)

      const result = await handler.resolveTreeVersion(module)
      expect(result).to.eql(version)
    })
  })

  describe("resolveVersion", () => {
    it("should return module version if there are no dependencies", async () => {
      const module = await ctx.getModule("module-a")
      const versionString = "abcdef"
      const version = {
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

    it("should return module version if there are no dependencies and properly handle a dirty timestamp", async () => {
      const module = await ctx.getModule("module-a")
      const latestCommit = "abcdef"
      const version = {
        latestCommit,
        dirtyTimestamp: 1234,
      }

      handler.setTestVersion(module.path, version)

      const result = await handler.resolveVersion(module, [])

      expect(result).to.eql({
        versionString: "abcdef-1234",
        dirtyTimestamp: 1234,
        dependencyVersions: {},
      })
    })

    it("should return the dirty version if there is a single one", async () => {
      const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

      // note: module-a has a version file
      const versionA = {
        latestCommit: "1234567890",
        dirtyTimestamp: null,
      }

      const versionB = {
        latestCommit: "qwerty",
        dirtyTimestamp: null,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        latestCommit: versionStringC,
        dirtyTimestamp: 123,
      }
      handler.setTestVersion(moduleC.path, versionC)

      expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
        versionString: "asdfgh-123",
        dirtyTimestamp: 123,
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
      })
    })

    it("should return the latest dirty version if there are multiple", async () => {
      const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

      // note: module-a has a version file
      const versionA = {
        latestCommit: "1234567890",
        dirtyTimestamp: null,
      }

      const versionB = {
        latestCommit: "qwerty",
        dirtyTimestamp: 456,
      }
      handler.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
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

      const versionA = {
        latestCommit: "1234567890",
        dirtyTimestamp: null,
      }

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
        versionString: "v5ff3a146d9",
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

        const [moduleA, moduleB, moduleC] = await ctx.getModules(["module-a", "module-b", "module-c"])

        const versionA = {
          latestCommit: "1234567890",
          dirtyTimestamp: null,
        }

        const versionStringB = "qwerty"
        const versionB = {
          latestCommit: versionStringB,
          dirtyTimestamp: 1234,
        }
        handler.setTestVersion(moduleB.path, versionB)

        const versionStringC = "asdfgh"
        const versionC = {
          latestCommit: versionStringC,
          dirtyTimestamp: 1234,
        }
        handler.setTestVersion(moduleC.path, versionC)

        expect(await handler.resolveVersion(moduleC, [moduleA, moduleB])).to.eql({
          versionString: "vcfa6d28ec5-1234",
          dirtyTimestamp: 1234,
          dependencyVersions: {
            "module-a": versionA,
            "module-b": versionB,
          },
        })
      })
  })
})
