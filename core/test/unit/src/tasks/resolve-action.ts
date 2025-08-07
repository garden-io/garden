/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ResolvedBuildAction } from "../../../../src/actions/build.js"
import type { ActionKind, ActionModeMap } from "../../../../src/actions/types.js"
import { configTemplateKind } from "../../../../src/config/base.js"
import { joi } from "../../../../src/config/common.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { ResolveActionTask } from "../../../../src/tasks/resolve-action.js"
import type { TestGarden } from "../../../helpers.js"
import {
  makeTestGarden,
  getDataDir,
  expectError,
  getAllTaskResults,
  getDefaultProjectConfig,
} from "../../../helpers.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../src/constants.js"
import type { ContainerDeploySpec } from "../../../../src/plugins/container/config.js"

describe("ResolveActionTask", () => {
  let garden: TestGarden
  let log: Log

  const projectRoot = getDataDir("test-project-test-deps")

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot)
    log = garden.log
  })

  afterEach(() => {
    garden.close()
  })

  async function getTask(kind: ActionKind, name: string, actionModes: ActionModeMap = {}) {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true, actionModes })
    const action = graph.getActionByRef({ kind, name })

    return new ResolveActionTask({
      garden,
      log,
      graph,
      action,
      force: false,
    })
  }

  describe("handling missing secrets in constructor", () => {
    it("should throw if an action references missing secrets", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Run",
          type: "test",
          name: "run-with-missing-secrets",
          spec: {
            command: ["echo", "${secrets.missing}"],
          },
        },
      ])

      expect(garden.secrets).to.be.empty
      expect(garden.isLoggedIn()).to.be.false

      await expectError(() => getTask("Run", "run-with-missing-secrets"), {
        contains: [
          "The following secret names were referenced in configuration, but are missing from the secrets loaded remotely",
          "Run run-with-missing-secrets: missing",
          "You are not logged in. Log in to get access to Secrets in Garden Cloud.",
          "See also https://cloud.docs.garden.io/features/secrets",
        ],
      })
    })

    it("should throw if a module references missing secrets", async () => {
      garden.setPartialModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          kind: "Module",
          type: "test",
          name: "module-with-missing-secrets",
          allowPublish: false,
          disabled: false,
          path: garden.projectRoot,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {
            tasks: [
              {
                name: "task-with-missing-secrets",
                command: ["echo", "${secrets.missing}"],
              },
            ],
          },
        },
      ])

      expect(garden.secrets).to.be.empty
      expect(garden.isLoggedIn()).to.be.false

      await expectError(() => getTask("Run", "task-with-missing-secrets"), {
        contains: [
          "The following secret names were referenced in configuration, but are missing from the secrets loaded remotely",
          "Run task-with-missing-secrets: missing",
          "You are not logged in. Log in to get access to Secrets in Garden Cloud.",
          "See also https://cloud.docs.garden.io/features/secrets",
        ],
      })
    })
  })

  describe("resolveStatusDependencies", () => {
    it("returns an empty list", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      expect(task.resolveStatusDependencies()).to.eql([])
    })
  })

  describe("resolveProcessDependencies", () => {
    it("returns nothing if no dependencies are defined or found", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      expect(task.resolveProcessDependencies()).to.eql([])
    })

    it("returns execute task for dependency with needsExecutedOutputs=true", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            foo: "${actions.build.foo.outputs.something}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const deps = task.resolveProcessDependencies()

      expect(deps.length).to.equal(1)
      expect(deps[0].type).to.equal("build")
    })

    it("returns resolve task for dependency with needsStaticOutputs=true", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            foo: "${actions.build.foo.version}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const deps = task.resolveProcessDependencies()

      expect(deps.length).to.equal(1)
      expect(deps[0].type).to.equal("resolve-action")
    })

    it("returns resolve task for explicit dependency", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          dependencies: [{ kind: "Build", name: "foo" }],
          spec: {},
        },
      ])

      const task = await getTask("Deploy", "foo")
      const deps = task.resolveProcessDependencies()

      expect(deps.length).to.equal(1)
      expect(deps[0].type).to.equal("resolve-action")
    })
  })

  describe("process", () => {
    it("resolves an action", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")
      const { result } = await garden.processTask(task, { throwOnError: true })

      const resolved = result?.outputs.resolvedAction

      expect(resolved).to.exist
      expect(resolved).to.be.instanceOf(ResolvedBuildAction)
    })

    it("resolves action variables", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          variables: {
            foo: "${project.name}",
          },
        },
      ])

      const task = await getTask("Build", "foo")
      const { result } = await garden.processTask(task, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const variables = resolved.getResolvedVariables()

      expect(variables).to.eql({ foo: garden.projectName })
    })

    it("resolves action mode", async () => {
      garden.setPartialActionConfigs([
        // Here we use a valid container sync because the action will be validated
        {
          kind: "Deploy",
          type: "container",
          name: "foo",
          spec: {
            // Set so that sync comes up as a supported mode
            sync: { paths: [{ target: "/app", source: "." }] },
            command: ["echo", "${this.mode}"],
            image: "scratch",
            ports: [
              {
                name: "http",
                containerPort: 8080,
              },
            ],
          } as ContainerDeploySpec,
        },
      ])

      const task = await getTask("Deploy", "foo", { sync: ["deploy.foo"] })
      const { result } = await garden.processTask(task, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const spec = resolved.getSpec() as ContainerDeploySpec

      expect(spec.command).to.eql(["echo", "sync"])
    })

    it("correctly merges action and CLI variables", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          variables: {
            a: 100, // <-- should win
            b: 2,
            c: 3, // <-- should be included
          },
        },
      ])

      garden.variables["a"] = 1
      garden.variables["b"] = 200
      garden.variableOverrides.b = 2000 // <-- should win

      const task = await getTask("Build", "foo")
      const { result } = await garden.processTask(task, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const variables = resolved.getResolvedVariables()

      expect(variables).to.eql({
        a: 100,
        b: 2000,
        c: 3,
      })
    })

    it("resolves static action references", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            deployCommand: ["echo", "${actions.build.foo.version}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const { result } = await garden.processTask(task, { throwOnError: true })

      const all = getAllTaskResults(result?.dependencyResults!)

      const resolvedBuild = all["resolve-action.build.foo"]!.outputs.resolvedAction
      const buildVersion = resolvedBuild.versionString()

      const resolved = result!.outputs.resolvedAction
      const command = resolved.getSpec("deployCommand")

      expect(command).to.eql(["echo", buildVersion])
    })

    it("throws if spec is invalid after resolution", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          spec: {},
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            foo: "${actions.build.foo.version}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      await expectError(() => garden.processTask(task, { throwOnError: true }), {
        contains: ["Unrecognized key(s) in object: 'foo'"],
      })
    })

    it("resolves static outputs", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")
      const { result } = await garden.processTask(task, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const outputs = resolved.getOutputs()

      expect(outputs).to.eql({ foo: "bar" })
    })

    it("throws if static outputs don't match schema", async () => {
      const testPlugin = createGardenPlugin({
        name: "test",
        createActionTypes: {
          Build: [
            {
              name: "test",
              docs: "Test Build definition",
              schema: joi.object(),
              staticOutputsSchema: joi.object().keys({}).unknown(false),
              handlers: {
                getOutputs: async (_) => ({ outputs: { blep: "blop" } }),
              },
            },
          ],
        },
      })

      garden = await makeTestGarden(projectRoot, {
        plugins: [testPlugin],
        onlySpecifiedPlugins: true,
        config: {
          ...getDefaultProjectConfig(),
          providers: [{ name: "test" }],
        },
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      await expectError(() => garden.processTask(task, { throwOnError: true }), {
        contains: ["Error validating static action outputs from Build", 'key "blep" is not allowed'],
      })
    })

    it("applies default values from schemas to the resolved action spec", async () => {
      const testPlugin = createGardenPlugin({
        name: "test",
        createActionTypes: {
          Build: [
            {
              name: "test",
              docs: "Test Build definition",
              schema: joi.object().keys({
                foo: joi.number().default(123),
              }),
              handlers: {},
            },
          ],
        },
      })

      garden = await makeTestGarden(projectRoot, {
        plugins: [testPlugin],
        onlySpecifiedPlugins: true,
        config: {
          ...getDefaultProjectConfig(),
          providers: [{ name: "test" }],
        },
      })

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      const { result } = await garden.processTask(task, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec()).to.eql({ foo: 123 })
    })

    it("resolves action.* runtime references", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Run",
          type: "test",
          name: "foo",
          spec: {
            command: ["echo", "foo"],
          },
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            deployCommand: ["echo", "${actions.run.foo.outputs.log}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      const { result } = await garden.processTask(task, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec("deployCommand")).to.eql(["echo", "echo foo"])
    })

    it("resolves runtime.* references", async () => {
      garden.setPartialActionConfigs([
        {
          kind: "Run",
          type: "test",
          name: "foo",
          spec: {
            command: ["echo", "foo"],
          },
        },
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            deployCommand: ["echo", "${runtime.tasks.foo.outputs.log}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      const { result } = await garden.processTask(task, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec("deployCommand")).to.eql(["echo", "echo foo"])
    })

    it("resolves template inputs and names", async () => {
      garden.configTemplates = {
        template: {
          kind: configTemplateKind,
          name: "template",
          inputsSchema: joi.object(),
          inputsSchemaDefaults: {},
          internal: {
            basePath: garden.projectRoot,
            configFilePath: "template.yaml",
          },
        },
      }

      garden.setPartialActionConfigs([
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
            parentName: "parent",
            templateName: "template",
            inputs: {
              foo: "bar",
            },
          },
          spec: {
            deployCommand: ["echo", "${parent.name}", "${template.name}", "${inputs.foo}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      const { result } = await garden.processTask(task, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec("deployCommand")).to.eql(["echo", "parent", "template", "bar"])
    })
  })
})
