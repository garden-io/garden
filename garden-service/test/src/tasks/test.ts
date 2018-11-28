import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../src/tasks/test"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { dataDir, makeTestGarden } from "../../helpers"
import { LogEntry } from "../../../src/logger/log-entry"

describe("TestTask", () => {
  let garden: Garden
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    log = garden.log
  })

  it("should correctly resolve version for tests with dependencies", async () => {
    process.env.TEST_VARIABLE = "banana"

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

    const moduleB = await garden.getModule("module-b")

    td.when(resolveVersion("module-a", [moduleB])).thenResolve(version)

    const moduleA = await garden.getModule("module-a")
    const testConfig = moduleA.testConfigs[0]

    const task = await TestTask.factory({
      garden,
      log,
      module: moduleA,
      testConfig,
      force: true,
      forceBuild: false,
    })

    expect(task.version).to.eql(version)
  })
})
