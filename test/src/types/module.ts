import { Module } from "../../../src/types/module"
import { resolve } from "path"
import { dataDir, makeTestContextA, makeTestContext } from "../../helpers"
import { expect } from "chai"
import { omitUndefined } from "../../../src/util"
import { loadConfig } from "../../../src/types/config"

const modulePathA = resolve(dataDir, "test-project-a", "module-a")

describe("Module", () => {
  describe("factory", () => {
    it("should create a module instance with the given config", async () => {
      const ctx = await makeTestContextA()
      const config = await loadConfig(ctx.projectRoot, modulePathA)
      const module = new Module(ctx, config.module!)

      expect(module.name).to.equal(config.module!.name)
      expect(omitUndefined(module.config)).to.eql(config.module)
    })
  })

  describe("resolveConfig", () => {
    it("should resolve template strings", async () => {
      const ctx = await makeTestContext(resolve(dataDir, "test-project-templated"))
      const modulePath = resolve(ctx.projectRoot, "module-a")

      const config = await loadConfig(ctx.projectRoot, modulePath)
      const module = new Module(ctx, config.module!)

      const resolved = await module.resolveConfig()

      expect(module.name).to.equal(config.module!.name)
      expect(resolved.config).to.eql({
        allowPush: true,
        build: { command: "echo OK", dependencies: [] },
        name: "module-a",
        path: modulePath,
        services: [
          // service template strings are resolved later
          { name: "service-a", command: "echo \${local.env.TEST_VARIABLE}", dependencies: [] },
        ],
        test: [
          { name: "unit", command: ["echo", "OK"], dependencies: [], variables: {} },
        ],
        type: "generic",
        variables: {},
      })
    })
  })
})
