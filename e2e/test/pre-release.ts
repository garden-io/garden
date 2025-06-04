/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import chalk from "chalk"
import { expect } from "chai"
import { resolve } from "path"
import { replaceInFile } from "replace-in-file"
import { changeFileStep, GardenWatch, runGarden, waitingForChangesStep, sleepStep } from "../run-garden.js"
import {
  projectsDir,
  deleteExampleNamespaces,
  parsedArgs,
  searchLog,
  removeExampleDotGardenDir,
  stringifyJsonLog,
} from "../helpers.js"
import { usernameSync } from "username"
import fsExtra from "fs-extra"
const { realpath } = fsExtra

function log(msg: string) {
  // eslint-disable-next-line
  console.log(chalk.magentaBright(msg))
}

// TODO: Add test for verifying that CLI returns with an error when called with an unknown command
describe("PreReleaseTests", () => {
  // We assume tests are running remotely in CI if env is passed, otherwise locally.
  const env = parsedArgs["env"]
  const project = parsedArgs["project"]

  const userId = process.env.CIRCLE_BUILD_NUM ? "ci-" + process.env.CIRCLE_BUILD_NUM : usernameSync()

  if (!project) {
    throw new Error("Must specify project name with --project parameter")
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
      command.push("--var", "userId=" + userId + "-e2e")
    }
    return command
  }

  async function runWithEnv(command: string[]) {
    return runGarden(projectPath, getCommand(command))
  }

  function watchWithEnv(command: string[]) {
    return new GardenWatch(projectPath, getCommand(command))
  }

  const namespaces = getProjectNamespaces()
  let projectPath: string

  before(async () => {
    log("deleting .garden folder")
    await removeExampleDotGardenDir(projectPath)
    log("ready")
    projectPath = await realpath(resolve(projectsDir, project))
  })

  after(async () => {
    log("deleting example namespaces")
    await deleteExampleNamespaces(namespaces)
    // Checkout changes to example dir when running locally
    if (!env) {
      log("Checking out example project directory to HEAD")
      await execa("git", ["checkout", projectPath])
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
      expect(
        searchLog(logEntries, /(Done!|No Test actions were found)/),
        "expected to find 'Done!' in log output"
      ).to.eql("passed")
    })
  })

  if (project === "vote") {
    describe("vote", () => {
      describe("top-level sanity checks", () => {
        it("runs the workflow command", async () => {
          const workflowName = "full-test"
          const logEntries = await runWithEnv(["workflow", workflowName])
          expect(
            searchLog(logEntries, new RegExp(`Workflow ${workflowName} completed successfully.`, "g")),
            `expected to find "Workflow ${workflowName} completed successfully." in log output.`
          ).to.eql("passed")
        })
      })
    })
  }

  if (project === "code-synchronization") {
    describe("code-synchronization", () => {
      it("runs the dev command with code-synchronization enabled", async () => {
        const gardenWatch = watchWithEnv(["dev"])

        const testSteps = [
          waitingForChangesStep(),
          sleepStep(2000),
          {
            description: "change 'Node' -> 'foo' in node-service/app.js",
            action: async () => {
              await replaceInFile.replaceInFile({
                files: resolve(projectPath, "node-service/src/app.js"),
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
              // eslint-disable-next-line
              console.log(callLogEntries.map((l) => stringifyJsonLog(l)).join("\n"))
              return searchLog(callLogEntries, /Hello from foo/)
            },
          },
        ]

        await gardenWatch.run({ testSteps })
      })

      it("should get logs after code-synchronization", async () => {
        const gardenWatch = watchWithEnv(["dev"])

        const testSteps = [
          waitingForChangesStep(),
          {
            description: "get logs for node-service",
            condition: async () => {
              const logEntries = await runWithEnv(["logs", "node-service"])
              return searchLog(logEntries, /App started/)
            },
          },
          changeFileStep(resolve(projectPath, "node-service/src/app.js"), "change node-service/src/app.js"),
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
})
