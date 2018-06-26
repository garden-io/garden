import { resolve } from "path"
import { dataDir, makeTestContextA, makeTestContext } from "../../helpers"
import { expect } from "chai"
import { Service } from "../../../src/types/service"

describe("Service", () => {
  describe("factory", () => {
    it("should create a Service instance with the given config", async () => {
      const ctx = await makeTestContextA()
      const module = await ctx.getModule("module-a")

      const service = await Service.factory(ctx, module, "service-a")

      expect(service.name).to.equal("service-a")
      expect(service.config).to.eql(module.services[0])
    })

    it("should resolve template strings", async () => {
      process.env.TEST_VARIABLE = "banana"
      process.env.TEST_PROVIDER_TYPE = "test-plugin"

      const ctx = await makeTestContext(resolve(dataDir, "test-project-templated"))
      await ctx.setConfig({ key: ["project", "my", "variable"], value: "OK" })

      const module = await ctx.getModule("module-a")

      const service = await Service.factory(ctx, module, "service-a")

      expect(service.config).to.eql({
        name: "service-a",
        dependencies: [],
        outputs: {},
        spec: {
          name: "service-a",
          command: ["echo", "banana"],
          daemon: false,
          dependencies: [],
          endpoints: [],
          env: {},
          outputs: {},
          ports: [],
          volumes: [],
        },
      })
    })
  })

  describe("getDependencies", () => {
    it("should return all the dependencies for a service", async () => {
      const ctx = await makeTestContextA()
      const serviceB = await ctx.getService("service-b")
      const deps = await serviceB.getDependencies()
      expect(deps.map(d => d.name)).to.eql(["service-a"])
    })
  })

  describe("getEnvVarName", () => {
    it("should translate the service name to a name appropriate for env variables", async () => {
      const ctx = await makeTestContextA()
      const serviceB = await ctx.getService("service-b")
      expect(serviceB.getEnvVarName()).to.equal("SERVICE_B")
    })
  })

  describe("resolveConfig", () => {
    it("should resolve the configuration for the service and return a new Service instance", async () => {
      process.env.TEST_PROVIDER_TYPE = "test-plugin"
      process.env.TEST_VARIABLE = "banana"

      const ctx = await makeTestContext(resolve(dataDir, "test-project-templated"))
      await ctx.setConfig({ key: ["project", "my", "variable"], value: "OK" })

      const serviceA = await ctx.getService("service-a")
      const serviceB = await ctx.getService("service-b")

      const resolved = await serviceB.resolveConfig()

      expect(resolved.config).to.eql({
        name: "service-b",
        dependencies: ["service-a"],
        outputs: {},
        spec: {
          name: "service-b",
          command: ["echo", (await serviceA.module.getVersion()).versionString],
          daemon: false,
          dependencies: ["service-a"],
          endpoints: [],
          env: {},
          outputs: {},
          ports: [],
          volumes: [],
        },
      })

      delete process.env.TEST_PROVIDER_TYPE
      delete process.env.TEST_VARIABLE
    })
  })
})
