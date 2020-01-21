import { expect } from "chai"

import { TestGarden, expectError } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getHelmTestGarden } from "./common"
import { TaskTask } from "../../../../../../src/tasks/task"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"

describe("runHelmTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
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

    const key = testTask.getKey()
    const { [key]: result } = await garden.processTasks([testTask], { throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.output.log.trim()).to.equal("ok")
  })

  it("should fail if an error occurs, but store the result", async () => {
    const task = await graph.getTask("echo-task")
    task.config.spec.command = ["bork"] // this will fail

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      version: task.module.version,
    })

    await expectError(
      async () => await garden.processTasks([testTask], { throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    const actions = await garden.getActionRouter()

    // We also verify that, despite the task failing, its result was still saved.
    const result = await actions.getTaskResult({
      log: garden.log,
      task,
      taskVersion: task.module.version,
    })

    expect(result).to.exist
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
