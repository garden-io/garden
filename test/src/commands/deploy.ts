import { join } from "path"
import { GardenContext } from "../../../src/context"
import { DeployCommand } from "../../../src/commands/deploy"
import { expect } from "chai"
import { Plugin } from "../../../src/types/plugin"
import { Module } from "../../../src/types/module"
import { Service, ServiceState, ServiceStatus } from "../../../src/types/service"
import { defaultPlugins } from "../../../src/providers"

class TestProvider extends Plugin<Module> {
  name = "test-plugin"
  supportedModuleTypes = ["generic", "container"]

  testStatuses: { [key: string]: ServiceStatus } = {}

  async getServiceStatus(service: Service<Module>): Promise<ServiceStatus> {
    return this.testStatuses[service.name] || {}
  }

  async deployService(service: Service<Module>) {
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
    const ctx = new GardenContext(projectRootB, { plugins: defaultPlugins.concat([(c) => new TestProvider(c)]) })
    const command = new DeployCommand()

    const result = await command.action(
      ctx, {
        environment: "test",
        service: "",
      },
      {
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
    const ctx = new GardenContext(projectRootB, { plugins: defaultPlugins.concat([(c) => new TestProvider(c)]) })
    const command = new DeployCommand()

    const result = await command.action(
      ctx,
      {
        environment: "test",
        service: "service-b",
      },
      {
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
