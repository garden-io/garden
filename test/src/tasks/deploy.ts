import { expect } from "chai"
import { resolve } from "path"
import * as td from "testdouble"
import {
  dataDir,
  makeTestGarden,
  stubPluginAction,
} from "../../helpers"
import { DeployTask } from "../../../src/tasks/deploy"

describe("DeployTask", () => {
  afterEach(() => {
    td.reset()
  })

  it("should fully resolve templated strings on the service before deploying", async () => {
    process.env.TEST_VARIABLE = "banana"
    process.env.TEST_PROVIDER_TYPE = "test-plugin-b"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-templated"))
    const ctx = garden.pluginContext
    await ctx.setConfig(["project", "my", "variable"], "OK")

    const serviceA = await ctx.getService("service-a")
    const serviceB = await ctx.getService("service-b")

    const task = new DeployTask(ctx, serviceB, false, false)
    let actionParams: any = {}

    stubPluginAction(
      garden, "test-plugin-b", "getServiceStatus",
      async () => ({}),
    )

    stubPluginAction(
      garden, "test-plugin-b", "deployService",
      async (params) => { actionParams = params },
    )

    await task.process()

    expect(actionParams.service.config).to.eql({
      command: `echo ${await serviceA.module.getVersion()}`,
      dependencies: ["service-a"],
    })
    expect(actionParams.serviceContext.dependencies).to.eql({
      "service-a": {
        outputs: {},
        version: await serviceA.module.getVersion(),
      },
    })
  })
})
