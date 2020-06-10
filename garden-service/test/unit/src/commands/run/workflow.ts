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
import { TestGarden, makeTestGardenA, withDefaultGlobalOpts, expectError } from "../../../../helpers"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { RunWorkflowCommand } from "../../../../../src/commands/run/workflow"
import { createGardenPlugin } from "../../../../../src/types/plugin/plugin"
import { joi } from "../../../../../src/config/common"
import { RunTaskParams } from "../../../../../src/types/plugin/task/runTask"
import { ProjectConfig } from "../../../../../src/config/project"
import { join } from "path"
import { remove, readFile, pathExists } from "fs-extra"
import { defaultDotIgnoreFiles } from "../../../../../src/util/fs"

describe("RunWorkflowCommand", () => {
  const cmd = new RunWorkflowCommand()
  let garden: TestGarden
  let defaultParams: any

  before(async () => {
    garden = await makeTestGardenA()
    const log = garden.log
    defaultParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
      opts: withDefaultGlobalOpts({}),
    }
  })

  it("should run a workflow", async () => {
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

    const _garden = await TestGarden.factory(tmpDir.path, { config: projectConfig, plugins: [testPlugin] })
    const log = garden.log
    _garden.setModuleConfigs([
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
    _garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        steps: [{ command: ["run", "task", "some-task"] }, { command: ["test"] }],
      },
    ])

    await cmd.action({
      garden: _garden,
      log,
      headerLog: log,
      footerLog: log,
      opts: withDefaultGlobalOpts({}),
      args: { workflow: "workflow-a" },
    })
    expect(testModuleLog.length).to.eql(0)
  })

  it("should write a file with string data ahead of the run, before resolving providers", async () => {
    // Make a test plugin that expects a certain file to exist when resolving
    const filePath = join(garden.projectRoot, ".garden", "test.txt")
    await remove(filePath)

    const test = createGardenPlugin({
      name: "test",
      handlers: {
        configureProvider: async ({ config }) => {
          expect(await pathExists(filePath)).to.be.true
          return { config }
        },
      },
    })

    const projectConfig: ProjectConfig = {
      apiVersion: "garden.io/v0",
      kind: "Project",
      name: "test",
      path: garden.projectRoot,
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      environments: [{ name: "default", variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }

    const _garden = await TestGarden.factory(garden.projectRoot, { config: projectConfig, plugins: [test] })

    _garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        files: [{ path: ".garden/test.txt", data: "test" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })
  })

  it("should write a file with data from a secret", async () => {
    garden.secrets.test = "super secret value"
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        files: [{ path: ".garden/test.txt", secretName: "test" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    const filePath = join(garden.projectRoot, ".garden", "test.txt")
    await remove(filePath)

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const data = await readFile(filePath)
    expect(data.toString()).to.equal(garden.secrets.test)
  })

  it("should throw if a file references a secret that doesn't exist", async () => {
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        files: [{ path: ".garden/test.txt", secretName: "missing" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(
      () => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }),
      (err) =>
        expect(err.message).to.equal("File '.garden/test.txt' requires secret 'missing' which could not be found.")
    )
  })

  it("should throw if attempting to write a file with a directory path that contains an existing file", async () => {
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        files: [{ path: "garden.yml/foo.txt", data: "foo" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(
      () => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }),
      (err) =>
        expect(err.message.startsWith("Unable to write file 'garden.yml/foo.txt': EEXIST: file already exists, mkdir"))
          .to.be.true
    )
  })

  it("should throw if attempting to write a file to an existing directory path", async () => {
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        files: [{ path: ".garden", data: "foo" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(
      () => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }),
      (err) =>
        expect(err.message).to.equal(
          `Unable to write file '.garden': EISDIR: illegal operation on a directory, open '${garden.gardenDirPath}'`
        )
    )
  })
})
