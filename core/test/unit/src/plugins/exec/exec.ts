/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { spawn } from "child_process"
import { expect } from "chai"
import { join } from "path"
import psTree from "ps-tree"

import { Garden } from "../../../../../src/garden"
import { ExecProvider, gardenPlugin, getLogFilePath } from "../../../../../src/plugins/exec/exec"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { keyBy } from "lodash"
import { getDataDir, makeTestModule, expectError, createProjectConfig } from "../../../../helpers"
import { RunTask } from "../../../../../src/tasks/run"
import { makeTestGarden } from "../../../../helpers"
import { ModuleConfig } from "../../../../../src/config/module"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { pathExists, emptyDir } from "fs-extra"
import { TestTask } from "../../../../../src/tasks/test"
import { readFile, remove } from "fs-extra"
import { dedent } from "../../../../../src/util/string"
import { sleep } from "../../../../../src/util/util"
import { configureExecModule } from "../../../../../src/plugins/exec/moduleConfig"
import { actionFromConfig } from "../../../../../src/graph/actions"
import { TestAction, TestActionConfig } from "../../../../../src/actions/test"
import { GardenModule } from "../../../../../src/types/module"
import { PluginContext } from "../../../../../src/plugin-context"

describe("exec plugin", () => {
  const testProjectRoot = getDataDir("test-project-exec")
  const plugin = gardenPlugin()

  let garden: Garden
  let ctx: PluginContext
  let execProvider: ExecProvider
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(testProjectRoot, { plugins: [plugin] })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    execProvider = await garden.resolveProvider(garden.log, "exec")
    ctx = await garden.getPluginContext({ provider: execProvider, templateContext: undefined, events: undefined })
    log = garden.log
    await garden.clearBuilds()
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

    await expectError(() => _garden.resolveProviders(_garden.log), "plugin")
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
        },
      },
    ])
    expect(moduleA.taskConfigs).to.eql([
      {
        name: "banana",
        cacheResult: false,
        dependencies: ["orange"],
        disabled: false,
        timeout: null,
        spec: {
          artifacts: [],
          name: "banana",
          command: ["echo", "BANANA"],
          env: {},
          dependencies: ["orange"],
          disabled: false,
          timeout: null,
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
        timeout: null,
        spec: {
          name: "unit",
          artifacts: [],
          dependencies: [],
          disabled: false,
          command: ["echo", "OK"],
          env: {
            FOO: "boo",
          },
          timeout: null,
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
        timeout: null,
        spec: {
          name: "unit",
          artifacts: [],
          dependencies: [],
          disabled: false,
          command: ["echo", "OK"],
          env: {},
          timeout: null,
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
        timeout: null,
        spec: {
          name: "unit",
          dependencies: [],
          artifacts: [],
          disabled: false,
          command: ["echo", "OK"],
          env: {},
          timeout: null,
        },
      },
    ])

    expect(moduleLocal.spec.local).to.eql(true)
    expect(moduleLocal.build.dependencies).to.eql([])
    expect(moduleLocal.spec.build.command).to.eql(["pwd"])

    expect(moduleLocal.serviceConfigs).to.eql([
      {
        dependencies: [],
        disabled: false,

        name: "touch",
        spec: {
          cleanupCommand: ["rm -f deployed.log && echo cleaned up"],
          dependencies: [],
          deployCommand: ["touch deployed.log && echo deployed"],
          disabled: false,
          env: {},
          name: "touch",
          statusCommand: ["test -f deployed.log && echo already deployed"],
        },
      },
      {
        dependencies: [],
        disabled: false,

        name: "echo",
        spec: {
          dependencies: [],
          deployCommand: ["echo", "deployed $NAME"],
          disabled: false,
          env: { NAME: "echo service" },
          name: "echo",
        },
      },
      {
        dependencies: [],
        disabled: false,

        name: "error",
        spec: {
          cleanupCommand: ["sh", '-c "echo fail! && exit 1"'],
          dependencies: [],
          deployCommand: ["sh", '-c "echo fail! && exit 1"'],
          disabled: false,
          env: {},
          name: "error",
        },
      },
      {
        dependencies: [],
        disabled: false,

        name: "empty",
        spec: {
          dependencies: [],
          deployCommand: [],
          disabled: false,
          env: {},
          name: "empty",
        },
      },
    ])
    expect(moduleLocal.taskConfigs).to.eql([
      {
        name: "pwd",
        cacheResult: false,
        dependencies: [],
        disabled: false,
        timeout: null,
        spec: {
          name: "pwd",
          env: {},
          command: ["pwd"],
          artifacts: [],
          dependencies: [],
          disabled: false,
          timeout: null,
        },
      },
    ])
    expect(moduleLocal.testConfigs).to.eql([])
  })

  it("should propagate task logs to runtime outputs", async () => {
    const _garden = await makeTestGarden(getDataDir("test-projects", "exec-task-outputs"))
    const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
    const taskB = _graph.getRun("task-b")

    const taskTask = new RunTask({
      garden: _garden,
      graph: _graph,
      action: taskB,
      fromWatch: false,
      log: _garden.log,
      force: false,
      forceBuild: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })
    const results = await _garden.processTasks({ tasks: [taskTask], throwOnError: false })

    // Task A echoes "task-a-output" and Task B echoes the output from Task A
    expect(results["task.task-b"]).to.exist
    expect(results["task.task-b"]).to.have.property("output")
    expect(results["task.task-b"]!.result.log).to.equal("task-a-output")
    expect(results["task.task-b"]!.result).to.have.property("outputs")
    expect(results["task.task-b"]!.result.outputs.log).to.equal("task-a-output")
  })

  it("should copy artifacts after task runs", async () => {
    const _garden = await makeTestGarden(getDataDir("test-projects", "exec-artifacts"))
    const _graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })
    const run = _graph.getRun("task-a")

    const taskTask = new RunTask({
      garden: _garden,
      graph: _graph,
      action: run,
      fromWatch: false,
      log: _garden.log,
      force: false,
      forceBuild: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
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
      fromWatch: false,
      log: _garden.log,
      force: false,
      forceBuild: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    await emptyDir(_garden.artifactsPath)

    await _garden.processTasks({ tasks: [testTask], throwOnError: false })

    expect(await pathExists(join(_garden.artifactsPath, "test-outputs", "test-a.txt"))).to.be.true
  })

  describe("configureExecModule", () => {
    it("should throw if a local exec module has a build.copy spec", async () => {
      const moduleConfig = makeTestModule(<Partial<ModuleConfig>>{
        build: {
          dependencies: [
            {
              name: "foo",
              copy: [
                {
                  source: ".",
                  target: ".",
                },
              ],
            },
          ],
        },
        spec: { local: true },
      })
      await expectError(async () => await configureExecModule({ ctx, moduleConfig, log }), "configuration")
    })
  })

  describe("build", () => {
    it("should run the build command in the module dir if local true", async () => {
      const action = graph.getBuild("module-local")
      const actions = await garden.getActionRouter()
      const resolvedAction = await garden.resolveAction({ action, log, graph })
      const res = await actions.build.build({ log, action: resolvedAction, graph })

      const expectedBuildLog = join(garden.projectRoot, "module-local")
      expect(res.detail).to.eql({ buildLog: expectedBuildLog, fresh: true })
    })

    it("should receive module version as an env var", async () => {
      const action = graph.getBuild("module-local")
      const actions = await garden.getActionRouter()

      action._config.spec.command = ["echo", "$GARDEN_MODULE_VERSION"]
      const resolvedAction = await garden.resolveAction({ log, graph, action })
      const res = await actions.build.build({ log, action: resolvedAction, graph })

      expect(res.detail).to.eql({ buildLog: action.versionString(), fresh: true })
    })
  })

  describe("testExecModule", () => {
    it("should run the test command in the module dir if local true", async () => {
      const router = await garden.getActionRouter()
      const rawAction = (await actionFromConfig({
        garden,
        graph,
        router,
        log,
        config: {
          type: "test",
          kind: "Test",
          name: "test",
          dependencies: [],
          disabled: false,
          timeout: 1234,
          spec: {
            command: ["pwd"],
          },
          internal: {
            basePath: "TODO-G2",
          },
        } as TestActionConfig,
        configsByKey: {},
      })) as TestAction
      const action = await garden.resolveAction<TestAction>({ action: rawAction, graph, log })
      const res = await router.test.run({
        log,
        interactive: true,
        graph,
        silent: false,
        action,
      })
      expect(res.outputs).to.eql(join(garden.projectRoot, "module-local"))
    })

    it("should receive module version as an env var", async () => {
      const router = await garden.getActionRouter()
      const rawAction = (await actionFromConfig({
        garden,
        graph,
        router,
        log,
        config: {
          type: "test",
          kind: "Test",
          name: "test",
          dependencies: [],
          disabled: false,
          timeout: 1234,
          spec: {
            command: ["echo", "$GARDEN_MODULE_VERSION"],
          },
          internal: {
            basePath: "TODO-G2",
          },
        } as TestActionConfig,
        configsByKey: {},
      })) as TestAction
      const action = await garden.resolveAction({ action: rawAction, graph, log })
      const res = await router.test.run({
        log,
        action,
        interactive: true,
        graph,
        silent: false,
      })
      expect(res.outputs).to.equal(rawAction.versionString())
    })
  })

  describe("runExecTask", () => {
    it("should run the task command in the module dir if local true", async () => {
      const actions = await garden.getActionRouter()
      const task = graph.getRun("pwd")
      const action = await garden.resolveAction({ action: task, graph, log })
      const res = await actions.run.run({
        log,
        action,
        interactive: true,
        graph,
      })

      const expectedLogPath = join(garden.projectRoot, "module-local")
      // TODO-G2: there is also `res.detail.outputs` field existing in runtime here,
      //  which does not exist in the `RunResult` type declaration.
      //  Is it a bug? Reference `res.detail?.outputs` causes a TS compilation error.
      expect(res.detail?.log).to.eql(expectedLogPath)
    })

    it("should receive module version as an env var", async () => {
      const actions = await garden.getActionRouter()
      const task = graph.getRun("pwd")
      const action = await garden.resolveAction({ action: task, graph, log })

      action._config.spec.command = ["echo", "$GARDEN_MODULE_VERSION"]

      const res = await actions.run.run({
        log,
        action,
        interactive: true,
        graph,
      })

      // TODO-G2: see the comment is the previous spec
      expect(res.detail?.log).to.equal(action.versionString())
    })
  })

  describe("convert", () => {
    it("adds configured variables to the Group", async () => {
      throw "TODO"
    })

    it("adds a Build action if build.command is set", async () => {
      throw "TODO"
    })

    it("adds a Build action if build.dependencies[].copy is set and adds a copy field", async () => {
      throw "TODO"
    })

    it("converts the repositoryUrl field", async () => {
      throw "TODO"
    })

    it("sets Build dependencies correctly", async () => {
      throw "TODO"
    })

    it("sets buildAtSource on Build if local:true", async () => {
      throw "TODO"
    })

    it("correctly maps a serviceConfig to a Deploy with a build", async () => {
      throw "TODO"

      // Dependencies
      // build field
      // timeout
      // service spec
    })

    it("correctly maps a serviceConfig to a Deploy with no build", async () => {
      throw "TODO"

      // Dependencies
      // + build dependencies
      // timeout
      // service spec
    })

    it("correctly maps a taskConfig to a Run with a build", async () => {
      throw "TODO"

      // Dependencies
      // build field
      // timeout
      // task spec
    })

    it("correctly maps a taskConfig to a Run with no build", async () => {
      throw "TODO"

      // Dependencies
      // + build dependencies
      // timeout
      // task spec
    })

    it("correctly maps a testConfig to a Test with a build", async () => {
      throw "TODO"

      // Dependencies
      // build field
      // timeout
      // test spec
    })

    it("correctly maps a testConfig to a Test with no build", async () => {
      throw "TODO"

      // Dependencies
      // + build dependencies
      // timeout
      // test spec
    })
  })

  context("services", () => {
    let touchFilePath: string

    beforeEach(async () => {
      touchFilePath = join(garden.projectRoot, "module-local", "deployed.log")
      await remove(touchFilePath)
    })

    describe("deployExecService", () => {
      it("runs the service's deploy command with the specified env vars", async () => {
        const rawAction = graph.getDeploy("echo")
        const router = await garden.getActionRouter()
        const action = await garden.resolveAction({ log, graph, action: rawAction })
        const res = await router.deploy.deploy({
          devMode: false,
          force: false,

          localMode: false,
          log,
          action,
          graph,
        })
        expect(res.state).to.eql("ready")
        expect(res.detail?.state).to.eql("ready")
        expect(res.detail?.detail.deployCommandOutput).to.eql("deployed echo service")
      })

      it("skips deploying if deploy command is empty but does not throw", async () => {
        const rawAction = graph.getDeploy("empty")
        const router = await garden.getActionRouter()
        const action = await garden.resolveAction({ graph, log, action: rawAction })
        const res = await router.deploy.deploy({
          devMode: false,
          force: false,

          localMode: false,
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
              devMode: false,
              force: false,

              localMode: false,
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
      context("devMode", () => {
        // We set the pid in the "it" statements.
        let pid = -1

        afterEach(async () => {
          if (pid > 1) {
            try {
              // This ensures the actual child process gets killed.
              // See: https://github.com/sindresorhus/execa/issues/96#issuecomment-776280798
              psTree(pid, function (_err, children) {
                spawn(
                  "kill",
                  ["-9"].concat(
                    children.map(function (p) {
                      return p.PID
                    })
                  )
                )
              })
            } catch (_err) {}
          }
        })

        it("should run a persistent local service in dev mode", async () => {
          const rawAction = graph.getDeploy("dev-mode")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const res = await router.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
            log,
            action,
            graph,
          })

          pid = res.detail?.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)
        })
        it("should write logs to a local file with the proper format", async () => {
          // This services just echos a string N times before exiting.
          const rawAction = graph.getDeploy("dev-mode-with-logs")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const res = await router.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
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

          const logFilePath = getLogFilePath({ projectRoot: garden.projectRoot, deployName: action.name })
          const logFileContents = (await readFile(logFilePath)).toString()
          const logEntriesWithoutTimestamps = logFileContents
            .split("\n")
            .filter((line) => !!line)
            .map((line) => JSON.parse(line))
            .map((parsed) => {
              return {
                serviceName: parsed.serviceName,
                msg: parsed.msg,
                level: parsed.level,
              }
            })

          expect(logEntriesWithoutTimestamps).to.eql([
            {
              serviceName: "dev-mode-with-logs",
              msg: "Hello 1",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-logs",
              msg: "Hello 2",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-logs",
              msg: "Hello 3",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-logs",
              msg: "Hello 4",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-logs",
              msg: "Hello 5",
              level: 2,
            },
          ])
        })
        it("should handle empty log lines", async () => {
          // This services just echos a string N times before exiting.
          const rawAction = graph.getDeploy("dev-mode-with-empty-log-lines")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          const res = await router.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
            log,
            action,
            graph,
          })

          // Wait for entries to be written since we otherwise don't wait on persistent commands (unless
          // a status command is set).
          await sleep(1500)

          pid = res.detail?.detail.pid

          const logFilePath = getLogFilePath({ projectRoot: garden.projectRoot, deployName: action.name })
          const logFileContents = (await readFile(logFilePath)).toString()
          const logEntriesWithoutTimestamps = logFileContents
            .split("\n")
            .filter((line) => !!line)
            .map((line) => JSON.parse(line))
            .map((parsed) => {
              return {
                serviceName: parsed.serviceName,
                msg: parsed.msg,
                level: parsed.level,
              }
            })

          expect(logEntriesWithoutTimestamps).to.eql([
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "1",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "2",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "Hello",
              level: 2,
            },
            {
              serviceName: "dev-mode-with-empty-log-lines",
              msg: "3",
              level: 2,
            },
          ])
        })
        it("should eventually timeout if status command is set and it returns a non-zero exit code ", async () => {
          const rawAction = graph.getDeploy("dev-mode-timeout")
          const router = await garden.getActionRouter()
          const action = await garden.resolveAction({ graph, log, action: rawAction })
          let error: any
          try {
            await router.deploy.deploy({
              devMode: true,
              force: false,

              localMode: false,
              log,
              action,
              graph,
            })
          } catch (err) {
            error = err
          }

          pid = error.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)
          expect(error.detail.serviceName).to.eql("dev-mode-timeout")
          expect(error.detail.statusCommand).to.eql([`/bin/sh -c "echo Status command output; exit 1"`])
          expect(error.detail.timeout).to.eql(3)
          expect(error.message).to.include(`Timed out waiting for local service dev-mode-timeout to be ready.`)
          expect(error.message).to.include(`The last exit code was 1.`)
          expect(error.message).to.include(`Command output:\nStatus command output`)
        })
      })
    })

    describe("getExecServiceStatus", async () => {
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
        expect(detail.version).to.equal(action.versionString())
        expect(detail.detail).to.be.empty
      })

      it("returns 'ready' if statusCommand returns zero exit code", async () => {
        const actionName = "touch"
        const rawAction = graph.getDeploy(actionName)
        const router = await garden.getActionRouter()
        const action = await garden.resolveAction({ graph, log, action: rawAction })
        await router.deploy.deploy({
          devMode: false,

          localMode: false,
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
        expect(detail.version).to.equal(action.versionString())
        expect(detail.detail.statusCommandOutput).to.equal("already deployed")
      })

      it("returns 'outdated' if statusCommand returns non-zero exit code", async () => {
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
        expect(actionRes.state).to.equal("outdated")
        const detail = actionRes.detail!
        expect(detail.state).to.equal("outdated")
        expect(detail.version).to.equal(action.versionString())
        expect(detail.detail.statusCommandOutput).to.be.empty
      })
    })

    describe("deleteExecService", async () => {
      it("runs the cleanup command if set", async () => {
        const rawAction = graph.getDeploy("touch")
        const router = await garden.getActionRouter()
        const action = await garden.resolveAction({ graph, log, action: rawAction })
        await router.deploy.deploy({
          devMode: false,

          localMode: false,
          force: false,
          log,
          action,
          graph,
        })
        const res = await router.deploy.delete({
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
        const res = await router.deploy.delete({
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
  })
})
