import { loadModuleConfig, Module } from "../../../src/types/module"
import { resolve } from "path"
import { dataDir, makeTestContextA, makeTestContext } from "../../helpers"
import { expect } from "chai"
import { omitUndefined } from "../../../src/util"

const modulePathA = resolve(dataDir, "test-project-a", "module-a")

describe("loadModuleConfig", () => {
  // TODO: test more cases + error cases
  it("should load and parse a module config", async () => {
    const parsed = await loadModuleConfig(modulePathA)
    expect(parsed).to.eql({
      name: "module-a",
      type: "generic",
      services: { "service-a": { dependencies: [] } },
      build: { command: "echo A", dependencies: [] },
      test: {
        unit: {
          command: ["echo", "OK"],
          dependencies: [],
          variables: {},
        },
      },
      path: modulePathA,
      version: "0",
      variables: {},
    })
  })
})

describe("Module", () => {
  describe("factory", () => {
    it("should create a module instance with the given config", async () => {
      const ctx = await makeTestContextA()
      const config = await loadModuleConfig(modulePathA)
      const module = new Module(ctx, config)

      expect(module.name).to.equal(config.name)
      expect(omitUndefined(await module.getConfig())).to.eql(config)
    })

    it("should resolve template strings", async () => {
      process.env.TEST_VARIABLE = "banana"
      process.env.TEST_PROVIDER_TYPE = "test-plugin"

      const ctx = await makeTestContext(resolve(dataDir, "test-project-templated"))
      const modulePath = resolve(ctx.projectRoot, "module-a")

      const config = await loadModuleConfig(modulePath)
      const module = new Module(ctx, config)

      expect(module.name).to.equal(config.name)
      expect(await module.getConfig()).to.eql({
        build: { command: "echo OK", dependencies: [] },
        description: undefined,
        name: "module-a",
        path: modulePath,
        services:
          { "service-a": { command: "echo \${local.env.TEST_VARIABLE}", dependencies: [] } },
        test: { unit: { command: ["echo", "OK"], dependencies: [], variables: {} } },
        type: "test",
        variables: {},
        version: "0",
      })
    })
  })
})
