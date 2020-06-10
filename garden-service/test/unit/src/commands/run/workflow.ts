/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa from "execa"
import tmp from "tmp-promise"
import { expect } from "chai"
import { TestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { RunWorkflowCommand } from "../../../../../src/commands/run/workflow"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"
import { joi } from "../../../../../src/config/common"
import { RunTaskParams } from "../../../../../src/types/plugin/task/runTask"
import { ProjectConfig } from "../../../../../src/config/project"

describe("RunWorkflowCommand", () => {
  const cmd = new RunWorkflowCommand()

  it("should run a workflow", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const defaultParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
      opts: withDefaultGlobalOpts({}),
    }
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        steps: [
          { command: ["deploy"], description: "deploy services" },
          { command: ["get", "outputs"] },
          { command: ["test"] },
          { command: ["run", "test", "module-a", "unit"] },
          { command: ["run", "task", "task-a"] },
          { command: ["delete", "service", "service-a"] },
          { command: ["delete", "environment"] },
          { command: ["publish"] },
        ],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })
  })

  it("should abort subsequent steps if a command returns an error", async () => {
    const testModuleLog: string[] = []
    // This plugin always returns errors when a task is run.
    const testPlugin = createGardenPlugin({
      name: "test",
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
          handlers: {
            build: async () => ({}),
            runTask: async ({ task }: RunTaskParams) => {
              const result = {
                taskName: task.name,
                moduleName: task.module.name,
                success: false,
                outputs: { log: "" },
                command: [],
                errors: [
                  {
                    type: "task",
                    message: "Task failed",
                    detail: {},
                  },
                ],
                log: "",
                startedAt: new Date(),
                completedAt: new Date(),
                version: task.module.version.versionString,
              }

              return result
            },
            testModule: async ({}) => {
              testModuleLog.push("tests have been run") // <--------
              const now = new Date()
              return {
                moduleName: "",
                command: [],
                completedAt: now,
                log: "",
                outputs: {
                  log: "",
                },
                success: true,
                startedAt: now,
                testName: "some-test",
                version: "123",
              }
            },
            getTaskResult: async ({}) => {
              return null
            },
          },
        },
      ],
    })

    const tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init"], { cwd: tmpDir.path })

    const projectConfig: ProjectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: tmpDir.path,
      defaultEnvironment: "default",
      dotIgnoreFiles: [],
      environments: [{ name: "default", variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }

    const garden = await TestGarden.factory(tmpDir.path, { config: projectConfig, plugins: [testPlugin] })
    const log = garden.log
    const defaultParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
      opts: withDefaultGlobalOpts({}),
    }
    garden.setModuleConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "test",
        type: "test",
        allowPublish: false,
        disabled: false,
        build: { dependencies: [] },
        outputs: {},
        path: tmpDir.path,
        serviceConfigs: [],
        taskConfigs: [
          {
            name: "some-task",
            cacheResult: true,
            dependencies: [],
            disabled: false,
            spec: {},
            timeout: 10,
          },
        ],
        testConfigs: [
          {
            name: "unit",
            dependencies: [],
            disabled: false,
            spec: {},
            timeout: 10,
          },
        ],
        spec: {},
      },
    ])
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        steps: [{ command: ["run", "task", "some-task"] }, { command: ["test"] }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })
    expect(testModuleLog.length).to.eql(0)
  })
})
