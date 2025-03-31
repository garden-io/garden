/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  TestGarden,
  makeTestGardenA,
  withDefaultGlobalOpts,
  expectError,
  makeTestGarden,
  customizedTestPlugin,
  expectFuzzyMatch,
  createProjectConfig,
  makeTempDir,
  getDataDir,
} from "../../../helpers.js"
import { GardenApiVersion } from "../../../../src/constants.js"
import { WorkflowCommand, shouldBeDropped } from "../../../../src/commands/workflow.js"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { joi } from "../../../../src/config/common.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import { join } from "path"
import fsExtra from "fs-extra"

const { remove, readFile, pathExists } = fsExtra
import { dedent } from "../../../../src/util/string.js"
import { resolveMsg, type LogEntry } from "../../../../src/logger/log-entry.js"
import type { WorkflowConfig, WorkflowStepSpec } from "../../../../src/config/workflow.js"
import { defaultWorkflowResources } from "../../../../src/config/workflow.js"
import { TestGardenCli } from "../../../helpers/cli.js"
import { WorkflowScriptError } from "../../../../src/exceptions.js"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import { VariablesContext } from "../../../../src/config/template-contexts/variables.js"

describe("RunWorkflowCommand", () => {
  const cmd = new WorkflowCommand()
  let garden: TestGarden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let defaultParams: any

  before(async () => {
    garden = await makeTestGardenA()
    const log = garden.log
    defaultParams = {
      cli: new TestGardenCli(),
      garden,
      log,
      opts: withDefaultGlobalOpts({}),
    }
  })

  it("should run a workflow", async () => {
    const parsedWorkflowConfigs = parseTemplateCollection({
      value: [
        {
          apiVersion: GardenApiVersion.v0,
          name: "workflow-a",
          kind: "Workflow",
          envVars: {},
          resources: defaultWorkflowResources,
          internal: {
            basePath: garden.projectRoot,
          },
          steps: [
            { command: ["deploy"], description: "deploy services" },
            { command: ["get", "outputs"] },
            { command: ["test"] },
            { command: ["deploy", "${var.foo}"] }, // <-- the second (null) element should get filtered out
            { command: ["test", "module-a-unit"] },
            { command: ["run", "task-a"] },
            { command: ["cleanup", "service", "service-a"] },
            { command: ["cleanup", "namespace"] },
            { command: ["publish"] },
          ],
        },
      ],
      source: { path: [] },
    }) as WorkflowConfig[]

    garden.setRawWorkflowConfigs(parsedWorkflowConfigs)

    garden.variables = VariablesContext.forTest({ garden, variablePrecedence: [{ foo: null }] })

    const result = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result.errors || []).to.eql([])
  })

  it("should continue on error if continueOnError = true", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [
          {
            script: dedent`
              echo stdout
              echo stderr 1>&2
              exit 1
            `, // <-- error thrown here
            continueOnError: true,
          },
          { command: ["echo", "success!"] },
        ],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist

    // step 1 is a script command
    expect(result?.steps).to.have.property("step-1")
    expect(result?.steps["step-1"].log).to.equal("stdout\nstderr")
    expect(result?.steps["step-1"].outputs["stderr"]).to.equal("stderr")
    expect(result?.steps["step-1"].outputs["stdout"]).to.equal("stdout")
    expect(result?.steps["step-1"].outputs["exitCode"]).to.equal(1)

    // we should have executed step 2, which is a Garden command, because continueOnError is true in step-1.
    expect(result?.steps).to.have.property("step-2")
    expect(result?.steps["step-2"].outputs).to.not.have.property("stderr")
  })

  it("should add workflowStep metadata to log entries provided to steps", async () => {
    const _garden = await makeTestGardenA(undefined)
    // Ensure log entries are empty
    _garden.log.root["entries"].length = 0
    const _log = _garden.log
    const _defaultParams = {
      garden: _garden,
      log: _log,
      opts: withDefaultGlobalOpts({}),
    }
    _garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        envVars: {},
        resources: defaultWorkflowResources,
        internal: {
          basePath: garden.projectRoot,
        },
        steps: [{ command: ["deploy"] }, { command: ["test"] }],
      },
    ])

    await cmd.action({ ..._defaultParams, args: { workflow: "workflow-a" } })
    const entries = _garden.log.getAllLogEntries()
    const stepHeaderEntries = filterLogEntries(entries, /Running step/)
    const stepBodyEntries = filterLogEntries(entries, /Resolving actions/)
    const stepFooterEntries = filterLogEntries(entries, /Step.*completed/)
    const workflowCompletedEntry = filterLogEntries(entries, /Workflow.*completed/)[0]

    expect(stepHeaderEntries.map((e) => e.metadata)).to.eql([undefined, undefined], "stepHeaderEntries")

    const stepBodyEntriesMetadata = stepBodyEntries.map((e) => e.metadata).filter(Boolean)
    expect(stepBodyEntriesMetadata).to.eql(
      [{ workflowStep: { index: 0 } }, { workflowStep: { index: 1 } }],
      "stepBodyEntries"
    )

    expect(stepFooterEntries.map((e) => e.metadata)).to.eql([undefined, undefined], "stepFooterEntries")
    expect(workflowCompletedEntry).to.exist
    expect(workflowCompletedEntry!.metadata).to.eql(undefined, "workflowCompletedEntry")
  })

  it("should emit workflow events", async () => {
    const _garden = await makeTestGardenA()
    const _log = _garden.log
    const _defaultParams = {
      garden: _garden,
      log: _log,
      opts: withDefaultGlobalOpts({}),
    }
    _garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        envVars: {},
        resources: defaultWorkflowResources,
        internal: {
          basePath: garden.projectRoot,
        },
        steps: [{ command: ["deploy"] }, { command: ["build"], skip: true }, { command: ["test"] }],
      },
    ])

    await cmd.action({ ..._defaultParams, args: { workflow: "workflow-a" } })

    const we = getWorkflowEvents(_garden)

    expect(we[0]).to.eql({ name: "workflowRunning", payload: {} })
    expect(we[1]).to.eql({ name: "workflowStepProcessing", payload: { index: 0 } })

    expect(we[2].name).to.eql("workflowStepComplete")
    expect(we[2].payload.index).to.eql(0)
    expect(we[2].payload.durationMsec).to.gte(0)

    expect(we[3]).to.eql({ name: "workflowStepSkipped", payload: { index: 1 } })

    expect(we[4]).to.eql({ name: "workflowStepProcessing", payload: { index: 2 } })

    expect(we[5].name).to.eql("workflowStepComplete")
    expect(we[5].payload.index).to.eql(2)
    expect(we[5].payload.durationMsec).to.gte(0)

    expect(we[6]).to.eql({ name: "workflowComplete", payload: {} })
  })

  function filterLogEntries(entries: LogEntry[], msgRegex: RegExp): LogEntry[] {
    return entries.filter((e) => msgRegex.test(resolveMsg(e) || ""))
  }

  it("should collect log outputs from a command step", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        envVars: {},
        resources: defaultWorkflowResources,
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        steps: [{ command: ["run", "task-a"] }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    if (errors) {
      throw errors[0]
    }

    const graphResults = result?.steps["step-1"]?.outputs?.graphResults!
    const taskResult = graphResults["run.task-a"]

    expect(result).to.exist
    expect(errors).to.not.exist
    expectFuzzyMatch(taskResult.outputs.log!.trim()!, "echo OK")
  })

  it("should abort subsequent steps if a command returns an error", async () => {
    const testModuleLog: string[] = []
    // This plugin always returns errors when a task is run.
    const testPlugin = customizedTestPlugin({
      name: "test",
      // createModuleTypes: [
      //   {
      //     name: "test",
      //     docs: "test",
      //     serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
      //     handlers: {
      //       build: async () => ({}),
      //       runTask: async ({ task }: RunTaskParams) => {
      //         const result = {
      //           taskName: task.name,
      //           moduleName: task.module.name,
      //           success: false,
      //           outputs: { log: "" },
      //           command: [],
      //           errors: [
      //             {
      //               type: "task",
      //               message: "Task failed",
      //               detail: {},
      //             },
      //           ],
      //           log: "",
      //           startedAt: new Date(),
      //           completedAt: new Date(),
      //           version: task.version,
      //         }
      //
      //         return result
      //       },
      //       testModule: async ({}) => {
      //         testModuleLog.push("tests have been run")
      //         const now = new Date()
      //         return {
      //           moduleName: "",
      //           command: [],
      //           completedAt: now,
      //           log: "",
      //           outputs: {
      //             log: "",
      //           },
      //           success: true,
      //           startedAt: now,
      //           testName: "some-test",
      //           version: "123",
      //         }
      //       },
      //       getTaskResult: async ({}) => {
      //         return null
      //       },
      //     },
      //   },
      // ],
      createActionTypes: {
        Run: [
          {
            name: "run",
            docs: "run",
            schema: joi.object().keys({ log: joi.string() }),
            handlers: {
              run: async (_params) => {
                throw new Error(`oops!`)
              },
              getResult: async (_params) => {
                return {
                  state: "failed",
                  detail: null,
                  outputs: {},
                }
              },
            },
          },
        ],
        Test: [
          {
            name: "test",
            docs: "test",
            schema: joi.object().keys({ log: joi.string() }),
            handlers: {
              run: async (_params) => {
                testModuleLog.push("tests have been run")
                const now = new Date()
                return {
                  state: "ready",
                  detail: {
                    command: [],
                    completedAt: now,
                    log: "",
                    success: true,
                    startedAt: now,
                  },
                  outputs: { log: "" },
                }
              },
              getResult: async (_params) => {
                return {
                  state: "ready",
                  detail: null,
                  outputs: {},
                }
              },
            },
          },
        ],
      },
    })

    const tmpDir = await makeTempDir({ git: true, initialCommit: false })

    const projectConfig: ProjectConfig = createProjectConfig({
      path: tmpDir.path,
      providers: [{ name: "test" }],
    })

    const _garden = await TestGarden.factory(tmpDir.path, { config: projectConfig, plugins: [testPlugin] })
    const log = garden.log
    _garden.setPartialActionConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        kind: "Run",
        name: "some-task",
        type: "test",
        disabled: false,
        internal: {
          basePath: tmpDir.path,
        },
        spec: {
          command: ["exit", "1"],
        },
      },
      {
        apiVersion: GardenApiVersion.v0,
        kind: "Test",
        name: "test-unit",
        type: "test",
        disabled: false,
        internal: {
          basePath: tmpDir.path,
        },
        spec: {
          command: ["echo", "ok"],
        },
      },
    ])
    _garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        envVars: {},
        resources: defaultWorkflowResources,
        internal: {
          basePath: garden.projectRoot,
        },
        steps: [{ command: ["run", "some-task"] }, { command: ["test"] }],
      },
    ])

    await cmd.action({
      garden: _garden,
      log,
      opts: withDefaultGlobalOpts({}),
      args: { workflow: "workflow-a" },
    })
    expect(testModuleLog.length).to.eql(0)

    const we = getWorkflowEvents(_garden)

    expect(we[0]).to.eql({ name: "workflowRunning", payload: {} })
    expect(we[1]).to.eql({ name: "workflowStepProcessing", payload: { index: 0 } })
    expect(we[2].name).to.eql("workflowStepError")
    expect(we[2].payload.index).to.eql(0)
    expect(we[2].payload.durationMsec).to.gte(0)
    expect(we[3].name).to.eql("workflowError")
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

    const projectConfig: ProjectConfig = createProjectConfig({
      path: garden.projectRoot,
      providers: [{ name: "test" }],
    })

    const _garden = await makeTestGarden(garden.projectRoot, { config: projectConfig, plugins: [test] })

    _garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [{ path: ".garden/test.txt", data: "test" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })
  })

  it("should write a file with data from a secret", async () => {
    garden.secrets.test = "super secret value"
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [{ path: ".garden/test.txt", secretName: "test" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    const filePath = join(garden.projectRoot, ".garden", "test.txt")
    await remove(filePath)

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const data = await readFile(filePath)
    expect(data.toString()).to.equal(garden.secrets.test)
    delete garden.secrets.test
  })

  it("should throw if a file references a secret that doesn't exist", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [{ path: ".garden/test.txt", secretName: "missing" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(() => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }), {
      contains: "File '.garden/test.txt' requires secret 'missing' which could not be found.",
    })
  })

  it("should throw if attempting to write a file with a directory path that contains an existing file", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [{ path: "garden.yml/foo.txt", data: "foo" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(() => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }), {
      contains: "Unable to write file 'garden.yml/foo.txt': Error: EEXIST: file already exists, mkdir",
    })
  })

  it("should throw before execution if any step references missing secrets", async () => {
    const name = "workflow-with-missing-secrets"
    const configs: WorkflowConfig[] = [
      {
        apiVersion: GardenApiVersion.v0,
        name,
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [
          {
            name: "init",
            script: "echo init",
          },
          {
            name: "secrets",
            script: "echo secrets ${secrets.missing}",
          },
          {
            name: "end",
            script: "echo end",
          },
        ],
      },
    ]
    // @ts-expect-error todo: correct types for unresolved configs
    const parsedConfigs = parseTemplateCollection({
      // @ts-expect-error todo: correct types for unresolved configs
      value: configs,
      source: { path: [] },
    }) as WorkflowConfig[]

    garden.setRawWorkflowConfigs(parsedConfigs)

    // TestGarden is not logged in to Cloud and has no secrets
    expect(garden.isLoggedIn()).to.be.false
    expect(garden.secrets).to.be.empty

    await expectError(() => cmd.action({ ...defaultParams, args: { workflow: name } }), {
      contains: [
        "The following secret names were referenced in configuration, but are missing from the secrets loaded remotely",
        `Workflow ${name}: missing`,
        "You are not logged in. Log in to get access to Secrets in Garden Cloud.",
        "See also https://cloud.docs.garden.io/features/secrets",
      ],
    })
  })

  it("should throw if attempting to write a file to an existing directory path", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [{ path: ".garden", data: "foo" }],
        steps: [{ command: ["get", "outputs"] }],
      },
    ])

    await expectError(() => cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } }), {
      contains: `Unable to write file '.garden': Error: EISDIR: illegal operation on a directory, open '${garden.gardenDirPath}'`,
    })
  })

  it("should run a script step in the project root", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [],
        steps: [{ script: "pwd" }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].log).to.equal(garden.projectRoot)
  })

  it("should run a custom command in a command step", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [],
        steps: [{ command: ["echo", "foo"] }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.eql(undefined)
    expect(result?.steps["step-1"].outputs.exec?.["command"]).to.eql(["sh", "-c", "echo foo"])
  })

  it("should support global parameters for custom commands", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        files: [],
        steps: [{ command: ["run-task", "task-a2", "--env", "other", "--var", "msg=YEP"] }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const outputs = result?.steps["step-1"].outputs.gardenCommand!

    expect(result).to.exist
    expect(errors).to.eql(undefined)
    expect(outputs["errors"]).to.eql([])
    expect(outputs["result"].success).to.be.true
    expect(outputs["result"].graphResults["run.task-a2"].result.detail.log).to.equal("echo other-YEP")
    expect(outputs["command"]).to.eql(["run", "task-a2", "--env", "other", "--var", "msg=YEP"])
  })

  it("should include env vars from the workflow config, if provided", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: { TEST_VAR_A: "llama" },
        resources: defaultWorkflowResources,
        files: [],
        steps: [{ script: "echo $TEST_VAR_A" }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].log).to.equal("llama")
    delete process.env.TEST_VAR_A
  })

  it("should override env vars from the workflow config with script step env vars, if provided", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: { TEST_VAR_A: "llama" },
        resources: defaultWorkflowResources,
        files: [],
        steps: [{ script: "echo $TEST_VAR_A", envVars: { TEST_VAR_A: "bear" } }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].log).to.equal("bear")
    delete process.env.TEST_VAR_A
  })

  it("should apply configured envVars when running script steps", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ script: "echo $FOO $BAR", envVars: { FOO: "foo", BAR: 123 } }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].log).to.equal("foo 123")
  })

  it("should skip disabled steps", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ script: "pwd" }, { script: "echo fail!; exit 1", skip: true }],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-2"].outputs).to.eql({})
    expect(result?.steps["step-2"].log).to.equal("")
  })

  describe("shouldBeDropped", () => {
    context("step has no when modifier", () => {
      it("should include the step if no error has been thrown by previous steps", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] },
          { command: ["test"], when: "onError" },
          { command: ["build"] }, // <-- checking this step
        ]
        expect(shouldBeDropped(2, steps, {})).to.be.false
      })

      it("should drop the step when errors have been thrown by previous steps", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] }, // <-- error thrown here
          { command: ["test"], when: "onError" },
          { command: ["build"] }, // <-- checking this step
        ]
        expect(shouldBeDropped(2, steps, { 0: [new Error()] })).to.be.true
      })
    })

    context("step has when = always", () => {
      it("should include the step even when errors have been thrown by previous steps", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] }, // <-- error thrown here
          { command: ["test"] },
          { command: ["build"], when: "always" }, // <-- checking this step
        ]
        expect(shouldBeDropped(2, steps, { 0: [new Error()] })).to.be.false
      })
    })

    context("step has when = never", () => {
      it("should drop the step even if no error has been thrown by previous steps", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] },
          { command: ["test"] },
          { command: ["build"], when: "never" },
        ]
        expect(shouldBeDropped(2, steps, {})).to.be.true
      })
    })

    context("step has when = onError", () => {
      it("should be dropped if no previous steps have failed", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] },
          { command: ["test"] },
          { command: ["build"], when: "onError" },
        ]
        expect(shouldBeDropped(2, steps, {})).to.be.true
      })

      it("should be included if a step in the current sequence failed", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] }, // <-- error thrown here
          { command: ["test"] },
          { command: ["build"], when: "onError" }, // <-- checking this step
          { command: ["test"], when: "onError" }, // <-- checking this step
        ]
        expect(shouldBeDropped(2, steps, { 0: [new Error()] })).to.be.false
        expect(shouldBeDropped(3, steps, { 0: [new Error()] })).to.be.false
      })

      it("should be dropped if a step in a preceding sequence failed", () => {
        const steps: WorkflowStepSpec[] = [
          { command: ["deploy"] }, // <-- error thrown here
          { command: ["test"] },
          { command: ["build"], when: "onError" },
          { command: ["test"], when: "onError" },
          { command: ["test"] },
          { command: ["test"], when: "onError" }, // <-- checking this step
        ]
        expect(shouldBeDropped(5, steps, { 0: [new Error()] })).to.be.true
      })
    })
  })

  it("should collect log outputs, including stderr, from a script step", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [
          {
            script: dedent`
              echo stdout
              echo stderr 1>&2
            `,
          },
        ],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].log).to.equal("stdout\nstderr")
    expect(result?.steps["step-1"].outputs["stderr"]).to.equal("stderr")
    expect(result?.steps["step-1"].outputs["stdout"]).to.equal("stdout")
    expect(result?.steps["step-1"].outputs["exitCode"]).to.equal(0)
  })

  it("should throw if a script step fails", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ script: "echo boo!; exit 1" }],
      },
    ])

    const { errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    expect(errors![0].type).to.equal("runtime")
    expect(errors![0].message).to.equal("workflow failed with 1 error, see logs above for more info")
  })

  it("should throw if a script step fails and add log to output with --output flag set", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ script: "echo boo!; exit 1" }],
      },
    ])

    const { errors } = await cmd.action({
      ...defaultParams,
      args: { workflow: "workflow-a" },
      opts: { output: "json" },
    })
    const error = errors![0]
    if (!(error instanceof WorkflowScriptError)) {
      expect.fail("Expected error to be a WorkflowScriptError")
    }
    expect(error.message).to.equal("Script exited with code 1. This is the stderr output:\n\nboo!")
    expect(error.details.stdout).to.equal("boo!")
  })

  it("should return script logs with the --output flag set", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ script: "echo boo!;" }],
      },
    ])

    const result = await cmd.action({
      ...defaultParams,
      args: { workflow: "workflow-a" },
      opts: { output: "json" },
    })

    expect(result.errors).to.be.undefined
    expect(result.result?.steps["step-1"].log).to.be.equal("boo!")
  })

  it("should include outputs from steps in the command output", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ command: ["get", "config"] }, { command: ["run", "task-a"] }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    if (errors) {
      throw errors[0]
    }

    const config = await garden.dumpConfig({ log: garden.log })

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["step-1"].outputs).to.eql(config)
    expect(result?.steps["step-2"].outputs.graphResults).to.exist
  })

  it("should use explicit names for steps if specified", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-a",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        files: [],
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ name: "test", command: ["run", "task-a"] }],
      },
    ])

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    if (errors) {
      throw errors[0]
    }

    expect(result).to.exist
    expect(errors).to.not.exist
    expect(result?.steps["test"]).to.exist
  })

  it("should resolve references to previous steps when running a command step", async () => {
    const parsedWorkflowConfigs = parseTemplateCollection({
      value: [
        {
          apiVersion: GardenApiVersion.v0,
          name: "workflow-a",
          kind: "Workflow",
          internal: {
            basePath: garden.projectRoot,
          },
          files: [],
          envVars: {},
          resources: defaultWorkflowResources,
          steps: [{ command: ["get", "outputs"] }, { command: ["run", "${steps.step-1.outputs.taskName}"] }],
        },
      ],
      source: { path: [] },
    }) as WorkflowConfig[]

    garden.setRawWorkflowConfigs(parsedWorkflowConfigs)

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    if (errors) {
      throw errors[0]
    }

    expect(result).to.exist
    expect(result?.steps["step-2"].outputs["graphResults"]!["run.task-a"].result.detail.log).to.equal("echo OK")
  })

  it("should resolve references to previous steps when running a script step", async () => {
    const parsedWorkflowConfigs = parseTemplateCollection({
      value: [
        {
          apiVersion: GardenApiVersion.v0,
          name: "workflow-a",
          kind: "Workflow",
          internal: {
            basePath: garden.projectRoot,
          },
          files: [],
          envVars: {},
          resources: defaultWorkflowResources,
          steps: [{ command: ["get", "outputs"] }, { script: "echo ${steps.step-1.outputs.taskName}" }],
        },
      ],
      source: { path: [] },
    }) as WorkflowConfig[]

    garden.setRawWorkflowConfigs(parsedWorkflowConfigs)

    const { result, errors } = await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })

    if (errors) {
      throw errors[0]
    }

    expect(result).to.exist
    expect(result?.steps["step-2"].log).to.equal("task-a")
  })

  it("should only resolve the workflow that's being run", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "workflow-to-run",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: {},
        resources: defaultWorkflowResources,
        steps: [{ command: ["deploy"] }],
      },
      {
        apiVersion: GardenApiVersion.v0,
        name: "some-other-workflow",
        kind: "Workflow",
        internal: {
          basePath: garden.projectRoot,
        },
        envVars: { FOO: "${secrets.missing}" }, // <--- should not be resolved, so no error should be thrown
        resources: defaultWorkflowResources,
        steps: [{ command: ["deploy"] }],
      },
    ])

    // This workflow should run without errors, despite a missing secret being referenced in a separate workflow config.
    await cmd.action({ ...defaultParams, args: { workflow: "workflow-to-run" } })
  })
})

describe("Lazy provider initialization in RunWorkflowCommand", () => {
  const cmd = new WorkflowCommand()
  let garden: TestGarden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let defaultParams: any

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-execprovider-fail"), { forceRefresh: true })
    const log = garden.log
    defaultParams = {
      cli: new TestGardenCli(),
      garden,
      log,
      opts: withDefaultGlobalOpts({}),
    }
  })

  it("should run script steps before initializing providers", async () => {
    garden.setRawWorkflowConfigs([
      {
        apiVersion: GardenApiVersion.v0,
        name: "test",
        kind: "Workflow",
        envVars: {},
        resources: defaultWorkflowResources,
        internal: {
          basePath: garden.projectRoot,
        },
        steps: [
          { script: "echo Script step succeeds!", name: "step-1" }, // this should succeed
          { command: ["build"] }, // this should fail
        ],
      },
    ])

    const result = await cmd.action({ ...defaultParams, args: { workflow: "test" } })

    expect(result.result?.steps["step-1"].log).to.eql("Script step succeeds!")

    // step 2 should fail, because initializing the exec provider fails.
    expect(result.errors?.length).to.eql(1)
  })
})

function getWorkflowEvents(garden: TestGarden) {
  const eventNames = [
    "workflowRunning",
    "workflowComplete",
    "workflowError",
    "workflowStepProcessing",
    "workflowStepSkipped",
    "workflowStepError",
    "workflowStepComplete",
  ]
  return garden.events.eventLog.filter((e) => eventNames.includes(e.name))
}
