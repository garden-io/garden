import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../../src/tasks/test"
import td from "testdouble"
import { Garden } from "../../../../src/garden"
import { dataDir, makeTestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"
import { ModuleVersion } from "../../../../src/vcs/vcs"

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
    const resolveVersion = td.replace(garden, "resolveVersion")

    const versionA: ModuleVersion = {
      versionString: "v6fb19922cd",
      dependencyVersions: {
        "module-b": {
          contentHash: "abcdefg1234",
          files: [],
        },
      },
      files: [],
    }

    const versionB: ModuleVersion = {
      versionString: "abcdefg1234",
      dependencyVersions: {},
      files: [],
    }

    td.when(resolveVersion("module-a", [])).thenResolve(versionA)
    td.when(resolveVersion("module-b", [])).thenResolve(versionB)

    const moduleB = await graph.getModule("module-b")

    td.when(resolveVersion("module-a", [moduleB])).thenResolve(versionA)

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

    expect(task.version).to.eql(versionA)
  })

  describe("getDependencies", () => {
    it("should include task dependencies", async () => {
      const moduleA = await graph.getModule("module-a")
      const testConfig = moduleA.testConfigs[0]

      const task = await TestTask.factory({
        garden,
        log,
        graph,
        module: moduleA,
        testConfig,
        force: true,
        forceBuild: false,
      })

      const deps = await task.getDependencies()

      expect(deps.map((d) => d.getKey())).to.eql(["build.module-a", "deploy.service-b", "task.task-a"])
    })
  })
})
