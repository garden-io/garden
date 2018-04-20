import { join } from "path"
import { Garden } from "../../../src/garden"
import { DeployCommand } from "../../../src/commands/deploy"
import { expect } from "chai"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  PluginFactory,
} from "../../../src/types/plugin"
import { ServiceState, ServiceStatus } from "../../../src/types/service"

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
    "service-c": {
      state: "ready",
    },
  }

  const getServiceStatus = async ({ service }: GetServiceStatusParams): Promise<ServiceStatus> => {
    return testStatuses[service.name] || {}
  }

  const deployService = async ({ service }: DeployServiceParams) => {
    const newStatus = {
      version: "1",
      state: <ServiceState>"ready",
    }

    testStatuses[service.name] = newStatus

    return newStatus
  }

  return {
    moduleActions: {
      generic: { deployService, getServiceStatus },
      container: { deployService, getServiceStatus },
    },
  }
}

testProvider.pluginName = "test-plugin"

describe("commands.deploy", () => {
  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy all modules in a project", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new DeployCommand()

    const result = await command.action(
      ctx, {
        service: "",
      },
      {
        watch: false,
        force: false,
        "force-build": true,
      },
    )

    expect(result).to.eql({
      "build.module-a": { fresh: true, buildLog: "A\n" },
      "build.module-b": { fresh: true, buildLog: "B\n" },
      "build.module-c": {},
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
      "deploy.service-c": { version: "1", state: "ready" },
    })
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.pluginContext
    const command = new DeployCommand()

    const result = await command.action(
      ctx,
      {
        service: "service-b",
      },
      {
        watch: false,
        force: false,
        "force-build": true,
      },
    )

    expect(result).to.eql({
      "build.module-a": { fresh: true, buildLog: "A\n" },
      "build.module-b": { fresh: true, buildLog: "B\n" },
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
    })
  })
})
