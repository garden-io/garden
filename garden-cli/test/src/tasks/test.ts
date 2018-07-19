import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../src/tasks/test"
import * as td from "testdouble"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

describe("TestTask", () => {
  it("should correctly resolve version for tests with dependencies", async () => {
    process.env.TEST_VARIABLE = "banana"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    const ctx = garden.pluginContext

    const resolveVersion = td.replace(ctx, "resolveVersion")

    const version = {
      versionString: "vd54c4e0fd7",
      dirtyTimestamp: null,
      dependencyVersions: {
        "module-b": {
          latestCommit: "8b8a6bdecf",
          dirtyTimestamp: null,
        },
      },
    }

    td.when(resolveVersion("module-a", ["module-b"])).thenResolve(version)

    const moduleA = await ctx.getModule("module-a")
    const testConfig = moduleA.tests[0]

    const task = await TestTask.factory({
      ctx,
      module: moduleA,
      testConfig,
      force: true,
      forceBuild: false,
    })

    expect(task.version).to.eql(version)
  })
})
