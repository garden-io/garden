/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { spawn } from "child_process"
import { expect } from "chai"
import { join, resolve } from "path"
import psTree from "ps-tree"

import { Garden } from "../../../../../src/garden"
import { gardenPlugin, getLogFilePath } from "../../../../../src/plugins/exec/exec"
import { GARDEN_BUILD_VERSION_FILENAME, DEFAULT_API_VERSION } from "../../../../../src/constants"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { keyBy } from "lodash"
import { getDataDir, makeTestModule, expectError } from "../../../../helpers"
import { RunTask } from "../../../../../src/tasks/run"
import { readModuleVersionFile } from "../../../../../src/vcs/vcs"
import { dataDir, makeTestGarden } from "../../../../helpers"
import { ModuleConfig } from "../../../../../src/config/module"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { pathExists, emptyDir } from "fs-extra"
import { TestTask } from "../../../../../src/tasks/test"
import { defaultNamespace } from "../../../../../src/config/project"
import { readFile, remove } from "fs-extra"
import { testFromConfig } from "../../../../../src/types/test"
import { dedent } from "../../../../../src/util/string"
import { sleep } from "../../../../../src/util/util"
import { defaultDotIgnoreFile } from "../../../../../src/util/fs"
import { configureExecModule } from "../../../../../src/plugins/exec/moduleConfig"

describe("exec plugin", () => {
  const moduleName = "module-a"
  const testProjectRoot = resolve(dataDir, "test-project-exec")
  const plugin = gardenPlugin()

  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(testProjectRoot, { plugins: [plugin] })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    log = garden.log
    await garden.clearBuilds()
  })

  it("should run a script on init in the project root, if configured", async () => {
    const _garden = await makeTestGarden(testProjectRoot, {
      plugins: [plugin],
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: garden.projectRoot,
        defaultEnvironment: "default",
        dotIgnoreFile: defaultDotIgnoreFile,
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "exec", initScript: "echo hello! > .garden/test.txt" }],
        variables: {},
      },
      noCache: true,
    })

    await _garden.getConfigGraph({ log: _garden.log, emit: false, noCache: true })

    const f = await readFile(join(_garden.projectRoot, ".garden", "test.txt"))

    expect(f.toString().trim()).to.equal("hello!")
  })

  it("should throw if a script configured and exits with a non-zero code", async () => {
    const _garden = await makeTestGarden(garden.projectRoot, {
      plugins: [plugin],
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: testProjectRoot,
        defaultEnvironment: "default",
        dotIgnoreFile: defaultDotIgnoreFile,
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "exec", initScript: "echo oh no!; exit 1" }],
        variables: {},
      },
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
    const taskB = _graph.getTask("task-b")

    const taskTask = new RunTask({
      garden: _garden,
      graph: _graph,
      task: taskB,
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
    const task = _graph.getTask("task-a")

    const taskTask = new RunTask({
      garden: _garden,
      graph: _graph,
      task,
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
    const test = _graph.getTest("module-a", "test-a")

    const testTask = new TestTask({
      garden: _garden,
      graph: _graph,
      test,
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
        local: true,
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
      })
      const provider = await garden.resolveProvider(garden.log, "test-plugin")
      const ctx = await garden.getPluginContext(provider)
      await expectError(async () => await configureExecModule({ ctx, moduleConfig, log }), "configuration")
    })
  })

  describe("build", () => {
    it("should write a build version file after building", async () => {
      const module = graph.getModule(moduleName)
      const buildMetadataPath = module.buildMetadataPath
      const versionFilePath = join(buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)

      await garden.buildStaging.syncFromSrc(module, log)
      const actions = await garden.getActionRouter()
      await actions.build.build({ log, module, graph })

      const versionFileContents = await readModuleVersionFile(versionFilePath)

      expect(versionFileContents).to.eql(module.version)
    })

    it("should run the build command in the module dir if local true", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.build.build({ log, module, graph })
      expect(res.buildLog).to.eql(join(garden.projectRoot, "module-local"))
    })

    it("should receive module version as an env var", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()

      module.spec.build.command = ["echo", "$GARDEN_MODULE_VERSION"]
      const res = await actions.build.build({ log, module, graph })

      expect(res.buildLog).to.equal(module.version.versionString)
    })
  })

  describe("testExecModule", () => {
    it("should run the test command in the module dir if local true", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.test.run({
        log,
        module,
        interactive: true,
        graph,
        silent: false,
        test: testFromConfig(
          module,
          {
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              command: ["pwd"],
            },
          },
          graph
        ),
      })
      expect(res.log).to.eql(join(garden.projectRoot, "module-local"))
    })

    it("should receive module version as an env var", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.test.run({
        log,
        module,
        interactive: true,
        graph,
        silent: false,
        test: testFromConfig(
          module,
          {
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {
              command: ["echo", "$GARDEN_MODULE_VERSION"],
            },
          },
          graph
        ),
      })
      expect(res.log).to.equal(module.version.versionString)
    })
  })

  describe("runExecTask", () => {
    it("should run the task command in the module dir if local true", async () => {
      const actions = await garden.getActionRouter()
      const task = graph.getTask("pwd")
      const res = await actions.run.run({
        log,
        task,
        interactive: true,
        graph,
      })
      expect(res.log).to.eql(join(garden.projectRoot, "module-local"))
    })

    it("should receive module version as an env var", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const task = graph.getTask("pwd")

      task.spec.command = ["echo", "$GARDEN_MODULE_VERSION"]

      const res = await actions.run.run({
        log,
        task,
        interactive: true,
        graph,
      })

      expect(res.log).to.equal(module.version.versionString)
    })
  })

  describe("runExecModule", () => {
    it("should run the module with the args that are passed through the command", async () => {
      const module = graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.build.run({
        log,
        module,
        command: [],
        args: ["echo", "hello", "world"],
        interactive: false,
        graph,
      })
      expect(res.log).to.eql("hello world")
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
        const service = graph.getService("echo")
        const actions = await garden.getActionRouter()
        const res = await actions.deploy.deploy({
          devMode: false,
          force: false,

          localMode: false,
          log,
          service,
          graph,
        })
        expect(res.detail.deployCommandOutput).to.eql("deployed echo service")
      })

      it("skips deploying if deploy command is empty but does not throw", async () => {
        const service = graph.getService("empty")
        const actions = await garden.getActionRouter()
        const res = await actions.deploy.deploy({
          devMode: false,
          force: false,

          localMode: false,
          log,
          service,
          graph,
        })
        expect(res.detail.skipped).to.eql(true)
      })

      it("throws if deployCommand returns with non-zero code", async () => {
        const service = graph.getService("error")
        const actions = await garden.getActionRouter()
        await expectError(
          async () =>
            await actions.deploy.deploy({
              devMode: false,
              force: false,

              localMode: false,
              log,
              service,
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
          const service = graph.getService("dev-mode")
          const actions = await garden.getActionRouter()
          const res = await actions.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
            log,
            service,
            graph,
          })

          pid = res.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)
        })
        it("should write logs to a local file with the proper format", async () => {
          // This services just echos a string N times before exiting.
          const service = graph.getService("dev-mode-with-logs")
          const actions = await garden.getActionRouter()
          const res = await actions.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
            log,
            service,
            graph,
          })

          // Wait for entries to be written since we otherwise don't wait on persistent commands (unless
          // a status command is set).
          await sleep(1500)

          pid = res.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)

          const logFilePath = getLogFilePath({ projectRoot: garden.projectRoot, deployName: service.name })
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
          const service = graph.getService("dev-mode-with-empty-log-lines")
          const actions = await garden.getActionRouter()
          const res = await actions.deploy.deploy({
            devMode: true,
            force: false,

            localMode: false,
            log,
            service,
            graph,
          })

          // Wait for entries to be written since we otherwise don't wait on persistent commands (unless
          // a status command is set).
          await sleep(1500)

          pid = res.detail.pid

          const logFilePath = getLogFilePath({ projectRoot: garden.projectRoot, deployName: service.name })
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
          const service = graph.getService("dev-mode-timeout")
          const actions = await garden.getActionRouter()
          let error: any
          try {
            await actions.deploy.deploy({
              devMode: true,
              force: false,

              localMode: false,
              log,
              service,
              graph,
            })
          } catch (err) {
            error = err
          }

          pid = error.detail.pid
          expect(pid).to.be.a("number")
          expect(pid).to.be.greaterThan(0)
          expect(error.detail.serviceName).to.eql("dev-mode-timeout")
          expect(error.detail.statusCommand).to.eql([`/bin/sh -c "exit 1"`])
          expect(error.detail.timeout).to.eql(1)
          expect(error.message).to.eql(`Timed out waiting for local service dev-mode-timeout to be ready`)
        })
      })
    })

    describe("getExecServiceStatus", async () => {
      it("returns 'unknown' if no statusCommand is set", async () => {
        const service = graph.getService("error")
        const actions = await garden.getActionRouter()
        const res = await actions.getServiceStatus({
          devMode: false,

          localMode: false,
          log,
          service,
          graph,
        })
        expect(res.state).to.equal("unknown")
      })

      it("returns 'ready' if statusCommand returns zero exit code", async () => {
        const service = graph.getService("touch")
        const actions = await garden.getActionRouter()
        await actions.deploy.deploy({
          devMode: false,

          localMode: false,
          force: false,
          log,
          service,
          graph,
        })
        const res = await actions.getServiceStatus({
          devMode: false,

          localMode: false,
          log,
          service,
          graph,
        })
        expect(res.state).to.equal("ready")
        expect(res.version).to.equal(service.version)
        expect(res.detail.statusCommandOutput).to.equal("already deployed")
      })

      it("returns 'outdated' if statusCommand returns non-zero exit code", async () => {
        const service = graph.getService("touch")
        const actions = await garden.getActionRouter()
        const res = await actions.getServiceStatus({
          devMode: false,

          localMode: false,
          log,
          service,
          graph,
        })
        expect(res.state).to.equal("outdated")
        expect(res.version).to.equal(service.version)
      })
    })

    describe("deleteExecService", async () => {
      it("runs the cleanup command if set", async () => {
        const service = graph.getService("touch")
        const actions = await garden.getActionRouter()
        await actions.deploy.deploy({
          devMode: false,

          localMode: false,
          force: false,
          log,
          service,
          graph,
        })
        const res = await actions.deploy.delete({
          log,
          service,
          graph,
        })
        expect(res.state).to.equal("missing")
        expect(res.detail.cleanupCommandOutput).to.equal("cleaned up")
      })

      it("returns 'unknown' state if no cleanupCommand is set", async () => {
        const service = graph.getService("echo")
        const actions = await garden.getActionRouter()
        const res = await actions.deploy.delete({
          log,
          service,
          graph,
        })
        expect(res.state).to.equal("unknown")
      })

      it("throws if cleanupCommand returns with non-zero code", async () => {
        const service = graph.getService("error")
        const actions = await garden.getActionRouter()
        await expectError(
          async () =>
            await actions.deploy.delete({
              log,
              service,
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
