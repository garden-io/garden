import { Module } from "../../../src/types/module"
import { resolve } from "path"
import {
  dataDir,
  makeTestContextA,
  makeTestContext,
  makeTestGardenA,
} from "../../helpers"
import { expect } from "chai"
import { loadConfig } from "../../../src/types/config"

const getVersion = Module.prototype.getVersion
const modulePathA = resolve(dataDir, "test-project-a", "module-a")

describe("Module", () => {
  it("should create a module instance with the given config", async () => {
    const ctx = await makeTestContextA()
    const config = await loadConfig(ctx.projectRoot, modulePathA)
    const module = new Module(ctx, config.module!, [], [])

    expect(module.name).to.equal(config.module!.name)
    expect(module.config).to.eql({
      allowPush: true,
      build: {
        command: "echo A",
        dependencies: [],
      },
      description: undefined,
      name: "module-a",
      path: module.path,
      spec: {
        services: [
          {
            name: "service-a",
          },
        ],
        tests: [
          {
            command: [
              "echo",
              "OK",
            ],
            name: "unit",
          },
        ],
      },
      type: "test",
      variables: {},
    })
  })

  describe("getVersion", () => {
    let stub: any

    beforeEach(() => {
      stub = Module.prototype.getVersion
      Module.prototype.getVersion = getVersion
    })

    afterEach(() => {
      Module.prototype.getVersion = stub
    })

    it("should use cached version if available", async () => {
      const garden = await makeTestGardenA()
      const ctx = garden.pluginContext
      const config = await loadConfig(ctx.projectRoot, modulePathA)
      const module = new Module(ctx, config.module!, [], [])

      const cachedVersion = {
        versionString: "0123456789",
        latestCommit: "0123456789",
        dirtyTimestamp: null,
      }
      garden.cache.set(["moduleVersions", module.name], cachedVersion, module.getCacheContext())

      const version = await module.getVersion()

      expect(version).to.eql(cachedVersion)
    })
  })

  describe("resolveConfig", () => {
    it("should resolve template strings", async () => {
      process.env.TEST_VARIABLE = "banana"

      const ctx = await makeTestContext(resolve(dataDir, "test-project-templated"))

      const module = await ctx.getModule("module-a")
      const resolved = await module.resolveConfig()

      expect(module.name).to.equal("module-a")
      expect(resolved.config).to.eql({
        allowPush: true,
        build: { command: "echo OK", dependencies: [] },
        description: undefined,
        name: "module-a",
        path: module.path,
        type: "test",
        variables: {},

        spec: {
          buildArgs: {},
          services: [
            // service template strings are resolved later
            {
              name: "service-a",
              command: ["echo", "banana"],
              daemon: false,
              dependencies: [],
              endpoints: [],
              outputs: {},
              ports: [],
              volumes: [],
            },
          ],
          tests: [
            {
              name: "unit",
              command: ["echo", "OK"],
              dependencies: [],
              timeout: null,
              variables: {},
            },
          ],
        },
      })
    })
  })
})
