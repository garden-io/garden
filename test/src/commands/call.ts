import { join } from "path"
import { Garden } from "../../../src/garden"
import { CallCommand } from "../../../src/commands/call"
import { expect } from "chai"
import { GetServiceStatusParams, Plugin } from "../../../src/types/plugin"
import { Module } from "../../../src/types/module"
import { ServiceStatus } from "../../../src/types/service"
import nock = require("nock")

class TestProvider implements Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic", "container"]

  testStatuses: { [key: string]: ServiceStatus } = {
    "service-a": {
      state: "ready",
      endpoints: [{
        protocol: "http",
        hostname: "service-a.test-project-b.local.app.garden",
        paths: ["/path-a"],
        url: "http://service-a.test-project-b.local.app.garden:32000",
      }],
    },
    "service-c": {
      state: "ready",
    },
  }

  async getServiceStatus({ service }: GetServiceStatusParams): Promise<ServiceStatus> {
    return this.testStatuses[service.name] || {}
  }
}

describe("commands.call", () => {
  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

  beforeEach(() => {
    nock.disableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it("should find the endpoint for a service and call it with the specified path", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [() => new TestProvider()] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000")
      .get("/path-a")
      .reply(200, "bla")

    const result = await command.action(
      ctx,
      {
        serviceAndPath: "service-a/path-a",
      },
    )

    expect(result.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result.serviceName).to.equal("service-a")
    expect(result.path).to.equal("/path-a")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")

  })

  it("should error if service isn't running", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [() => new TestProvider()] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    try {
      await command.action(
        ctx,
        {
          serviceAndPath: "service-b/path-b",
        },
      )
    } catch (err) {
      expect(err.type).to.equal("runtime")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no endpoints", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [() => new TestProvider()] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    try {
      await command.action(
        ctx,
        {
          serviceAndPath: "service-c/path-c",
        },
      )
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no matching endpoints", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [() => new TestProvider()] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    try {
      await command.action(
        ctx,
        {
          serviceAndPath: "service-a/bla",
        },
      )
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })
})
