/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa from "execa"
import chalk from "chalk"
import { expect } from "chai"
import { resolve } from "path"
import { replaceInFile } from "replace-in-file"
import {
  changeFileStep,
  commandReloadedStep,
  GardenWatch,
  runGarden,
  taskCompletedStep,
  waitingForChangesStep,
  sleepStep,
} from "../run-garden"
import {
  projectsDir,
  deleteExampleNamespaces,
  parsedArgs,
  searchLog,
  removeExampleDotGardenDir,
  stringifyJsonLog,
} from "../helpers"
import username from "username"

function log(msg: string) {
  console.log(chalk.magentaBright(msg))
}

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command
describe("PreReleaseTests", () => {
  // We assume tests are running remotely in CI if env is passed, otherwise locally.
  const env = parsedArgs["env"]
  const project = parsedArgs["project"]

  const userId = process.env.CIRCLE_BUILD_NUM ? "ci-" + process.env.CIRCLE_BUILD_NUM : username.sync()

  if (!project) {
    throw new Error(`Must specify project name with --project parameter`)
  }

  function getProjectNamespaces() {
    const ns = `${project}-testing-${userId}`
    return [ns]
  }

  function getCommand(command: string[]) {
    command = [...command]
    if (env) {
      command.push("--env", env)
    }
    // Override the userId variable
    if (process.env.CIRCLE_BUILD_NUM) {
      command.push("--var", "userId=" + userId)
    }
    return command
  }

  async function runWithEnv(command: string[]) {
    const dir = resolve(projectsDir, project)
    return runGarden(dir, getCommand(command))
  }

  function watchWithEnv(command: string[]) {
    const dir = resolve(projectsDir, project)
    return new GardenWatch(dir, getCommand(command))
  }

  const namespaces = getProjectNamespaces()
  const projectPath = resolve(projectsDir, project)

  before(async () => {
    log("deleting .garden folder")
    await removeExampleDotGardenDir(projectPath)
    log("ready")
  })

  after(async () => {
    log("deleting example namespaces")
    await deleteExampleNamespaces(namespaces)
    // Checkout changes to example dir when running locally
    if (!env) {
      log("Checking out example project directories to HEAD")
      await execa("git", ["checkout", projectsDir])
    }
  })

  describe("top-level sanity checks", () => {
    it("runs the validate command", async () => {
      await runWithEnv(["validate"])
    })
    it("runs the build command", async () => {
      const logEntries = await runWithEnv(["build", "--force"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })
    it("runs the deploy command", async () => {
      const logEntries = await runWithEnv(["deploy"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })
    it("runs the test command", async () => {
      const logEntries = await runWithEnv(["test"])
      expect(searchLog(logEntries, /Done!/), "expected to find 'Done!' in log output").to.eql("passed")
    })
  })

  if (project === "demo-project" || project === "demo-project-modules") {
    describe("demo-project", () => {
      describe("top-level sanity checks", () => {
        it("runs the deploy command in watch mode", async () => {
          const gardenWatch = watchWithEnv(["deploy", "--watch"])

          const testSteps = [
            taskCompletedStep("deploy.backend", 1),
            waitingForChangesStep(),
            changeFileStep(resolve(projectPath, "backend/main.go"), "change app code in backend service"),
            taskCompletedStep("deploy.backend", 2),
            changeFileStep(resolve(projectPath, "backend/garden.yml"), "change garden.yml in backend service"),
            commandReloadedStep(),
          ]

          await gardenWatch.run({ testSteps })
        })
      })
    })
  }

  if (project === "vote") {
    describe("vote", () => {
      describe("top-level sanity checks", () => {
        it("runs the run-workflow command", async () => {
          const workflowName = "full-test"
          const logEntries = await runWithEnv(["run-workflow", workflowName])
          expect(
            searchLog(logEntries, new RegExp(`Workflow ${workflowName} completed successfully.`, `g`)),
            `expected to find "Workflow ${workflowName} completed successfully." in log output.`
          ).to.eql("passed")
        })
      })
    })
  }

  if (project === "tasks") {
    /*
     * TODO: Re-enable once this has been debugged:
     *
     * TimeoutError: Knex: Timeout acquiring a connection. The pool is probably full.
     * Are you missing a .transacting(trx) call?
     */
    describe.skip("tasks", () => {
      it("calls the hello service to fetch the usernames populated by the ruby migration", async () => {
        /**
         * Verify that the output includes the usernames populated by the ruby-migration task.
         * The users table was created by the node-migration task.
         */
        await runWithEnv(["deploy"])
        const logEntries = await runWithEnv(["call", "hello"])
        expect(
          searchLog(logEntries, /John, Paul, George, Ringo/),
          "expected to find populated usernames in log output"
        ).to.eql("passed")
      })
    })
  }

  if (project === "code-synchronization") {
    describe("code-synchronization", () => {
      it("runs the dev command with code-synchronization enabled", async () => {
        const currentProjectPath = resolve(projectsDir, "code-synchronization")
        const gardenWatch = watchWithEnv(["dev"])

        const testSteps = [
          waitingForChangesStep(),
          sleepStep(2000),
          {
            description: "change 'Node' -> 'foo' in node-service/app.js",
            action: async () => {
              await replaceInFile({
                files: resolve(currentProjectPath, "node-service/src/app.js"),
                from: /Hello from Node/,
                to: "Hello from foo",
              })
            },
          },
          sleepStep(2000),
          {
            description: "node-service returns the updated response text",
            condition: async () => {
              const callLogEntries = await runWithEnv(["call", "node-service"])
              console.log(callLogEntries.map((l) => stringifyJsonLog(l)).join("\n"))
              return searchLog(callLogEntries, /Hello from foo/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })

      it("should get logs after code-synchronization", async () => {
        const gardenWatch = watchWithEnv(["dev"])
        const currentProjectPath = resolve(projectsDir, "code-synchronization")

        const testSteps = [
          waitingForChangesStep(),
          {
            description: "get logs for node-service",
            condition: async () => {
              const logEntries = await runWithEnv(["logs", "node-service"])
              return searchLog(logEntries, /App started/)
            },
          },
          changeFileStep(resolve(currentProjectPath, "node-service/src/app.js"), "change node-service/src/app.js"),
          {
            description: "get logs for node-service after code-synchronization event",
            condition: async () => {
              const logEntries = await runWithEnv(["logs", "node-service"])
              return searchLog(logEntries, /App started/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }

  if (project === "vote-helm") {
    describe("vote-helm: helm & dependency calculations", () => {
      it("runs the deploy command", async () => {
        const gardenWatch = watchWithEnv(["deploy", "--watch"])

        const testSteps = [
          waitingForChangesStep(),
          changeFileStep(resolve(projectPath, "api-image/app.py"), "change api-image/app.py"),
          taskCompletedStep("build.api-image", 2),
          taskCompletedStep("build.api", 2),
          taskCompletedStep("deploy.api", 2),
          taskCompletedStep("deploy.vote", 2),
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }

  if (project === "vote") {
    describe("vote: dependency calculations", () => {
      it("runs the deploy command", async () => {
        const gardenWatch = watchWithEnv(["deploy", "--watch"])

        const testSteps = [
          waitingForChangesStep(),
          changeFileStep(resolve(projectPath, "api/app.py"), "change api/app.py"),
          taskCompletedStep("build.api", 2),
          taskCompletedStep("deploy.api", 2),
          taskCompletedStep("deploy.vote", 2),
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }

  if (project === "remote-sources") {
    describe("remote sources", () => {
      it("runs the update-remote command", async () => {
        const logEntries = await runWithEnv(["update-remote", "all"])
        const res = searchLog(logEntries, /Source already up to date/)
        expect(res, "expected to find 'Source already up to date' in log output").to.eql("passed")
      })
      it("calls the result service to get a 200 OK response including the HTML for the result page", async () => {
        const logEntries = await runWithEnv(["call", "result"])
        expect(searchLog(logEntries, /200 OK/), "expected to find '200 OK' in log output").to.eql("passed")
        expect(searchLog(logEntries, /Cats/), "expected to find 'Cats' in log output").to.eql("passed")
      })
    })
  }

  if (project === "deployment-strategies") {
    describe("deployment-strategies: top-level sanity checks", () => {
      it("runs the deploy command", async () => {
        const gardenWatch = watchWithEnv(["deploy", "--watch"])

        const testSteps = [
          taskCompletedStep("deploy.backend", 1),
          waitingForChangesStep(),
          changeFileStep(resolve(projectPath, "backend/main.go"), "change app code in backend service"),
          taskCompletedStep("deploy.backend", 2),
          changeFileStep(resolve(projectPath, "backend/garden.yml"), "change garden.yml in backend service"),
          commandReloadedStep(),
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }
})
