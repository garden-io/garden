import "../../../../../setup"
import { expect } from "chai"

import { TestGarden, dataDir, makeTestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { TaskTask } from "../../../../../../src/tasks/task"
import { emptyDir, pathExists } from "fs-extra"
import { join, resolve } from "path"
import tmp from "tmp-promise"

describe("runHelmTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let gardenTmpDir: tmp.DirectoryResult

  before(async () => {
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    gardenTmpDir = await tmp.dir({ unsafeCleanup: true })
    garden = await makeTestGarden(projectRoot, { gardenDirPath: gardenTmpDir.path })
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  after(async () => {
    await gardenTmpDir.cleanup()
  })

  it("should run a basic task", async () => {
    const task = await graph.getTask("echo-task")

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      version: task.module.version,
    })

    const result = await garden.processTasks([testTask], { throwOnError: true })

    const key = "task.echo-task"
    expect(result).to.have.property(key)
    expect(result[key]!.output.log.trim()).to.equal("ok")
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const task = await graph.getTask("artifacts-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const task = await graph.getTask("globs-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
