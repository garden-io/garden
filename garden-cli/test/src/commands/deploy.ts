import { join } from "path"
import { Garden } from "../../../src/garden"
import { DeployCommand } from "../../../src/commands/deploy"
import { expect } from "chai"
import { parseContainerModule } from "../../../src/plugins/container"
import { buildGenericModule } from "../../../src/plugins/generic"
import {
  PluginFactory,
} from "../../../src/types/plugin/plugin"
import {
  DeployServiceParams,
  GetServiceStatusParams,
} from "../../../src/types/plugin/params"
import { ServiceState, ServiceStatus } from "../../../src/types/service"
import { taskResultOutputs } from "../../helpers"

const testProvider: PluginFactory = () => {
  const testStatuses: { [key: string]: ServiceStatus } = {
    "service-a": {
      state: "ready",
      endpoints: [{
        domain: "test-project-b.local.app.garden",
        hostname: "service-a.test-project-b.local.app.garden",
        path: "/path-a",
        port: 32000,
        protocol: "http",
        subdomain: "service-a",
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
      container: {
        parseModule: parseContainerModule,
        buildModule: buildGenericModule,
        deployService,
        getServiceStatus,
      },
    },
  }
}

testProvider.pluginName = "test-plugin"

describe("DeployCommand", () => {
  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

  // TODO: Verify that services don't get redeployed when same version is already deployed.
  // TODO: Test with --watch flag

  it("should build and deploy all modules in a project", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.getPluginContext()
    const command = new DeployCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        service: undefined,
      },
      opts: {
        watch: false,
        force: false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "build.module-c": {},
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
      "deploy.service-c": { version: "1", state: "ready" },
      "deploy.service-d": { version: "1", state: "ready" },
    })
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
    const ctx = garden.getPluginContext()
    const command = new DeployCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        service: ["service-b"],
      },
      opts: {
        watch: false,
        force: false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true, buildLog: "A" },
      "build.module-b": { fresh: true, buildLog: "B" },
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
    })
  })
})
