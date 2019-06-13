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

type ProjectName =
  "demo-project" |
  "hot-reload" |
  "hello-world" |
  "tasks" |
  "vote" |
  "vote-helm" |
  "remote-sources"

const prereleaseSequences: ProjectName[] = [
  "demo-project",
  "hot-reload",
  "hello-world",
  "tasks",
  "vote",
  "vote-helm",
  "remote-sources",
]

export const sequencesToRun = parsedArgs["only"] ? [parsedArgs["only"]] : prereleaseSequences
const env = parsedArgs["env"]

export function getProjectNamespace(project: ProjectName) {
  return `${project}-testing-${process.env.CIRCLE_BUILD_NUM || "default"}`
}

async function runWithEnv(project: ProjectName, command: string[]) {
  const dir = resolve(examplesDir, project)
  if (env) {
    command.push("--env", env)
  }
  return runGarden(dir, command)
}

function watchWithEnv(project: ProjectName, command: string[]) {
  const dir = resolve(examplesDir, project)
  if (env) {
    command.push("--env", env)
  }
  return new GardenWatch(dir, command)
}

async function initIfRemote(project: ProjectName) {
  // Assume env is remote if passed as arg
  if (env) {
    mlog.log("initing project", project)
    await runWithEnv(project, ["init"])
  }
}

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command
describe("PreReleaseTests", () => {
  const namespaces = sequencesToRun.map(p => getProjectNamespace(p))

  before(async () => {
    mlog.log("deleting .garden folders")
    await removeExampleDotGardenDirs()
  })

  after(async () => {
    mlog.log("deleting example namespaces")
    // FIXME: This should just be a fire and forget without waiting for the function to return.
    // However, it actually does wait until every namespace is deleted before returning.
    // This adds a lot of time to the test run.
    // tslint:disable-next-line: no-floating-promises
    deleteExampleNamespaces(namespaces)
    mlog.log("Checking out example project directories to HEAD")
    await execa("git", ["checkout", examplesDir])
  })

  if (sequencesToRun.includes("demo-project")) {
    describe("demo-project: top-level sanity checks", () => {
      const demoProjectPath = resolve(examplesDir, "demo-project")

      before(async () => {
        await initIfRemote("demo-project")
      })

      it("runs the validate command", async () => {
        await runWithEnv("demo-project", ["validate"])
      })

      it("runs the deploy command", async () => {
        const logEntries = await runWithEnv("demo-project", ["deploy"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("runs the test command", async () => {
        const logEntries = await runWithEnv("demo-project", ["test"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv("demo-project", ["dev"])

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
    })
  }

  if (sequencesToRun.includes("tasks")) {
    /*
    * TODO: Re-enable once this has been debugged:
    *
    * TimeoutError: Knex: Timeout acquiring a connection. The pool is probably full.
    * Are you missing a .transacting(trx) call?
    */
    describe.skip("tasks", () => {
      before(async () => {
        await initIfRemote("tasks")
      })

      it("runs the deploy command", async () => {
        const logEntries = await runWithEnv("tasks", ["deploy"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("calls the hello service to fetch the usernames populated by the ruby migration", async () => {
        /**
         * Verify that the output includes the usernames populated by the ruby-migration task.
         * The users table was created by the node-migration task.
         */
        const logEntries = await runWithEnv("tasks", ["call", "hello"])
        expect(searchLog(logEntries, /John, Paul, George, Ringo/), "expected to find populated usernames in log output")
          .to.eql("passed")
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

      it("runs the dev command with hot reloading enabled", async () => {
        const hotReloadProjectPath = resolve(examplesDir, "hot-reload")
        const gardenWatch = watchWithEnv("hot-reload", ["dev", "--hot=node-service"])

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
              const callLogEntries = await runWithEnv("hot-reload", ["call", "node-service"])
              return searchLog(callLogEntries, /Hello from Edge/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })

      })
    })
  }

  if (sequencesToRun.includes("vote-helm")) {
    describe("vote-helm: helm & dependency calculations", () => {
      const voteHelmProjectPath = resolve(examplesDir, "vote-helm")

      before(async () => {
        await initIfRemote("vote-helm")
      })

      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv("vote-helm", ["dev"])

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
    })
  }

  if (sequencesToRun.includes("vote")) {
    describe("vote: dependency calculations", () => {
      const voteProjectPath = resolve(examplesDir, "vote")

      before(async () => {
        await initIfRemote("vote")
      })

      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv("vote", ["dev"])

        const testSteps = [
          waitingForChangesStep(),
          changeFileStep(resolve(voteProjectPath, "services/api/app.py"), "change services/api/app.py"),
          taskCompletedStep("build.api", 2),
          taskCompletedStep("deploy.api", 2),
          taskCompletedStep("deploy.vote", 2),
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }

  if (sequencesToRun.includes("remote-sources")) {
    describe("remote sources", () => {
      before(async () => {
        await initIfRemote("remote-sources")
      })

      it("runs the deploy command", async () => {
        const logEntries = await runWithEnv("remote-sources", ["deploy"])
        expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
      })

      it("calls the result service to get a 200 OK response including the HTML for the result page", async () => {
        const logEntries = await runWithEnv("remote-sources", ["call", "result"])
        expect(searchLog(logEntries, /200 OK/), "expected to find '200 OK' in log output").to.eql("passed")
        expect(searchLog(logEntries, /Cats/), "expected to find 'Cats' in log output").to.eql("passed")
      })
    })
  }

})
