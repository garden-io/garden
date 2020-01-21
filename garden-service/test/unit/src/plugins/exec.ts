import { expect } from "chai"
import { join, resolve } from "path"
import { Garden } from "../../../../src/garden"
import { gardenPlugin, configureExecModule } from "../../../../src/plugins/exec"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../../../src/constants"
import { LogEntry } from "../../../../src/logger/log-entry"
import { keyBy } from "lodash"
import { getDataDir, makeTestModule, expectError } from "../../../helpers"
import { TaskTask } from "../../../../src/tasks/task"
import { readModuleVersionFile } from "../../../../src/vcs/vcs"
import { dataDir, makeTestGarden } from "../../../helpers"
import { ModuleConfig } from "../../../../src/config/module"
import { ConfigGraph } from "../../../../src/config-graph"
import { pathExists, emptyDir } from "fs-extra"
import { TestTask } from "../../../../src/tasks/test"
import { findByName } from "../../../../src/util/util"

describe("exec plugin", () => {
  const projectRoot = resolve(dataDir, "test-project-exec")
  const moduleName = "module-a"

  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenPlugin] })
    graph = await garden.getConfigGraph(garden.log)
    log = garden.log
    await garden.clearBuilds()
  })

  it("should correctly parse exec modules", async () => {
    const modules = keyBy(await graph.getModules(), "name")
    const { "module-a": moduleA, "module-b": moduleB, "module-c": moduleC, "module-local": moduleLocal } = modules

    expect(moduleA.build).to.eql({
      dependencies: [],
    })
    expect(moduleA.spec.build).to.eql({
      command: ["echo", "A"],
      dependencies: [],
    })
    expect(moduleA.serviceConfigs).to.eql([])
    expect(moduleA.taskConfigs).to.eql([
      {
        name: "banana",
        dependencies: ["orange"],
        disabled: false,
        timeout: null,
        spec: {
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
        dependencies: [],
        disabled: false,
        timeout: 999,
        spec: {
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

    expect(moduleB.build).to.eql({
      dependencies: [{ name: "module-a", copy: [] }],
    })
    expect(moduleB.spec.build).to.eql({
      command: ["echo", "B"],
      dependencies: [{ name: "module-a", copy: [] }],
    })
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
          dependencies: [],
          disabled: false,
          command: ["echo", "OK"],
          env: {},
          timeout: null,
        },
      },
    ])

    expect(moduleC.build).to.eql({
      dependencies: [{ name: "module-b", copy: [] }],
    })
    expect(moduleC.spec.build).to.eql({
      command: [],
      dependencies: [{ name: "module-b", copy: [] }],
    })
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
          disabled: false,
          command: ["echo", "OK"],
          env: {},
          timeout: null,
        },
      },
    ])

    expect(moduleLocal.spec.local).to.eql(true)
    expect(moduleLocal.build).to.eql({
      dependencies: [],
    })
    expect(moduleLocal.spec.build).to.eql({
      command: ["pwd"],
      dependencies: [],
    })
    expect(moduleLocal.serviceConfigs).to.eql([])
    expect(moduleLocal.taskConfigs).to.eql([
      {
        name: "pwd",
        dependencies: [],
        disabled: false,
        timeout: null,
        spec: {
          name: "pwd",
          env: {},
          command: ["pwd"],
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
    const _graph = await _garden.getConfigGraph(_garden.log)
    const taskB = await _graph.getTask("task-b")

    const taskTask = new TaskTask({
      garden: _garden,
      graph: _graph,
      task: taskB,
      log: _garden.log,
      force: false,
      forceBuild: false,
      version: taskB.module.version,
    })
    const results = await _garden.processTasks([taskTask])

    // Task A echoes "task-a-output" and Task B echoes the output from Task A
    expect(results["task.task-b"]).to.exist
    expect(results["task.task-b"]!.output.outputs.log).to.equal("task-a-output")
  })

  it("should copy artifacts after task runs", async () => {
    const _garden = await makeTestGarden(getDataDir("test-projects", "exec-artifacts"))
    const _graph = await _garden.getConfigGraph(_garden.log)
    const task = await _graph.getTask("task-a")

    const taskTask = new TaskTask({
      garden: _garden,
      graph: _graph,
      task,
      log: _garden.log,
      force: false,
      forceBuild: false,
      version: task.module.version,
    })

    await emptyDir(_garden.artifactsPath)

    await _garden.processTasks([taskTask])

    expect(await pathExists(join(_garden.artifactsPath, "task-outputs", "task-a.txt"))).to.be.true
  })

  it("should copy artifacts after test runs", async () => {
    const _garden = await makeTestGarden(getDataDir("test-projects", "exec-artifacts"))
    const _graph = await _garden.getConfigGraph(_garden.log)
    const module = await _graph.getModule("module-a")

    const testTask = new TestTask({
      garden: _garden,
      graph: _graph,
      module,
      testConfig: findByName(module.testConfigs, "test-a")!,
      log: _garden.log,
      force: false,
      forceBuild: false,
      version: module.version,
      _guard: true,
    })

    await emptyDir(_garden.artifactsPath)

    await _garden.processTasks([testTask])

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
      const provider = await garden.resolveProvider("test-plugin")
      const ctx = garden.getPluginContext(provider)
      await expectError(async () => await configureExecModule({ ctx, moduleConfig, log }), "configuration")
    })
  })

  describe("build", () => {
    it("should write a build version file after building", async () => {
      const module = await graph.getModule(moduleName)
      const version = module.version
      const buildMetadataPath = module.buildMetadataPath
      const versionFilePath = join(buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)

      await garden.buildDir.syncFromSrc(module, log)
      const actions = await garden.getActionRouter()
      await actions.build({ log, module })

      const versionFileContents = await readModuleVersionFile(versionFilePath)

      expect(versionFileContents).to.eql(version)
    })

    it("should run the build command in the module dir if local true", async () => {
      const module = await graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.build({ log, module })
      expect(res.buildLog).to.eql(join(projectRoot, "module-local"))
    })
  })

  describe("testExecModule", () => {
    it("should run the test command in the module dir if local true", async () => {
      const module = await graph.getModule("module-local")
      const actions = await garden.getActionRouter()
      const res = await actions.testModule({
        log,
        module,
        interactive: true,
        runtimeContext: {
          envVars: {},
          dependencies: [],
        },
        silent: false,
        testConfig: {
          name: "test",
          dependencies: [],
          disabled: false,
          timeout: 1234,
          spec: {
            command: ["pwd"],
          },
        },
        testVersion: module.version,
      })
      expect(res.log).to.eql(join(projectRoot, "module-local"))
    })
  })

  describe("runExecTask", () => {
    it("should run the task command in the module dir if local true", async () => {
      const actions = await garden.getActionRouter()
      const task = await graph.getTask("pwd")
      const res = await actions.runTask({
        log,
        task,
        interactive: true,
        runtimeContext: {
          envVars: {},
          dependencies: [],
        },
        taskVersion: task.module.version,
      })
      expect(res.log).to.eql(join(projectRoot, "module-local"))
    })
  })
})
