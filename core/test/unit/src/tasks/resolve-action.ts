/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ResolvedBuildAction } from "../../../../src/actions/build"
import { ActionKind, ActionModeMap } from "../../../../src/actions/types"
import { joi } from "../../../../src/config/common"
import { Log } from "../../../../src/logger/log-entry"
import { createGardenPlugin } from "../../../../src/plugin/plugin"
import { ResolveActionTask } from "../../../../src/tasks/resolve-action"
import {
  TestGarden,
  makeTestGarden,
  getDataDir,
  expectError,
  getAllRunResults,
  getDefaultProjectConfig,
} from "../../../helpers"

describe("ResolveActionTask", () => {
  let garden: TestGarden
  let log: Log

  const projectRoot = getDataDir("test-project-test-deps")

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot)
    log = garden.log
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

  describe("resolveStatusDependencies", () => {
    it("returns an empty list", async () => {
      garden.setActionConfigs([
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
      garden.setActionConfigs([
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
      garden.setActionConfigs([
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
            foo: "${action.build.foo.outputs.something}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const deps = task.resolveProcessDependencies()

      expect(deps.length).to.equal(1)
      expect(deps[0].type).to.equal("build")
    })

    it("returns resolve task for dependency with needsStaticOutputs=true", async () => {
      garden.setActionConfigs([
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
            foo: "${action.build.foo.version}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const deps = task.resolveProcessDependencies()

      expect(deps.length).to.equal(1)
      expect(deps[0].type).to.equal("resolve-action")
    })

    it("returns resolve task for explicit dependency", async () => {
      garden.setActionConfigs([
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
      garden.setActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")
      const result = await garden.processTask(task, log, { throwOnError: true })

      const resolved = result?.outputs.resolvedAction

      expect(resolved).to.exist
      expect(resolved).to.be.instanceOf(ResolvedBuildAction)
    })

    it("resolves action variables", async () => {
      garden.setActionConfigs([
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
      const result = await garden.processTask(task, log, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const variables = resolved.getVariables()

      expect(variables).to.eql({ foo: garden.projectName })
    })

    it("resolves action mode", async () => {
      garden.setActionConfigs([
        {
          kind: "Deploy",
          type: "test",
          name: "foo",
          spec: {
            deployCommand: ["${this.mode}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo", { local: ["deploy.foo"] })
      const result = await garden.processTask(task, log, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const spec = resolved.getSpec()

      expect(spec.deployCommand).to.eql(["local"])
    })

    it("correctly merges action and CLI variables", async () => {
      garden.setActionConfigs([
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

      garden.variables.a = 1
      garden.variables.b = 200
      garden.cliVariables.b = 2000 // <-- should win

      const task = await getTask("Build", "foo")
      const result = await garden.processTask(task, log, { throwOnError: true })

      const resolved = result!.outputs.resolvedAction
      const variables = resolved.getVariables()

      expect(variables).to.eql({
        a: 100,
        b: 2000,
        c: 3,
      })
    })

    it("resolves static action references", async () => {
      garden.setActionConfigs([
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
            deployCommand: ["echo", "${action.build.foo.version}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")
      const result = await garden.processTask(task, log, { throwOnError: true })

      const all = getAllRunResults(result?.dependencyResults!)

      const resolvedBuild = all["resolve-action.build.foo"]!.outputs.resolvedAction
      const buildVersion = resolvedBuild.versionString()

      const resolved = result!.outputs.resolvedAction
      const command = resolved.getSpec("deployCommand")

      expect(command).to.eql(["echo", buildVersion])
    })

    it("throws if spec is invalid after resolution", async () => {
      garden.setActionConfigs([
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
            foo: "${action.build.foo.version}",
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      await expectError(() => garden.processTask(task, log, { throwOnError: true }), {
        contains: ["Error validating spec for Deploy", '"foo" is not allowed at path'],
      })
    })

    it("resolves static outputs", async () => {
      garden.setActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")
      const result = await garden.processTask(task, log, { throwOnError: true })

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

      garden.setActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      await expectError(() => garden.processTask(task, log, { throwOnError: true }), {
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

      garden.setActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
        },
      ])

      const task = await getTask("Build", "foo")

      const result = await garden.processTask(task, log, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec()).to.eql({ foo: 123 })
    })

    it("resolves action.* runtime references", async () => {
      garden.setActionConfigs([
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
            deployCommand: ["echo", "${action.run.foo.outputs.log}"],
          },
        },
      ])

      const task = await getTask("Deploy", "foo")

      const result = await garden.processTask(task, log, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec("deployCommand")).to.eql(["echo", "echo foo"])
    })

    it("resolves runtime.* references", async () => {
      garden.setActionConfigs([
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

      const result = await garden.processTask(task, log, { throwOnError: true })
      const resolved = result!.outputs.resolvedAction

      expect(resolved.getSpec("deployCommand")).to.eql(["echo", "echo foo"])
    })
  })
})
