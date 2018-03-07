import { join } from "path"
import { GardenContext } from "../../../src/context"
import { DeployCommand } from "../../../src/commands/deploy"
import { expect } from "chai"
import { DeployServiceParams, GetServiceStatusParams, Plugin } from "../../../src/types/plugin"
import { Module } from "../../../src/types/module"
import { ServiceState, ServiceStatus } from "../../../src/types/service"
import { defaultPlugins } from "../../../src/plugins"

class TestProvider implements Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic", "container"]

  testStatuses: { [key: string]: ServiceStatus } = {}

  async getServiceStatus({ service }: GetServiceStatusParams): Promise<ServiceStatus> {
    return this.testStatuses[service.name] || {}
  }

  async deployService({ service }: DeployServiceParams) {
    const newStatus = {
      version: "1",
      state: <ServiceState>"ready",
    }

    this.testStatuses[service.name] = newStatus

    return newStatus
  }
}

describe("commands.deploy", () => {
  const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

  // TODO: Verify that services don't get redeployed when same version is already deployed.

  it("should build and deploy all modules in a project", async () => {
    const ctx = await GardenContext.factory(projectRootB, { plugins: defaultPlugins.concat([() => new TestProvider()]) })
    const command = new DeployCommand()

    const result = await command.action(
      ctx, {
        service: "",
      },
      {
        env: "local",
        force: false,
        "force-build": true,
      },
    )

    expect(result).to.eql({
      "build.module-a": { fresh: true, buildLog: "A\n" },
      "build.module-b": { fresh: true, buildLog: "B\n" },
      "deploy.service-a": { version: "1", state: "ready" },
      "deploy.service-b": { version: "1", state: "ready" },
      "build.module-c": {},
      "deploy.service-c": { version: "1", state: "ready" },
    })
  })

  it("should optionally build and deploy single service and its dependencies", async () => {
    const ctx = await GardenContext.factory(projectRootB, { plugins: defaultPlugins.concat([() => new TestProvider()]) })
    const command = new DeployCommand()

    const result = await command.action(
      ctx,
      {
        service: "service-b",
      },
      {
        env: "local",
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
