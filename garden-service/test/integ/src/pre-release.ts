import execa = require("execa")
import { expect } from "chai"
import { resolve } from "path"
import * as mlog from "mocha-logger"
import replace = require("replace-in-file")
import { examplesDir } from "../../helpers"
import {
  changeFileStep,
  commandReloadedStep,
  dashboardUpStep,
  GardenWatch,
  runGarden,
  taskCompletedStep,
} from "../../run-garden"
import {
  deleteExampleNamespaces,
  searchLog,
  removeExampleDotGardenDirs,
  deleteSystemMetadataNamespace,
  deleteExistingNamespaces,
} from "../../integ-helpers"
import { getLogger } from "../../../src/logger/logger"

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command

describe("PreReleaseTests", () => {

  const simpleProjectPath = resolve(examplesDir, "simple-project")
  const log = getLogger().placeholder()

  before(async () => {
    mlog.log("deleting example project namespaces and .garden folders")
    await deleteSystemMetadataNamespace(log)
    await deleteExampleNamespaces(log)
    await removeExampleDotGardenDirs()
  })

  after(async () => {
    await execa("git", ["checkout", examplesDir])
  })

  describe("simple-project: top-level sanity checks", () => {

    it("runs the validate command", async () => {
      await runGarden(simpleProjectPath, ["validate"])
    })

    it("runs the deploy command", async () => {
      const logEntries = await runGarden(simpleProjectPath, ["deploy"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })

    it("runs the test command", async () => {
      const logEntries = await runGarden(simpleProjectPath, ["test"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })

    it("runs the dev command", async () => {
      const gardenWatch = new GardenWatch(simpleProjectPath, ["dev"])

      const testSteps = [
        dashboardUpStep(),
        changeFileStep(resolve(simpleProjectPath, "services/go-service/webserver/main.go"),
          "change app code in go-service"),
        taskCompletedStep("build.go-service", 2),
        taskCompletedStep("deploy.go-service", 2),
        changeFileStep(resolve(simpleProjectPath, "services/go-service/garden.yml"), "change garden.yml in go-service"),
        commandReloadedStep(),
      ]

      await gardenWatch.run({ testSteps })
    })

    after(async () => {
      await deleteExistingNamespaces(log, ["simple-project"])
    })

  })

  describe("tasks", () => {
    const tasksProjectPath = resolve(examplesDir, "tasks")

    it("runs the deploy command", async () => {
      const logEntries = await runGarden(tasksProjectPath, ["deploy"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })

    it("calls the hello service to fetch the usernames populated by the ruby migration", async () => {
      /**
       * Verify that the output includes the usernames populated by the ruby-migration task.
       * The users table was created by the node-migration task.
       */
      const logEntries = await runGarden(tasksProjectPath, ["call", "hello"])
      expect(searchLog(logEntries, /John, Paul, George, Ringo/), "expected to find populated usernames in log output")
        .to.eql("passed")
    })

    after(async () => {
      await deleteExampleNamespaces(log, ["tasks"])
    })

  })

  /*
   * TODO: Re-enable once this has been debugged:
   *
   * Got error from Kubernetes API - a container name must be specified for pod node-service-85f48587df-lvjlp,
   * choose one of: [node-service garden-rsync] or one of the init containers: [garden-sync-init]
   */
  describe.skip("hot-reload", () => {

    const hotReloadProjectPath = resolve(examplesDir, "hot-reload")

    it("runs the dev command with hot reloading enabled", async () => {
      const gardenWatch = new GardenWatch(hotReloadProjectPath, ["dev", "--hot=node-service"])

      const testSteps = [
        dashboardUpStep(),
        {
          description: "change 'Node' -> 'Edge' in node-service/app.js",
          action: async () => {
            await replace({
              files: resolve(hotReloadProjectPath, "node-service/app.js"),
              from: /Hello from Node/,
              to: "Hello from Edge",
            })
          },
        },
        {
          description: "node-service returns the updated response text",
          condition: async () => {
            const callLogEntries = await runGarden(hotReloadProjectPath, ["call", "node-service"])
            return searchLog(callLogEntries, /Hello from Edge/)
          },
        },
      ]

      await gardenWatch.run({ testSteps })

    })

    after(async () => {
      await deleteExampleNamespaces(log, ["hot-reload"])
    })

  })

  describe("vote-helm: helm & dependency calculations", () => {

    it("runs the dev command", async () => {
      const voteHelmProjectPath = resolve(examplesDir, "vote-helm")
      const gardenWatch = new GardenWatch(voteHelmProjectPath, ["dev"])

      const testSteps = [
        dashboardUpStep(),
        changeFileStep(resolve(voteHelmProjectPath, "api-image/app.py"), "change api-image/app.py"),
        taskCompletedStep("build.api-image", 2),
        taskCompletedStep("build.api", 2),
        taskCompletedStep("deploy.api", 2),
        taskCompletedStep("deploy.vote", 2),
      ]

      await gardenWatch.run({ testSteps })

    })

    after(async () => {
      await deleteExampleNamespaces(log, ["vote-helm"])
    })

  })

  describe("remote sources", () => {
    const remoteSourcesProjectPath = resolve(examplesDir, "remote-sources")

    it("runs the deploy command", async () => {
      const logEntries = await runGarden(remoteSourcesProjectPath, ["deploy"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })

    it("calls the result service to get a 200 OK response including the HTML for the result page", async () => {
      const logEntries = await runGarden(remoteSourcesProjectPath, ["call", "result"])
      expect(searchLog(logEntries, /200 OK/), "expected to find '200 OK' in log output").to.eql("passed")
      expect(searchLog(logEntries, /Cats/), "expected to find 'Cats' in log output").to.eql("passed")
    })
  })

  after(async () => {
    await deleteExampleNamespaces(log, ["remote-sources"])
  })

})
