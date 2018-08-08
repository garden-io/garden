import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../src/tasks/test"
import * as td from "testdouble"
import { VcsHandler } from "../../../src/vcs/base"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

describe("TestTask", () => {
  beforeEach(async () => {
    td.replace(VcsHandler.prototype, "resolveTreeVersion", async () => ({
      latestCommit: "abcdefg1234",
      dirtyTimestamp: null,
    }))
  })

  it("should correctly resolve version for tests with dependencies", async () => {
    process.env.TEST_VARIABLE = "banana"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    const ctx = garden.getPluginContext()

    const resolveVersion = td.replace(garden, "resolveVersion")

    const version = {
      versionString: "v6fb19922cd",
      dirtyTimestamp: null,
      dependencyVersions: {
        "module-b": {
          latestCommit: "abcdefg1234",
          dirtyTimestamp: null,
        },
      },
    }

    td.when(resolveVersion("module-a", [{ name: "module-b", copy: [] }])).thenResolve(version)

    const moduleA = await ctx.getModule("module-a")
    const testConfig = moduleA.testConfigs[0]

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
