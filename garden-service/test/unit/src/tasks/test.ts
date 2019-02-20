import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../../src/tasks/test"
import * as td from "testdouble"
import { Garden } from "../../../../src/garden"
import { dataDir, makeTestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"

describe("TestTask", () => {
  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    graph = await garden.getConfigGraph()
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

    const moduleB = await graph.getModule("module-b")

    td.when(resolveVersion("module-a", [moduleB])).thenResolve(version)

    const moduleA = await graph.getModule("module-a")
    const testConfig = moduleA.testConfigs[0]

    const task = await TestTask.factory({
      garden,
      graph,
      log,
      module: moduleA,
      testConfig,
      force: true,
      forceBuild: false,
    })

    expect(task.version).to.eql(version)
  })
})
