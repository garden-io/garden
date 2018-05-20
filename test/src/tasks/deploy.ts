import { expect } from "chai"
import { resolve } from "path"
import * as td from "testdouble"
import {
  dataDir,
  makeTestGarden,
  stubModuleAction,
} from "../../helpers"
import { DeployTask } from "../../../src/tasks/deploy"

describe("DeployTask", () => {
  afterEach(() => {
    td.reset()
  })

  it("should fully resolve templated strings on the service before deploying", async () => {
    process.env.TEST_VARIABLE = "banana"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-templated"))
    const ctx = garden.pluginContext
    await ctx.setConfig(["project", "my", "variable"], "OK")

    const serviceA = await ctx.getService("service-a")
    const serviceB = await ctx.getService("service-b")

    const task = new DeployTask(ctx, serviceB, false, false)
    let actionParams: any = {}

    stubModuleAction(
      garden, "generic", "test-plugin", "getServiceStatus",
      async () => ({}),
    )

    stubModuleAction(
      garden, "generic", "test-plugin", "deployService",
      async (params) => { actionParams = params },
    )

    await task.process()

    const { versionString } = await serviceA.module.getVersion()

    expect(actionParams.service.config).to.eql({
      name: "service-b",
      command: `echo ${versionString}`,
      dependencies: ["service-a"],
    })
    expect(actionParams.runtimeContext.dependencies).to.eql({
      "service-a": {
        outputs: {},
        version: versionString,
      },
    })
  })
})
