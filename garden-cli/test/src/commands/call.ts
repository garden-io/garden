import { join } from "path"
import { Garden } from "../../../src/garden"
import { CallCommand } from "../../../src/commands/call"
import { expect } from "chai"
import { parseContainerModule } from "../../../src/plugins/container"
import { PluginFactory } from "../../../src/types/plugin/plugin"
import { GetServiceStatusParams } from "../../../src/types/plugin/params"
import { ServiceStatus } from "../../../src/types/service"
import nock = require("nock")

const testProvider: PluginFactory = () => {
  const testStatuses: { [key: string]: ServiceStatus } = {
    "service-a": {
      state: "ready",
      endpoints: [{
        protocol: "http",
        hostname: "service-a.test-project-b.local.app.garden",
        paths: ["/path-a"],
        url: "http://service-a.test-project-b.local.app.garden:32000",
      }],
    },
    "service-b": {
      state: "ready",
      endpoints: [{
        protocol: "http",
        hostname: "service-b.test-project-b.local.app.garden",
        paths: ["/"],
        url: "http://service-b.test-project-b.local.app.garden:32000",
      }],
    },
    "service-c": {
      state: "ready",
    },
  }

  const getServiceStatus = async (params: GetServiceStatusParams): Promise<ServiceStatus> => {
    return testStatuses[params.service.name] || {}
  }

  return {
    moduleActions: {
      container: { parseModule: parseContainerModule, getServiceStatus },
    },
  }
}

testProvider.pluginName = "test-plugin"

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
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000")
      .get("/path-a")
      .reply(200, "bla")

    const { result } = await command.action(
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

  it("should default to the path '/' if that is exposed if no path is requested", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000")
      .get("/path-a")
      .reply(200, "bla")

    const { result } = await command.action(
      ctx,
      {
        serviceAndPath: "service-a",
      },
    )

    expect(result.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result.serviceName).to.equal("service-a")
    expect(result.path).to.equal("/path-a")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should otherwise use the first defined endpoint if no path is requested", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    nock("http://service-b.test-project-b.local.app.garden:32000")
      .get("/")
      .reply(200, "bla")

    const { result } = await command.action(
      ctx,
      {
        serviceAndPath: "service-b",
      },
    )

    expect(result.url).to.equal("http://service-b.test-project-b.local.app.garden:32000/")
    expect(result.serviceName).to.equal("service-b")
    expect(result.path).to.equal("/")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should error if service isn't running", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new CallCommand()

    try {
      await command.action(
        ctx,
        {
          serviceAndPath: "service-d/path-d",
        },
      )
    } catch (err) {
      expect(err.type).to.equal("runtime")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no endpoints", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
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
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
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
