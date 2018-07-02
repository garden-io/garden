import { expect } from "chai"
import { resolve } from "path"
import {
  dataDir,
  makeTestGarden,
  stubModuleAction,
} from "../../helpers"
import { DeployTask } from "../../../src/tasks/deploy"

describe("DeployTask", () => {
  it("should fully resolve templated strings on the service before deploying", async () => {
    process.env.TEST_VARIABLE = "banana"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-templated"))
    const ctx = garden.pluginContext
    await ctx.setConfig({ key: ["project", "my", "variable"], value: "OK" })

    const serviceA = await ctx.getService("service-a")
    const serviceB = await ctx.getService("service-b")

    const task = await DeployTask.factory({ ctx, service: serviceB, force: false, forceBuild: false })
    let actionParams: any = {}

    stubModuleAction(
      garden, "test", "test-plugin", "getServiceStatus",
      async () => ({}),
    )

    stubModuleAction(
      garden, "test", "test-plugin", "deployService",
      async (params) => {
        actionParams = params
        return {}
      },
    )

    await task.process()

    const versionStringA = (await serviceA.module.getVersion()).versionString

    expect(actionParams.service.config).to.eql({
      name: "service-b",
      dependencies: ["service-a"],
      outputs: {},
      spec: {
        command: ["echo", versionStringA],
        daemon: false,
        dependencies: ["service-a"],
        endpoints: [],
        env: {},
        name: "service-b",
        outputs: {},
        ports: [],
        volumes: [],
      },
    })
    expect(actionParams.runtimeContext.dependencies).to.eql({
      "service-a": {
        outputs: {},
        version: versionStringA,
      },
    })
  })
})
