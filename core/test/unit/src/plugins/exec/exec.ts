/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"

import type { Garden } from "../../../../../src/garden.js"
import type { ExecProvider } from "../../../../../src/plugins/exec/exec.js"
import { gardenPlugin } from "../../../../../src/plugins/exec/exec.js"
import type { ActionLog } from "../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../src/logger/log-entry.js"
import { keyBy, omit } from "lodash-es"
import {
  getDataDir,
  expectError,
  createProjectConfig,
  TestGarden,
  makeModuleConfig,
  makeTempDir,
} from "../../../../helpers.js"
import { RunTask } from "../../../../../src/tasks/run.js"
import { makeTestGarden } from "../../../../helpers.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import fsExtra from "fs-extra"
const { pathExists, emptyDir, readFile, remove, mkdirp } = fsExtra
import { TestTask } from "../../../../../src/tasks/test.js"
import { dedent } from "../../../../../src/util/string.js"
import { sleep } from "../../../../../src/util/util.js"
import type { ExecModuleConfig } from "../../../../../src/plugins/exec/moduleConfig.js"
import { actionFromConfig } from "../../../../../src/graph/actions.js"
import type { TestAction, TestActionConfig } from "../../../../../src/actions/test.js"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import type { ConvertModulesResult } from "../../../../../src/resolve-module.js"
import { convertModules, findActionConfigInGroup, findGroupConfig } from "../../../../../src/resolve-module.js"
import type tmp from "tmp-promise"
import type { ProjectConfig } from "../../../../../src/config/project.js"
import type { BuildActionConfig } from "../../../../../src/actions/build.js"
import type { DeployActionConfig } from "../../../../../src/actions/deploy.js"
import type { RunActionConfig } from "../../../../../src/actions/run.js"
import { getLogFilePath } from "../../../../../src/plugins/exec/deploy.js"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_TEST_TIMEOUT_SEC,
} from "../../../../../src/constants.js"
import { isRunning, killRecursive } from "../../../../../src/process.js"
import { ACTION_RUNTIME_LOCAL } from "../../../../../src/plugin/base.js"

describe("exec plugin", () => {
  context("test-project based tests", () => {
    const testProjectRoot = getDataDir("test-project-exec")
    const plugin = gardenPlugin

    let garden: Garden
    let ctx: PluginContext
    let execProvider: ExecProvider
    let graph: ConfigGraph
    let log: ActionLog

    beforeEach(async () => {
      garden = await makeTestGarden(testProjectRoot, { plugins: [plugin] })
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      execProvider = await garden.resolveProvider({ log: garden.log, name: "exec" })
      ctx = await garden.getPluginContext({ provider: execProvider, templateContext: undefined, events: undefined })
      log = createActionLog({ log: garden.log, actionName: "", actionKind: "" })
      await garden.clearBuilds()
    })

    afterEach(() => {
      garden.close()
    })

    it("should run a script on init in the project root, if configured", async () => {
      const _garden = await makeTestGarden(testProjectRoot, {
        plugins: [plugin],
        config: createProjectConfig({
          path: garden.projectRoot,
          providers: [{ name: "exec", initScript: "echo hello! > .garden/test.txt" }],
        }),
        noCache: true,
      })

      await _garden.getConfigGraph({ log: _garden.log, emit: false, noCache: true })

      const f = await readFile(join(_garden.projectRoot, ".garden", "test.txt"))

      expect(f.toString().trim()).to.equal("hello!")
    })

    it("should throw if a script configured and exits with a non-zero code", async () => {
      const _garden = await makeTestGarden(garden.projectRoot, {
        plugins: [plugin],
        config: createProjectConfig({
          path: testProjectRoot,
          providers: [{ name: "exec", initScript: "echo oh no!; exit 1" }],
        }),
      })

      await expectError(() => _garden.resolveProviders({ log: _garden.log }), "plugin")
    })

    it("should correctly parse exec modules", async () => {
      const modules = keyBy(graph.getModules(), "name")
      const { "module-a": moduleA, "module-b": moduleB, "module-c": moduleC, "module-local": moduleLocal } = modules

      expect(moduleA.build.dependencies).to.eql([])
      expect(moduleA.spec.build.command).to.eql(["echo", "A"])
      expect(moduleA.serviceConfigs).to.eql([
        {
          dependencies: [],
          disabled: false,
          name: "apple",
          spec: {
            cleanupCommand: ["rm -f deployed.log && echo cleaned up"],
            dependencies: [],
            deployCommand: ["touch deployed.log && echo deployed"],
            disabled: false,
            env: {},
            name: "apple",
            statusCommand: ["test -f deployed.log && echo already deployed"],
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
        },
      ])
      expect(moduleA.taskConfigs).to.eql([
        {
          name: "banana",
          cacheResult: false,
          dependencies: ["orange"],
          disabled: false,
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            artifacts: [],
            name: "banana",
            command: ["echo", "BANANA"],
            env: {},
            dependencies: ["orange"],
            disabled: false,
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
        {
          name: "orange",
          cacheResult: false,
          dependencies: [],
          disabled: false,
          timeout: 999,
          spec: {
            artifacts: [],
            name: "orange",
            command: ["echo", "ORANGE"],
            env: {},
            dependencies: [],
            disabled: false,
            timeout: 999,
          },
        },
      ])
      expect(moduleA.testConfigs).to.eql([
        {
          name: "unit",
          dependencies: [],
          disabled: false,
          timeout: DEFAULT_TEST_TIMEOUT_SEC,
          spec: {
            name: "unit",
            artifacts: [],
            dependencies: [],
            disabled: false,
            command: ["echo", "OK"],
            env: {
              FOO: "boo",
            },
            timeout: DEFAULT_TEST_TIMEOUT_SEC,
          },
        },
      ])

      expect(moduleB.build.dependencies).to.eql([{ name: "module-a", copy: [] }])
      expect(moduleB.spec.build.command).to.eql(["echo", "B"])

      expect(moduleB.serviceConfigs).to.eql([])
      expect(moduleB.taskConfigs).to.eql([])
      expect(moduleB.testConfigs).to.eql([
        {
          name: "unit",
          dependencies: [],
          disabled: false,
          timeout: DEFAULT_TEST_TIMEOUT_SEC,
          spec: {
            name: "unit",
            artifacts: [],
            dependencies: [],
            disabled: false,
            command: ["echo", "OK"],
            env: {},
            timeout: DEFAULT_TEST_TIMEOUT_SEC,
          },
        },
      ])

      expect(moduleC.build.dependencies).to.eql([{ name: "module-b", copy: [] }])
      expect(moduleC.spec.build.command).to.eql([])

      expect(moduleC.serviceConfigs).to.eql([])
      expect(moduleC.taskConfigs).to.eql([])
      expect(moduleC.testConfigs).to.eql([
        {
          name: "unit",
          dependencies: [],
          disabled: false,
          timeout: DEFAULT_TEST_TIMEOUT_SEC,
          spec: {
            name: "unit",
            dependencies: [],
            artifacts: [],
            disabled: false,
            command: ["echo", "OK"],
            env: {},
            timeout: DEFAULT_TEST_TIMEOUT_SEC,
          },
        },
      ])

      expect(moduleLocal.local).to.eql(true)
      expect(moduleLocal.build.dependencies).to.eql([])
      expect(moduleLocal.spec.build.command).to.eql(["pwd"])

      expect(moduleLocal.serviceConfigs).to.eql([
        {
          dependencies: [],
          disabled: false,
          name: "touch",
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            cleanupCommand: ["rm -f deployed.log && echo cleaned up"],
            dependencies: [],
            deployCommand: ["touch deployed.log && echo deployed"],
            disabled: false,
            env: {},
            name: "touch",
            statusCommand: ["test -f deployed.log && echo already deployed"],
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
        {
          dependencies: [],
          disabled: false,
          name: "echo",
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            dependencies: [],
            deployCommand: ["echo", "deployed $NAME"],
            disabled: false,
            env: { NAME: "echo service" },
            name: "echo",
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
        {
          dependencies: [],
          disabled: false,
          name: "error",
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            cleanupCommand: ["sh", '-c "echo fail! && exit 1"'],
            dependencies: [],
            deployCommand: ["sh", '-c "echo fail! && exit 1"'],
            disabled: false,
            env: {},
            name: "error",
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
        {
          dependencies: [],
          disabled: false,
          name: "empty",
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            dependencies: [],
            deployCommand: [],
            disabled: false,
            env: {},
            name: "empty",
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
      ])
      expect(moduleLocal.taskConfigs).to.eql([
        {
          name: "pwd",
          cacheResult: false,
          dependencies: [],
          disabled: false,
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          spec: {
            name: "pwd",
            env: {},
            command: ["pwd"],
            artifacts: [],
            dependencies: [],
            disabled: false,
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
          },
        },
      ])
      expect(moduleLocal.testConfigs).to.eql([])
    })

    it("should copy artifacts after task runs", async () => {
      const _garden = await makeTestGarden(getDataDir("test-projects", "exec-artifacts"))
      const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
      const run = _graph.getRun("task-a")

      const taskTask = new RunTask({
        garden: _garden,
        graph: _graph,
        action: run,

        log: _garden.log,
        force: false,
        forceBuild: false,
      })

      await emptyDir(_garden.artifactsPath)

      await _garden.processTasks({ tasks: [taskTask], throwOnError: false })

      expect(await pathExists(join(_garden.artifactsPath, "task-outputs", "task-a.txt"))).to.be.true
    })

    it("should copy artifacts after test runs", async () => {
      const _garden = await makeTestGarden(getDataDir("test-projects", "exec-artifacts"))
      const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
      const test = _graph.getTest("module-a-test-a")

      const testTask = new TestTask({
        garden: _garden,
        graph: _graph,
        action: test,

        log: _garden.log,
        force: false,
        forceBuild: false,
      })

      await emptyDir(_garden.artifactsPath)

      await _garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(await pathExists(join(_garden.artifactsPath, "test-outputs", "test-a.txt"))).to.be.true
    })

    describe("Build", () => {
      it("should run the build command in the action dir if local true", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        const { result: res } = await actions.build.build({ log, action: resolvedAction, graph })

        const expectedBuildLog = join(garden.projectRoot, "module-local")
        expect(res.detail).to.eql({
          buildLog: expectedBuildLog,
          fresh: true,
          runtime: ACTION_RUNTIME_LOCAL,
        })
      })

      it("should receive action version as an env var", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()

        action._config.spec.command = ["sh", "-c", "echo $GARDEN_ACTION_VERSION"]
        action._config.spec.shell = false

        const resolvedAction = await garden.resolveAction({ log, graph, action })
        const { result: res } = await actions.build.build({ log, action: resolvedAction, graph })

        expect(res.detail).to.eql({
          buildLog: action.versionString(log),
          fresh: true,
          runtime: ACTION_RUNTIME_LOCAL,
        })
      })

      it("should receive module version as an env var", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()

        action._config.spec.command = ["sh", "-c", "echo $GARDEN_MODULE_VERSION"]
        action._config.spec.shell = false

        const resolvedAction = await garden.resolveAction({ log, graph, action })
        const { result: res } = await actions.build.build({ log, action: resolvedAction, graph })

        expect(res.detail).to.eql({
          buildLog: action.versionString(log),
          fresh: true,
          runtime: ACTION_RUNTIME_LOCAL,
        })
      })

      it("should return 'ready' status if statusCommand returns zero exit code", async () => {
        const action = graph.getBuild("build-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["echo", "ready"]
        await mkdirp(resolvedAction.getBuildPath())
        const { result: res } = await actions.build.getStatus({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("ready")
        expect(res.detail).to.eql({
          buildLog: "ready",
          runtime: ACTION_RUNTIME_LOCAL,
        })
      })

      it("should return 'not-ready' status if statusCommand returns non-zero exit code", async () => {
        const action = graph.getBuild("build-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["exit 1"]
        await mkdirp(resolvedAction.getBuildPath())
        const { result: res } = await actions.build.getStatus({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("not-ready")
      })

      it("should return 'unknown' status if no statusCommand is set", async () => {
        const action = graph.getBuild("build-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = undefined
        const { result: res } = await actions.build.getStatus({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("should return 'unknown' status if statusCommand is empty", async () => {
        const action = graph.getBuild("build-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = []
        const { result: res } = await actions.build.getStatus({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("throws if status command is invalid", async () => {
        const action = graph.getBuild("build-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = false
        resolvedAction._config.spec.statusCommand = ["jkghslfdkjghsdlfjkghsldjkgf"]
        await expectError(
          async () => await actions.build.getStatus({ log, action: resolvedAction, graph }),
          (err) => expect(err.message).to.include("ENOENT")
        )
      })

      it("should receive outputs from files", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()

        action._config.spec.command = ["echo bar > $GARDEN_ACTION_OUTPUTS_PATH/foo"]
        action._config.spec.shell = true

        const resolvedAction = await garden.resolveAction({ log, graph, action })
        const { result: res } = await actions.build.build({ log, action: resolvedAction, graph })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from JSON file", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()

        action._config.spec.command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
        action._config.spec.shell = true

        const resolvedAction = await garden.resolveAction({ log, graph, action })
        const { result: res } = await actions.build.build({ log, action: resolvedAction, graph })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from status handler when status is ready", async () => {
        const action = graph.getBuild("module-local")
        const actions = await garden.getActionRouter()

        const command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
        action._config.spec.command = command
        action._config.spec.statusCommand = command
        action._config.spec.shell = true

        const resolvedAction = await garden.resolveAction({ log, graph, action })
        const { result: res } = await actions.build.getStatus({ log, action: resolvedAction, graph })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })
    })

    describe("Test", () => {
      it("should run the test command in the action dir if local true", async () => {
        const router = await garden.getActionRouter()

        const basePath = join(garden.projectRoot, "module-local")
        const rawAction = (await actionFromConfig({
          garden,
          graph,
          router,
          log,
          config: {
            type: "exec",
            kind: "Test",
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              command: ["pwd"],
            },
            internal: {
              basePath,
            },
          } as TestActionConfig,
          configsByKey: {},
          mode: "default",
          linkedSources: {},
        })) as TestAction

        const action = await garden.resolveAction<TestAction>({ action: rawAction, graph, log })
        const { result: res } = await router.test.run({
          log,
          interactive: false,
          graph,
          silent: false,
          action,
        })

        expect(res.outputs.log).to.eql(basePath)
        expect(res.outputs.stdout).to.eql(basePath)
      })

      it("should receive version as an env var", async () => {
        const router = await garden.getActionRouter()
        const rawAction = (await actionFromConfig({
          garden,
          graph,
          router,
          log,
          config: {
            type: "exec",
            kind: "Test",
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              shell: true,
              command: ["echo $GARDEN_ACTION_VERSION"],
            },
            internal: {
              basePath: garden.projectRoot,
            },
          } as TestActionConfig,
          configsByKey: {},
          linkedSources: {},
          mode: "default",
        })) as TestAction
        const action = await garden.resolveAction({ action: rawAction, graph, log })
        const { result: res } = await router.test.run({
          log,
          action,
          interactive: true,
          graph,
          silent: false,
        })
        expect(res.outputs.log).to.equal(action.versionString(log))
        expect(res.outputs.stdout).to.equal(action.versionString(log))
      })

      it("should return 'ready' status if statusCommand returns zero exit code", async () => {
        const action = graph.getTest("test-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["echo", "ready"]
        const { result: res } = await actions.test.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("ready")
      })

      it("should return 'not-ready' status if statusCommand returns non-zero exit code", async () => {
        const action = graph.getTest("test-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["exit 1"]
        const { result: res } = await actions.test.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("not-ready")
      })

      it("should return 'unknown' status if no statusCommand is set", async () => {
        const action = graph.getTest("test-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = undefined
        const { result: res } = await actions.test.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("should return 'unknown' status if statusCommand is empty", async () => {
        const action = graph.getTest("test-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = []
        const { result: res } = await actions.test.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("throws if status command is invalid", async () => {
        const action = graph.getTest("test-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = false
        resolvedAction._config.spec.statusCommand = ["jkghslfdkjghsdlfjkghsldjkgf"]
        await expectError(
          async () => await actions.test.getResult({ log, action: resolvedAction, graph }),
          (err) => expect(err.message).to.include("ENOENT")
        )
      })

      it("should receive outputs from files", async () => {
        const router = await garden.getActionRouter()
        const rawAction = (await actionFromConfig({
          garden,
          graph,
          router,
          log,
          config: {
            type: "exec",
            kind: "Test",
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              shell: true,
              command: ["echo bar > $GARDEN_ACTION_OUTPUTS_PATH/foo"],
            },
            internal: {
              basePath: garden.projectRoot,
            },
          } as TestActionConfig,
          configsByKey: {},
          linkedSources: {},
          mode: "default",
        })) as TestAction
        const action = await garden.resolveAction({ action: rawAction, graph, log })
        const { result: res } = await router.test.run({ log, action, graph, interactive: false, silent: false })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from JSON file", async () => {
        const router = await garden.getActionRouter()
        const rawAction = (await actionFromConfig({
          garden,
          graph,
          router,
          log,
          config: {
            type: "exec",
            kind: "Test",
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              shell: true,
              command: ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH'],
            },
            internal: {
              basePath: garden.projectRoot,
            },
          } as TestActionConfig,
          configsByKey: {},
          linkedSources: {},
          mode: "default",
        })) as TestAction
        const action = await garden.resolveAction({ action: rawAction, graph, log })
        const { result: res } = await router.test.run({ log, action, graph, interactive: false, silent: false })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from status handler when status is ready", async () => {
        const router = await garden.getActionRouter()
        const command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
        const rawAction = (await actionFromConfig({
          garden,
          graph,
          router,
          log,
          config: {
            type: "exec",
            kind: "Test",
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              shell: true,
              command,
              statusCommand: command,
            },
            internal: {
              basePath: garden.projectRoot,
            },
          } as TestActionConfig,
          configsByKey: {},
          linkedSources: {},
          mode: "default",
        })) as TestAction
        const action = await garden.resolveAction({ action: rawAction, graph, log })
        const { result: res } = await router.test.getResult({ log, action, graph })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })
    })

    describe("Run", () => {
      it("should run the task command in the action dir if local true", async () => {
        const actions = await garden.getActionRouter()
        const task = graph.getRun("pwd")
        const action = await garden.resolveAction({ action: task, graph, log })
        const { result: res } = await actions.run.run({
          log,
          action,
          interactive: true,
          graph,
        })

        const expectedLogPath = join(garden.projectRoot, "module-local")
        expect(res.detail?.log).to.eql(expectedLogPath)
      })

      it("should receive action version as an env var", async () => {
        const actions = await garden.getActionRouter()
        const task = graph.getRun("pwd")
        const action = await garden.resolveAction({ action: task, graph, log })

        action._config.spec.shell = true
        action._config.spec.command = ["echo", "$GARDEN_ACTION_VERSION"]

        const { result: res } = await actions.run.run({
          log,
          action,
          interactive: true,
          graph,
        })

        expect(res.detail?.log).to.equal(action.versionString(log))
      })

      it("should return 'ready' status if statusCommand returns zero exit code", async () => {
        const action = graph.getRun("run-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["echo"]
        const { result: res } = await actions.run.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("ready")
      })

      it("should return 'not-ready' status if statusCommand returns non-zero exit code", async () => {
        const action = graph.getRun("run-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = true
        resolvedAction._config.spec.statusCommand = ["exit 1"]
        const { result: res } = await actions.run.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("not-ready")
      })

      it("should return 'unknown' status if no statusCommand is set", async () => {
        const action = graph.getRun("run-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = undefined
        const { result: res } = await actions.run.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("should return 'unknown' status if statusCommand is empty", async () => {
        const action = graph.getRun("run-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.statusCommand = []
        const { result: res } = await actions.run.getResult({ log, action: resolvedAction, graph })
        expect(res.state).to.eql("unknown")
      })

      it("throws if status command is invalid", async () => {
        const action = graph.getRun("run-status")
        const actions = await garden.getActionRouter()
        const resolvedAction = await garden.resolveAction({ action, log, graph })
        resolvedAction._config.spec.shell = false
        resolvedAction._config.spec.statusCommand = ["jkghslfdkjghsdlfjkghsldjkgf"]
        await expectError(
          async () => await actions.run.getResult({ log, action: resolvedAction, graph }),
          (err) => expect(err.message).to.include("ENOENT")
        )
      })

      it("should receive outputs from files", async () => {
        const actions = await garden.getActionRouter()
        const task = graph.getRun("pwd")
        const action = await garden.resolveAction({ action: task, graph, log })

        action._config.spec.command = ["echo bar > $GARDEN_ACTION_OUTPUTS_PATH/foo"]
        action._config.spec.shell = true

        const { result: res } = await actions.run.run({
          log,
          action,
          interactive: true,
          graph,
        })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from JSON file", async () => {
        const actions = await garden.getActionRouter()
        const task = graph.getRun("pwd")
        const action = await garden.resolveAction({ action: task, graph, log })

        action._config.spec.command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
        action._config.spec.shell = true

        const { result: res } = await actions.run.run({
          log,
          action,
          interactive: true,
          graph,
        })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })

      it("should receive outputs from status handler when status is ready", async () => {
        const actions = await garden.getActionRouter()
        const task = graph.getRun("pwd")
        const action = await garden.resolveAction({ action: task, graph, log })

        const command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
        action._config.spec.command = command
        action._config.spec.statusCommand = command
        action._config.spec.shell = true

        const { result: res } = await actions.run.getResult({
          log,
          action,
          graph,
        })

        expect(res.outputs).to.eql({ foo: "bar", log: "", stdout: "", stderr: "" })
      })
    })

    context("Deploy", () => {
      let touchFilePath: string

      beforeEach(async () => {
        touchFilePath = join(garden.projectRoot, "module-local", "deployed.log")
        await remove(touchFilePath)
      })

      describe("deployExec", () => {
        it("runs the Deploy's deployCommand with the specified env vars", async () => {
          const rawAction = graph.getDeploy("echo")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ log, graph, action: rawAction })
          const { result: res } = await router.deploy.deploy({
            force: false,

            log,
            action,
            graph,
          })
          expect(res.state).to.eql("ready")
          expect(res.detail?.state).to.eql("ready")
          expect(res.detail?.detail.deployCommandOutput).to.eql("deployed echo service")
        })

        it("skips deploying if deployCommand is empty but does not throw", async () => {
          const rawAction = graph.getDeploy("empty")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: res } = await router.deploy.deploy({
            force: false,

            log,
            action,
            graph,
          })
          expect(res.detail?.detail.skipped).to.eql(true)
        })

        it("throws if deployCommand returns with non-zero code", async () => {
          const rawAction = graph.getDeploy("error")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          await expectError(
            async () =>
              await router.deploy.deploy({
                force: false,

                log,
                action,
                graph,
              }),
            (err) =>
              expect(err.message).to.equal(dedent`
            Command "sh -c "echo fail! && exit 1"" failed with code 1:

            Here's the full output:

            fail!
            `)
          )
        })

        it("should receive outputs from files", async () => {
          const rawAction = graph.getDeploy("echo")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })

          action._config.spec.deployCommand = ["echo bar > $GARDEN_ACTION_OUTPUTS_PATH/foo"]
          action._config.spec.statusCommand = []
          action._config.spec.shell = true

          const { result: res } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          expect(res.state).to.eql("ready")

          expect(res.outputs).to.eql({
            foo: "bar",
            log: "",
            stdout: "",
            stderr: "",
          })
        })

        it("should receive outputs from JSON file", async () => {
          const rawAction = graph.getDeploy("echo")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })

          action._config.spec.deployCommand = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
          action._config.spec.statusCommand = []
          action._config.spec.shell = true

          const { result: res } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          expect(res.outputs).to.eql({
            foo: "bar",
            log: "",
            stdout: "",
            stderr: "",
          })
        })

        it("should receive outputs from status handler when status is ready", async () => {
          const rawAction = graph.getDeploy("echo")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })

          const command = ['echo \'{"foo": "bar"}\' > $GARDEN_ACTION_JSON_OUTPUTS_PATH']
          action._config.spec.deployCommand = command
          action._config.spec.statusCommand = command
          action._config.spec.shell = true

          const { result: res } = await router.deploy.getStatus({
            log,
            action,
            graph,
          })

          expect(res.outputs).to.eql({
            foo: "bar",
            log: "",
            stdout: "",
            stderr: "",
          })
        })
      })

      describe("getExecDeployStatus", async () => {
        it("returns 'unknown' if no statusCommand is set", async () => {
          const actionName = "error"
          const rawAction = graph.getDeploy(actionName)
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const res = await router.getDeployStatuses({
            log,
            graph,
            names: [action.name],
          })

          const actionRes = res[actionName]
          expect(actionRes.state).to.equal("unknown")
          const detail = actionRes.detail!
          expect(detail.state).to.equal("unknown")
          expect(detail.detail).to.be.empty
        })

        it("returns 'ready' if statusCommand returns zero exit code", async () => {
          const actionName = "touch"
          const rawAction = graph.getDeploy(actionName)
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })
          const res = await router.getDeployStatuses({
            log,
            graph,
            names: [action.name],
          })

          const actionRes = res[actionName]
          expect(actionRes.state).to.equal("ready")
          const detail = actionRes.detail!
          expect(detail.state).to.equal("ready")
          expect(detail.detail.statusCommandOutput).to.equal("already deployed")
        })

        it("returns 'not-ready' if statusCommand returns non-zero exit code", async () => {
          const actionName = "touch"
          const rawAction = graph.getDeploy(actionName)
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const res = await router.getDeployStatuses({
            graph,
            log,
            names: [action.name],
          })

          const actionRes = res[actionName]
          expect(actionRes.state).to.equal("not-ready")
          const detail = actionRes.detail!
          // The deploy state is different (has more states) than the action state
          expect(detail.state).to.equal("outdated")
          expect(detail.detail.statusCommandOutput).to.be.empty
        })
      })

      describe("deleteExecDeploy", async () => {
        it("runs the cleanup command if set", async () => {
          const rawAction = graph.getDeploy("touch")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })
          const { result: res } = await router.deploy.delete({
            log,
            graph,
            action,
          })

          expect(res.state).to.equal("not-ready")
          const detail = res.detail!
          expect(detail.state).to.equal("missing")
          expect(detail.detail.cleanupCommandOutput).to.equal("cleaned up")
        })

        it("returns 'unknown' state if no cleanupCommand is set", async () => {
          const rawAction = graph.getDeploy("echo")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: res } = await router.deploy.delete({
            log,
            graph,
            action,
          })

          expect(res.state).to.equal("unknown")
          expect(res.detail?.state).to.equal("unknown")
        })

        it("throws if cleanupCommand returns with non-zero code", async () => {
          const rawAction = graph.getDeploy("error")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          await expectError(
            async () =>
              await router.deploy.delete({
                log,
                action,
                graph,
              }),
            (err) =>
              expect(err.message).to.equal(dedent`
            Command "sh -c "echo fail! && exit 1"" failed with code 1:

            Here's the full output:

            fail!
            `)
          )
        })
      })

      context("persistent Deploys", () => {
        // We set the pid in the "it" statements.
        let pid = -1

        beforeEach(async () => {
          graph = await garden.getConfigGraph({
            log: garden.log,
            emit: false,
            actionModes: { sync: ["deploy.sync-*"] },
          })
        })

        afterEach(async () => {
          if (pid > 1) {
            try {
              await killRecursive("SIGKILL", pid)
            } catch (_err) {}
          }
        })

        it("should run a persistent local service in sync mode", async () => {
          const rawAction = graph.getDeploy("sync-mode")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: res } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          pid = res.detail?.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)
        })
        it("deleteExecDeploy kills the persistent local process", async () => {
          const rawAction = graph.getDeploy("sync-mode")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: deployRes } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          pid = deployRes.detail?.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)

          await router.deploy.delete({
            log,
            graph,
            action,
          })

          // Since the `kill` CLI command exits immediately (before the process terminates), we need to wait a little.
          await sleep(2000)

          expect(isRunning(pid)).to.be.false
        })
        it("should write logs to a local file with the proper format", async () => {
          // This services just echos a string N times before exiting.
          const rawAction = graph.getDeploy("sync-mode-with-logs")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: res } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          // Wait for entries to be written since we otherwise don't wait on persistent commands (unless
          // a status command is set).
          await sleep(1500)

          pid = res.detail?.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)

          const logFilePath = getLogFilePath({ ctx, deployName: action.name })
          const logFileContents = (await readFile(logFilePath)).toString()
          const logEntriesWithoutTimestamps = logFileContents
            .split("\n")
            .filter((line) => !!line)
            .map((line) => JSON.parse(line))
            .map((parsed) => omit(parsed, "timestamp"))

          expect(logEntriesWithoutTimestamps).to.eql([
            {
              name: "sync-mode-with-logs",
              msg: "Hello 1",
              level: 2,
            },
            {
              name: "sync-mode-with-logs",
              msg: "Hello 2",
              level: 2,
            },
            {
              name: "sync-mode-with-logs",
              msg: "Hello 3",
              level: 2,
            },
            {
              name: "sync-mode-with-logs",
              msg: "Hello 4",
              level: 2,
            },
            {
              name: "sync-mode-with-logs",
              msg: "Hello 5",
              level: 2,
            },
          ])
        })
        it("should handle empty log lines", async () => {
          // This services just echos a string N times before exiting.
          const rawAction = graph.getDeploy("sync-mode-with-empty-log-lines")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const { result: res } = await router.deploy.deploy({
            force: false,
            log,
            action,
            graph,
          })

          // Wait for entries to be written since we otherwise don't wait on persistent commands (unless
          // a status command is set).
          await sleep(1500)

          pid = res.detail?.detail.pid

          const logFilePath = getLogFilePath({ ctx, deployName: action.name })
          const logFileContents = (await readFile(logFilePath)).toString()
          const logEntriesWithoutTimestamps = logFileContents
            .split("\n")
            .filter((line) => !!line)
            .map((line) => JSON.parse(line))
            .map((parsed) => omit(parsed, "timestamp"))

          expect(logEntriesWithoutTimestamps).to.eql([
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "1",
              level: 2,
            },
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "2",
              level: 2,
            },
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              name: "sync-mode-with-empty-log-lines",
              msg: "3",
              level: 2,
            },
          ])
        })
        it("should eventually timeout if status command is set and it returns a non-zero exit code ", async () => {
          const rawAction = graph.getDeploy("sync-mode-timeout")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let error: any
          try {
            await router.deploy.deploy({
              force: false,
              log,
              action,
              graph,
            })
          } catch (err) {
            error = err
          }

          expect(error.message).to.include(`Timed out waiting for local service sync-mode-timeout to be ready.`)
          expect(error.message).to.include(`The last exit code was 1.`)
          expect(error.message).to.include(`Command output:\nStatus command output`)
        })
      })
    })
  })

  /**
   * Test specs in this context use {@link convertModules} helper function
   * to test the whole module-to-action conversion chain,
   * including the creation of {@link ConvertModuleParams} object and passing it to {@link ModuleRouter#convert}
   * via the {@link ActionRouter}.
   *
   * This has been done because mocking of {@link ConvertModuleParams} is not easy and can be fragile,
   * as it requires implementation of naming-conversion and construction of services, tasks and tests.
   *
   * In order to test the {@link ExecModule}-to-action conversion,
   * the test {@link Garden} instance must have a configured "exec" provider and "exec" plugin.
   *
   * Each test spec used temporary Garden project initialized in a tmp dir,
   * and doesn't use any disk-located pre-defined test projects.
   *
   * Each test spec defines a minimalistic module-based config and re-initializes the {@link ConfigGraph} instance.
   */
  context("code-based config tests", () => {
    describe("convert", () => {
      async function makeGarden(tmpDirResult: tmp.DirectoryResult): Promise<TestGarden> {
        const config: ProjectConfig = createProjectConfig({
          path: tmpDirResult.path,
          providers: [{ name: "exec" }],
        })

        return TestGarden.factory(tmpDirResult.path, { config, plugins: [gardenPlugin] })
      }

      let tmpDir: tmp.DirectoryResult
      let garden: TestGarden

      before(async () => {
        tmpDir = await makeTempDir({ git: true, initialCommit: false })
        garden = await makeGarden(tmpDir)
      })

      after(async () => {
        await tmpDir.cleanup()
      })

      context("variables", () => {
        it("adds configured variables to the Group", async () => {
          const moduleA = "module-a"
          const taskCommand = ["echo", moduleA]
          const variables = { FOO: "foo", BAR: "bar" }
          garden.setPartialModuleConfigs([
            makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
              name: moduleA,
              type: "exec",
              variables,
              spec: {
                build: {
                  command: [],
                },
                services: [],
                tests: [],
                tasks: [
                  {
                    name: "task-a",
                    command: taskCommand,
                    dependencies: [],
                    disabled: false,
                    env: {},
                    timeout: 10,
                  },
                ],
                env: {},
              },
            }),
          ])
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })
          const module = tmpGraph.getModule(moduleA)

          const result = await convertModules(garden, garden.log, [module], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const group = findGroupConfig(result, moduleA)!
          expect(group).to.exist
          expect(group.variables).to.eql(variables)
        })
      })

      context("Build action", () => {
        it("adds a Build action if build.command is set", async () => {
          const moduleA = "module-a"
          const buildCommand = ["echo", moduleA]
          const statusCommand = ["echo", "ready"]
          garden.setPartialModuleConfigs([
            makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
              name: moduleA,
              type: "exec",
              spec: {
                build: {
                  command: buildCommand,
                  statusCommand,
                },
                services: [],
                tasks: [],
                tests: [],
                env: {},
              },
            }),
          ])
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })
          const module = tmpGraph.getModule(moduleA)

          const result = await convertModules(garden, garden.log, [module], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const group = findGroupConfig(result, moduleA)!
          expect(group.actions).to.exist
          expect(group.actions.length).to.eql(1)

          const build = findActionConfigInGroup(group, "Build", moduleA) as BuildActionConfig
          expect(build).to.exist
          expect(build.name).to.eql(moduleA)
          expect(build.spec.command).to.eql(buildCommand)
          expect(build.spec.statusCommand).to.eql(statusCommand)
        })

        it("adds a Build action if build.dependencies[].copy is set and adds a copy field", async () => {
          const moduleNameA = "module-a"
          const moduleNameB = "module-b"
          const buildCommandA = ["echo", moduleNameA]
          const buildCommandB = ["echo", moduleNameB]

          const sourcePath = "./module-a.out"
          const targetPath = "a/module-a.out"

          garden.setPartialModuleConfigs([
            makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
              name: moduleNameA,
              type: "exec",
              spec: {
                build: {
                  command: buildCommandA,
                },
                services: [],
                tasks: [],
                tests: [],
                env: {},
              },
            }),
            makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
              name: moduleNameB,
              type: "exec",
              // module-level build config
              build: {
                dependencies: [
                  {
                    name: moduleNameA,
                    copy: [
                      {
                        source: sourcePath,
                        target: targetPath,
                      },
                    ],
                  },
                ],
                timeout: DEFAULT_BUILD_TIMEOUT_SEC,
              },
              spec: {
                // exec-plugin specific build config defined in the spec
                build: {
                  command: buildCommandB,
                },
                services: [],
                tasks: [],
                tests: [],
                env: {},
              },
            }),
          ])
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })
          const moduleB = tmpGraph.getModule(moduleNameB)

          const result = await convertModules(garden, garden.log, [moduleB], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupB = findGroupConfig(result, moduleNameB)!
          expect(groupB.actions).to.exist
          expect(groupB.actions.length).to.eql(1)

          const buildB = findActionConfigInGroup(groupB, "Build", moduleNameB)! as BuildActionConfig
          expect(buildB).to.exist
          expect(buildB.name).to.eql(moduleNameB)
          expect(buildB.spec.command).to.eql(buildCommandB)
          expect(buildB.copyFrom).to.eql([{ build: moduleNameA, sourcePath, targetPath }])
        })

        /**
         * See TODO-G2 comments in {@link preprocessActionConfig}.
         */
        it.skip("converts the repositoryUrl field", async () => {
          throw "TODO-G2"
        })

        it.skip("sets Build dependencies correctly", async () => {
          throw "TODO-G2"
        })

        describe("sets buildAtSource on Build", () => {
          async function getGraph(name: string, local: boolean) {
            const buildCommand = ["echo", name]
            garden.setPartialModuleConfigs([
              makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
                name,
                type: "exec",
                local, // <---
                spec: {
                  build: {
                    command: buildCommand,
                  },
                  services: [],
                  tasks: [],
                  tests: [],
                  env: {},
                },
              }),
            ])
            return garden.getConfigGraph({ log: garden.log, emit: false })
          }

          function assertBuildAtSource(moduleName: string, result: ConvertModulesResult, buildAtSource: boolean) {
            expect(result.groups).to.exist

            const group = findGroupConfig(result, moduleName)!
            expect(group.actions).to.exist
            expect(group.actions.length).to.eql(1)

            const build = findActionConfigInGroup(group, "Build", moduleName)! as BuildActionConfig
            expect(build).to.exist
            expect(build.buildAtSource).to.eql(buildAtSource)
          }

          it("sets buildAtSource on Build if local:true", async () => {
            const moduleA = "module-a"
            const tmpGraph = await getGraph(moduleA, true)
            const module = tmpGraph.getModule(moduleA)
            const result = await convertModules(garden, garden.log, [module], tmpGraph.moduleGraph)

            assertBuildAtSource(module.name, result, true)
          })

          it("does not set buildAtSource on Build if local:false", async () => {
            const moduleA = "module-a"
            const tmpGraph = await getGraph(moduleA, false)
            const module = tmpGraph.getModule(moduleA)
            const result = await convertModules(garden, garden.log, [module], tmpGraph.moduleGraph)

            assertBuildAtSource(module.name, result, false)
          })
        })
      })

      context("Deploy/Run/Test (runtime) actions", () => {
        it("correctly maps a serviceConfig to a Deploy with a build", async () => {
          // Dependencies
          // build field
          // timeout
          // service spec

          const moduleNameA = "module-a"
          const buildCommandA = ["echo", moduleNameA]
          const deployNameA = "service-a"
          const deployCommandA = ["echo", "deployed", deployNameA]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- plugin-level build field
              build: {
                command: buildCommandA,
              },
              services: [
                {
                  name: deployNameA,
                  deployCommand: deployCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              tasks: [],
              tests: [],
              env: {},
            },
          })

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `serviceConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `serviceConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          expect(buildA).to.exist
          expect(buildA.dependencies).to.eql([])

          const deployA = findActionConfigInGroup(groupA, "Deploy", deployNameA)! as DeployActionConfig
          expect(deployA).to.exist
          expect(deployA.build).to.eql(moduleNameA)
          expect(deployA.dependencies).to.eql([])
        })

        it("correctly maps a serviceConfig to a Deploy with no build", async () => {
          // Dependencies
          // + build dependencies
          // timeout
          // service spec

          const moduleNameA = "module-a"
          const deployNameA = "service-a"
          const deployCommandA = ["echo", "deployed", deployNameA]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- build field
              build: {
                command: [], // <--- empty build command
              },
              services: [
                {
                  name: deployNameA,
                  deployCommand: deployCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              tasks: [],
              tests: [],
              env: {},
            },
          })
          delete moduleConfigA.spec.build // <--- delete build from the spec to ensure there is no build action

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `serviceConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `serviceConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          // build action must be missing
          expect(buildA).to.not.exist

          const deployA = findActionConfigInGroup(groupA, "Deploy", deployNameA)! as DeployActionConfig
          expect(deployA).to.exist
          // no build name expected here
          expect(deployA.build).to.not.exist
          expect(deployA.dependencies).to.eql([])
        })

        it("correctly maps a taskConfig to a Run with a build", async () => {
          // Dependencies
          // build field
          // timeout
          // task spec

          const moduleNameA = "module-a"
          const buildCommandA = ["echo", moduleNameA]
          const taskNameA = "task-a"
          const commandA = ["echo", "run", taskNameA]
          const statusCommandA = ["echo", "ready"]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- plugin-level build field
              build: {
                command: buildCommandA,
              },
              services: [],
              tests: [],
              tasks: [
                {
                  name: taskNameA,
                  command: commandA,
                  statusCommand: statusCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              env: {},
            },
          })

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `taskConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `taskConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          expect(buildA).to.exist
          expect(buildA.dependencies).to.eql([])

          const runA = findActionConfigInGroup(groupA, "Run", taskNameA)! as RunActionConfig
          expect(runA).to.exist
          expect(runA.build).to.eql(moduleNameA)
          expect(runA.dependencies).to.eql([])
          expect(runA.spec.command).to.eql(commandA)
          expect(runA.spec.statusCommand).to.eql(statusCommandA)
        })

        it("correctly maps a taskConfig to a Run with no build", async () => {
          // Dependencies
          // + build dependencies
          // timeout
          // task spec

          const moduleNameA = "module-a"
          const taskNameA = "task-a"
          const commandA = ["echo", "run", taskNameA]
          const statusCommandA = ["echo", "ready"]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- build field
              build: {
                command: [], // <--- empty build command
              },
              services: [],
              tasks: [
                {
                  name: taskNameA,
                  command: commandA,
                  statusCommand: statusCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              tests: [],
              env: {},
            },
          })
          delete moduleConfigA.spec.build // <--- delete build from the spec to ensure there is no build action

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `taskConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `taskConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          // build action must be missing
          expect(buildA).to.not.exist

          const runA = findActionConfigInGroup(groupA, "Run", taskNameA)! as RunActionConfig
          expect(runA).to.exist
          // no build name expected here
          expect(runA.build).to.not.exist
          expect(runA.dependencies).to.eql([])
          expect(runA.spec.command).to.eql(commandA)
          expect(runA.spec.statusCommand).to.eql(statusCommandA)
        })

        it("correctly maps a testConfig to a Test with a build", async () => {
          // Dependencies
          // build field
          // timeout
          // test spec

          const moduleNameA = "module-a"
          const buildCommandA = ["echo", moduleNameA]
          const testNameA = "test-a"
          const convertedTestNameA = "module-a-test-a"
          const commandA = ["echo", "test", testNameA]
          const statusCommandA = ["echo", "ready"]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- plugin-level build field
              build: {
                command: buildCommandA,
              },
              services: [],
              tasks: [],
              tests: [
                {
                  name: testNameA,
                  command: commandA,
                  statusCommand: statusCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              env: {},
            },
          })

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `testConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `testConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          expect(buildA).to.exist
          expect(buildA.dependencies).to.eql([])

          const testA = findActionConfigInGroup(groupA, "Test", convertedTestNameA)! as TestActionConfig
          expect(testA).to.exist
          expect(testA.build).to.eql(moduleNameA)
          expect(testA.dependencies).to.eql([])
          expect(testA.spec.command).to.eql(commandA)
          expect(testA.spec.statusCommand).to.eql(statusCommandA)
        })

        it("correctly maps a testConfig to a Test with no build", async () => {
          // Dependencies
          // + build dependencies
          // timeout
          // test spec

          const moduleNameA = "module-a"
          const testNameA = "test-a"
          const convertedTestNameA = "module-a-test-a"
          const commandA = ["echo", "test", testNameA]
          const statusCommandA = ["echo", "ready"]
          const moduleConfigA = makeModuleConfig<ExecModuleConfig>(garden.projectRoot, {
            name: moduleNameA,
            type: "exec",
            spec: {
              // <--- build field
              build: {
                command: [], // <--- empty build command
              },
              services: [],
              tasks: [],
              tests: [
                {
                  name: testNameA,
                  command: commandA,
                  statusCommand: statusCommandA,
                  dependencies: [],
                  disabled: false,
                  env: {},
                  timeout: 10,
                },
              ],
              env: {},
            },
          })
          delete moduleConfigA.spec.build // <--- delete build from the spec to ensure there is no build action

          garden.setPartialModuleConfigs([moduleConfigA])
          // this will produce modules with `testConfigs` fields initialized
          const tmpGraph = await garden.getConfigGraph({ log: garden.log, emit: false })

          const moduleA = tmpGraph.getModule(moduleNameA)

          // this will use `testConfigs` defined in modules
          const result = await convertModules(garden, garden.log, [moduleA], tmpGraph.moduleGraph)
          expect(result.groups).to.exist

          const groupA = findGroupConfig(result, moduleNameA)!
          expect(groupA).to.exist

          const buildA = findActionConfigInGroup(groupA, "Build", moduleNameA)! as BuildActionConfig
          // build action must be missing
          expect(buildA).to.not.exist

          const testA = findActionConfigInGroup(groupA, "Test", convertedTestNameA)! as TestActionConfig
          expect(testA).to.exist
          // no build name expected here
          expect(testA.build).to.not.exist
          expect(testA.dependencies).to.eql([])
          expect(testA.spec.command).to.eql(commandA)
          expect(testA.spec.statusCommand).to.eql(statusCommandA)
        })
      })
    })
  })
})
