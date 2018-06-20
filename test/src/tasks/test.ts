import { expect } from "chai"
import { resolve } from "path"
import {
  replace,
  when,
} from "testdouble"
import { TestTask } from "../../../src/tasks/test"
import { Module } from "../../../src/types/module"
import {
  NEW_MODULE_VERSION,
  TreeVersion,
} from "../../../src/vcs/base"
import {
  dataDir,
  makeTestGarden,
} from "../../helpers"

const getVersion = Module.prototype.getVersion

describe("TestTask", () => {
  let stub: any

  // remove the Module.getVersion() stub
  beforeEach(() => {
    stub = Module.prototype.getVersion
    Module.prototype.getVersion = getVersion
  })

  afterEach(() => {
    Module.prototype.getVersion = stub
  })

  it("should correctly resolve version for tests with dependencies", async () => {
    process.env.TEST_VARIABLE = "banana"

    const garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    const ctx = garden.pluginContext

    const getModuleVersion = replace(ctx, "getModuleVersion")

    when(getModuleVersion("module-a", undefined)).thenResolve(<TreeVersion>{
      versionString: "1234512345",
      latestCommit: NEW_MODULE_VERSION,
      dirtyTimestamp: null,
    })

    const dirtyTimestamp = 123456789
    const moduleBVersion: TreeVersion = {
      versionString: NEW_MODULE_VERSION + "-" + dirtyTimestamp,
      latestCommit: NEW_MODULE_VERSION,
      dirtyTimestamp,
    }

    when(getModuleVersion("module-b", undefined)).thenResolve(moduleBVersion)

    const moduleA = await ctx.getModule("module-a")
    const testConfig = moduleA.tests[0]

    const task = await TestTask.factory({
      ctx,
      module: moduleA,
      testConfig,
      force: true,
      forceBuild: false,
    })

    expect(task.version).to.eql(moduleBVersion)
  })
})
