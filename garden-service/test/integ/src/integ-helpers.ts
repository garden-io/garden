import { resolve } from "path"
import { expect } from "chai"
import { findTasks, deleteExampleNamespaces, deleteSystemMetadataNamespace } from "../../integ-helpers"
import { examplesDir } from "../../helpers"
import { runGarden, GardenWatch, dashboardUpStep, touchFileStep, taskCompletedStep } from "../../run-garden"
import { JsonLogEntry } from "../../../src/logger/writers/json-terminal-writer"
import { getLogger } from "../../../src/logger/logger"

const voteExamplePath = resolve(examplesDir, "vote")

let testEntries: JsonLogEntry[]

describe("integ-helpers", () => {

  describe("findTasks", () => {

    const log = getLogger().placeholder()

    before(async () => {
      await deleteSystemMetadataNamespace(log)
      await deleteExampleNamespaces(log)
      testEntries = await runGarden(voteExamplePath, ["test"])
    })

    const specs = [
      { taskType: "build", key: "build.result" },
      { taskType: "deploy", key: "deploy.redis" },
      { taskType: "test", key: "test.api.unit" },
    ]

    for (const { taskType, key } of specs) {
      it(`should find a ${taskType} task`, () => {
        const found = findTasks(testEntries, key)[0]
        expect(found, `entries for ${key} not found`).to.be.ok
        const { startedIndex, completedIndex, executionTimeMs } = found
        expect([startedIndex, completedIndex, executionTimeMs]).to.not.include([null, undefined])
      })
    }

  })

  describe("runGarden", () => {

    it("should run and produce the expected output for a test command in the vote example project", async () => {
      const logEntries = await runGarden(voteExamplePath, ["test"])
      expect(logEntries.length).to.be.greaterThan(0)
      const found = findTasks(logEntries, "test.api.unit")[0]
      expect(found, "entries for not test.api.unit found").to.be.ok
      const { startedIndex, completedIndex, executionTimeMs } = found
      expect([startedIndex, completedIndex, executionTimeMs]).to.not.include([null, undefined])
    })

  })

  describe("runGardenWatch", () => {

    it("runs a command in watch mode", async () => {
      const gardenWatch = new GardenWatch(voteExamplePath, ["dev", "--hot-reload", "vote"])

      const steps = [
        dashboardUpStep(),
        touchFileStep(resolve(voteExamplePath, "services/vote/src/main.js"),
          "touch services/vote/src/main.js"),
        taskCompletedStep("hot-reload.vote", 1),
      ]

      await gardenWatch.run({ testSteps: steps, checkIntervalMs: 1000 })
    })

  })

})
