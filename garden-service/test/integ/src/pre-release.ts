import execa = require("execa")
import { expect } from "chai"
import { resolve } from "path"
import * as mlog from "mocha-logger"
import replace from "replace-in-file"
import { examplesDir } from "../../helpers"
import {
  changeFileStep,
  commandReloadedStep,
  dashboardUpStep,
  GardenWatch,
  runGarden,
  taskCompletedStep,
  waitingForChangesStep,
} from "../../run-garden"
import {
  deleteExampleNamespaces,
  parsedArgs,
  searchLog,
  removeExampleDotGardenDirs,
} from "../../integ-helpers"

const prereleaseSequences = ["demo-project", "hello-world", "tasks", "vote-helm", "remote-sources"]
const sequencesToRun = parsedArgs["only"] ? [parsedArgs["only"]] : prereleaseSequences

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command

describe("PreReleaseTests", () => {
  const demoProjectPath = resolve(examplesDir, "demo-project")

  before(async () => {
    mlog.log("deleting .garden folders")
    await removeExampleDotGardenDirs()
  })

  after(async () => {
    mlog.log("checking out example project directories to HEAD")
    await execa("git", ["checkout", examplesDir])
  })

  if (sequencesToRun.includes("demo-project")) {
    describe("demo-project: top-level sanity checks", () => {
      it("runs the validate command", async () => {
        await runGarden(demoProjectPath, ["validate"])
      })

      it("runs the deploy command", async () => {
        const logEntries = await runGarden(demoProjectPath, ["deploy"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("runs the test command", async () => {
        const logEntries = await runGarden(demoProjectPath, ["test"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("runs the dev command", async () => {
        const gardenWatch = new GardenWatch(demoProjectPath, ["dev"])

        const testSteps = [
          taskCompletedStep("deploy.backend", 1),
          waitingForChangesStep(),
          changeFileStep(resolve(demoProjectPath, "backend/webserver/main.go"),
            "change app code in backend service"),
          taskCompletedStep("deploy.backend", 2),
          changeFileStep(resolve(demoProjectPath, "backend/garden.yml"),
            "change garden.yml in backend service"),
          commandReloadedStep(),
        ]

        await gardenWatch.run({ testSteps })
      })

      after(async () => {
        await deleteExampleNamespaces(["demo-project"])
      })
    })
  }

  if (sequencesToRun.includes("tasks")) {
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
        await deleteExampleNamespaces(["tasks"])
      })
    })
  }

  if (sequencesToRun.includes("hot-reload")) {
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
        await deleteExampleNamespaces(["hot-reload"])
      })
    })
  }

  if (sequencesToRun.includes("vote-helm")) {
    describe("vote-helm: helm & dependency calculations", () => {

      it("runs the dev command", async () => {
        const voteHelmProjectPath = resolve(examplesDir, "vote-helm")
        const gardenWatch = new GardenWatch(voteHelmProjectPath, ["dev"])

        const testSteps = [
          waitingForChangesStep(),
          changeFileStep(resolve(voteHelmProjectPath, "api-image/app.py"), "change api-image/app.py"),
          taskCompletedStep("build.api-image", 2),
          taskCompletedStep("build.api", 2),
          taskCompletedStep("deploy.api", 2),
          taskCompletedStep("deploy.vote", 2),
        ]

        await gardenWatch.run({ testSteps })

      })

      after(async () => {
        await deleteExampleNamespaces(["vote-helm"])
      })
    })
  }

  if (sequencesToRun.includes("remote-sources")) {
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

      after(async () => {
        await deleteExampleNamespaces(["remote-sources"])
      })
    })
  }

})
