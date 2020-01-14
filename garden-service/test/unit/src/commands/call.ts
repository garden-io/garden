import { join } from "path"
import { Garden } from "../../../../src/garden"
import { CallCommand } from "../../../../src/commands/call"
import { expect } from "chai"
import { GardenPlugin, createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { GetServiceStatusParams } from "../../../../src/types/plugin/service/getServiceStatus"
import { ServiceStatus } from "../../../../src/types/service"
import nock = require("nock")
import { configureTestModule, withDefaultGlobalOpts, dataDir, testModuleSpecSchema } from "../../../helpers"

const testStatusesA: { [key: string]: ServiceStatus } = {
  "service-a": {
    state: "ready",
    ingresses: [
      {
        hostname: "service-a.test-project-b.local.app.garden",
        path: "/path-a",
        protocol: "http",
        port: 32000,
      },
    ],
    detail: {},
  },
  "service-b": {
    state: "ready",
    ingresses: [
      {
        hostname: "service-b.test-project-b.local.app.garden",
        path: "/",
        port: 32000,
        protocol: "http",
      },
    ],
    detail: {},
  },
  "service-c": {
    state: "ready",
    detail: {},
  },
}

const testStatusesB: { [key: string]: ServiceStatus } = {
  "service-a": {
    state: "ready",
    ingresses: [
      {
        hostname: "service-a.test-project-b.local.app.garden",
        linkUrl: "https://www.example.com",
        path: "/path-a",
        protocol: "http",
        port: 32000,
      },
    ],
    detail: {},
  },
  "service-b": {
    state: "ready",
    ingresses: [
      {
        hostname: "service-b.test-project-b.local.app.garden",
        linkUrl: "https://www.example.com/hello",
        path: "/path-b",
        protocol: "http",
        port: 32000,
      },
    ],
    detail: {},
  },
}

function makeTestProvider(serviceStatuses: { [key: string]: ServiceStatus }): GardenPlugin {
  const getServiceStatus = async (params: GetServiceStatusParams): Promise<ServiceStatus> => {
    return serviceStatuses[params.service.name] || {}
  }

  return createGardenPlugin({
    name: "test-plugin",
    createModuleTypes: [
      {
        name: "test",
        docs: "Test plugin",
        schema: testModuleSpecSchema,
        handlers: {
          configure: configureTestModule,
          getServiceStatus,
        },
      },
    ],
  })
}

describe("commands.call", () => {
  const projectRootB = join(dataDir, "test-project-b")
  const pluginsA = [makeTestProvider(testStatusesA)]
  const pluginsB = [makeTestProvider(testStatusesB)]

  beforeEach(() => {
    nock.disableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  it("should find the ingress for a service and call it with the specified path", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000")
      .get("/path-a")
      .reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { serviceAndPath: "service-a/path-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result.serviceName).to.equal("service-a")
    expect(result.path).to.equal("/path-a")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should default to the path '/' if that is exposed if no path is requested", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-a.test-project-b.local.app.garden:32000")
      .get("/path-a")
      .reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { serviceAndPath: "service-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result.url).to.equal("http://service-a.test-project-b.local.app.garden:32000/path-a")
    expect(result.serviceName).to.equal("service-a")
    expect(result.path).to.equal("/path-a")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should otherwise use the first defined ingress if no path is requested", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    nock("http://service-b.test-project-b.local.app.garden:32000")
      .get("/")
      .reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { serviceAndPath: "service-b" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result.url).to.equal("http://service-b.test-project-b.local.app.garden:32000/")
    expect(result.serviceName).to.equal("service-b")
    expect(result.path).to.equal("/")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should use the linkUrl if provided", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsB })
    const log = garden.log
    const command = new CallCommand()

    nock("https://www.example.com")
      .get("/")
      .reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { serviceAndPath: "service-a" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result.url).to.equal("https://www.example.com")
    expect(result.serviceName).to.equal("service-a")
    expect(result.path).to.equal("/")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should return the path for linkUrl", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsB })
    const log = garden.log
    const command = new CallCommand()

    nock("https://www.example.com")
      .get("/hello")
      .reply(200, "bla")

    const { result } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { serviceAndPath: "service-b/path-b" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(result.url).to.equal("https://www.example.com/hello")
    expect(result.serviceName).to.equal("service-b")
    expect(result.path).to.equal("/hello")
    expect(result.response.status).to.equal(200)
    expect(result.response.data).to.equal("bla")
  })

  it("should error if service isn't running", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { serviceAndPath: "service-d/path-d" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("runtime")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no ingresses", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { serviceAndPath: "service-c/path-c" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })

  it("should error if service has no matching ingresses", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: pluginsA })
    const log = garden.log
    const command = new CallCommand()

    try {
      await command.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { serviceAndPath: "service-a/bla" },
        opts: withDefaultGlobalOpts({}),
      })
    } catch (err) {
      expect(err.type).to.equal("parameter")
      return
    }

    throw new Error("Expected error")
  })
})
