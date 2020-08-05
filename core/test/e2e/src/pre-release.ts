/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import { expect } from "chai"
import { resolve } from "path"
import mlog from "mocha-logger"
import { replaceInFile } from "replace-in-file"
import { examplesDir } from "../../helpers"
import {
  changeFileStep,
  commandReloadedStep,
  GardenWatch,
  runGarden,
  taskCompletedStep,
  waitingForChangesStep,
  sleepStep,
} from "../../run-garden"
import { deleteExampleNamespaces, parsedArgs, searchLog, removeExampleDotGardenDir } from "../../e2e-helpers"
import username from "username"

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command
describe("PreReleaseTests", () => {
  // We assume tests are running remotely in CI if env is passed, otherwise locally.
  const env = parsedArgs["env"]
  const project = parsedArgs["project"]

  if (!project) {
    throw new Error(`Must specify project name with --project parameter`)
  }

  function getProjectNamespaces() {
    const ns = `${project}-testing-${process.env.CIRCLE_BUILD_NUM || username.sync()}`
    return [ns, ns + "--metadata"]
  }

  async function runWithEnv(command: string[]) {
    const dir = resolve(examplesDir, project)
    if (env) {
      command.push("--env", env)
    }
    return runGarden(dir, command)
  }

  function watchWithEnv(command: string[]) {
    const dir = resolve(examplesDir, project)
    if (env) {
      command.push("--env", env)
    }
    return new GardenWatch(dir, command)
  }

  const namespaces = getProjectNamespaces()
  const projectPath = resolve(examplesDir, project)

  before(async () => {
    mlog.log("deleting .garden folder")
    await removeExampleDotGardenDir(projectPath)
  })

  after(async () => {
    mlog.log("deleting example namespaces")
    // FIXME: This should just be a fire and forget without waiting for the function to return.
    // However, it actually does wait until every namespace is deleted before returning.
    // This adds a lot of time to the test run.
    // tslint:disable-next-line: no-floating-promises
    deleteExampleNamespaces(namespaces)
    // Checkout changes to example dir when running locally
    if (!env) {
      mlog.log("Checking out example project directories to HEAD")
      await execa("git", ["checkout", examplesDir])
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

  if (project === "demo-project") {
    describe("demo-project", () => {
      describe("top-level sanity checks", () => {
        it("runs the dev command", async () => {
          const gardenWatch = watchWithEnv(["dev"])

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

  if (project === "hot-reload") {
    describe("hot-reload", () => {
      it("runs the dev command with hot reloading enabled", async () => {
        const hotReloadProjectPath = resolve(examplesDir, "hot-reload")
        const gardenWatch = watchWithEnv(["dev", "--hot=node-service"])

        const testSteps = [
          waitingForChangesStep(),
          sleepStep(2000),
          {
            description: "change 'Node' -> 'foo' in node-service/app.js",
            action: async () => {
              await replaceInFile({
                files: resolve(hotReloadProjectPath, "node-service/app.js"),
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
              return searchLog(callLogEntries, /Hello from foo/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })

      it("should get logs after a hot reload event", async () => {
        const gardenWatch = watchWithEnv(["dev", "--hot=node-service"])
        const hotReloadProjectPath = resolve(examplesDir, "hot-reload")

        const testSteps = [
          waitingForChangesStep(),
          {
            description: "get logs for node-service",
            condition: async () => {
              const logEntries = await runWithEnv(["logs", "node-service"])
              return searchLog(logEntries, /App started/)
            },
          },
          changeFileStep(resolve(hotReloadProjectPath, "node-service/app.js"), "change node-service/app.js"),
          {
            description: "get logs for node-service after hot reload event",
            condition: async () => {
              const logEntries = await runWithEnv(["logs", "node-service"])
              return searchLog(logEntries, /App started/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })
      it("runs the dev command with hot reloading enabled, using a post-sync command", async () => {
        const hotReloadProjectPath = resolve(examplesDir, "hot-reload-post-sync-command")
        const gardenWatch = watchWithEnv(["dev", "--hot=node-service"])

        const testSteps = [
          waitingForChangesStep(),
          sleepStep(2000),
          {
            description: "change 'Node' -> 'foo' in node-service/app.js",
            action: async () => {
              await replaceInFile({
                files: resolve(hotReloadProjectPath, "node-service/app.js"),
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
              return searchLog(callLogEntries, /Hello from foo/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })
    })
  }

  if (project === "vote-helm") {
    describe("vote-helm: helm & dependency calculations", () => {
      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv(["dev"])

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
      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv(["dev"])

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
      it("runs the dev command", async () => {
        const gardenWatch = watchWithEnv(["dev"])

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
