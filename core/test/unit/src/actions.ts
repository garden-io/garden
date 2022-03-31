/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  ModuleAndRuntimeActionHandlers,
  PluginActionHandlers,
  getModuleActionDescriptions,
  getPluginActionDescriptions,
  createGardenPlugin,
  ActionHandler,
  ModuleActionHandler,
} from "../../../src/types/plugin/plugin"
import { GardenService, ServiceState } from "../../../src/types/service"
import { RuntimeContext, prepareRuntimeContext } from "../../../src/runtime-context"
import { expectError, makeTestGardenA, stubModuleAction, projectRootA, TestGarden, makeTestGarden } from "../../helpers"
import { ActionRouter } from "../../../src/actions"
import { LogEntry } from "../../../src/logger/log-entry"
import { GardenModule } from "../../../src/types/module"
import { ServiceLogEntry } from "../../../src/types/plugin/service/getServiceLogs"
import Stream from "ts-stream"
import { GardenTask } from "../../../src/types/task"
import { expect } from "chai"
import { omit } from "lodash"
import { CustomObjectSchema, joi } from "../../../src/config/common"
import { validateSchema } from "../../../src/config/validation"
import { ProjectConfig, defaultNamespace } from "../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { defaultProvider, providerFromConfig } from "../../../src/config/provider"
import { RunTaskResult } from "../../../src/types/plugin/task/runTask"
import { defaultDotIgnoreFiles } from "../../../src/util/fs"
import stripAnsi from "strip-ansi"
import { emptyDir, pathExists, ensureFile, readFile } from "fs-extra"
import { join } from "path"
import { DashboardPage } from "../../../src/types/plugin/provider/getDashboardPage"
import { testFromModule, testFromConfig } from "../../../src/types/test"
import { ConfigGraph } from "../../../src/config-graph"

const now = new Date()

describe("ActionRouter", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let actions: ActionRouter
  let module: GardenModule
  let service: GardenService
  let runtimeContext: RuntimeContext
  let task: GardenTask

  const projectConfig: ProjectConfig = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: projectRootA,
    defaultEnvironment: "default",
    dotIgnoreFiles: defaultDotIgnoreFiles,
    environments: [{ name: "default", defaultNamespace, variables: {} }],
    providers: [{ name: "base" }, { name: "test-plugin" }, { name: "test-plugin-b" }],
    variables: {},
  }

  before(async () => {
    garden = await makeTestGarden(projectRootA, {
      plugins: [basePlugin, testPlugin, testPluginB],
      config: projectConfig,
    })
    projectConfig.path = garden.projectRoot
    log = garden.log
    actions = await garden.getActionRouter()
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    module = graph.getModule("module-a")
    service = graph.getService("service-a")
    runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies: {
        build: [],
        deploy: [],
        run: [],
        test: [],
      },
      version: module.version.versionString,
      moduleVersion: module.version.versionString,
      serviceStatuses: {},
      taskResults: {},
    })
    task = graph.getTask("task-a")
  })

  after(async () => {
    await garden.close()
  })

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("configureProvider", () => {
      it("should configure the provider", async () => {
        const config = { name: "test-plugin", foo: "bar", dependencies: [] }
        const result = await actions.configureProvider({
          ctx: await garden.getPluginContext(
            providerFromConfig({
              plugin: await garden.getPlugin("test-plugin"),
              config,
              dependencies: {},
              moduleConfigs: [],
              status: { ready: false, outputs: {} },
            })
          ),
          namespace: "default",
          environmentName: "default",
          pluginName: "test-plugin",
          log,
          config,
          configStore: garden.configStore,
          projectName: garden.projectName,
          projectRoot: garden.projectRoot,
          dependencies: {},
        })
        expect(result).to.eql({
          config,
          moduleConfigs: [],
        })
      })
    })

    describe("augmentGraph", () => {
      it("should return modules and/or dependency relations to add to the stack graph", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const modules = graph.getModules()
        const providers = await garden.resolveProviders(garden.log)
        const result = await actions.augmentGraph({
          log,
          pluginName: "test-plugin",
          modules,
          providers,
        })

        const name = "added-by-test-plugin"

        expect(result).to.eql({
          addRuntimeDependencies: [{ by: name, on: "service-b" }],
          addModules: [
            {
              apiVersion: DEFAULT_API_VERSION,
              kind: "Module",
              name,
              type: "test",
              path: garden.projectRoot,
              services: [{ name }],
              allowPublish: true,
              build: { dependencies: [] },
              disabled: false,
              generateFiles: [],
            },
          ],
        })
      })
    })

    describe("getDashboardPage", () => {
      it("should resolve the URL for a dashboard page", async () => {
        const page: DashboardPage = {
          name: "foo",
          title: "Foo",
          description: "foodefoodefoo",
          newWindow: false,
        }
        const result = await actions.getDashboardPage({ log, pluginName: "test-plugin", page })
        expect(result).to.eql({
          url: "http://foo",
        })
      })
    })

    describe("getEnvironmentStatus", () => {
      it("should return the environment status for a provider", async () => {
        const result = await actions.getEnvironmentStatus({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          ready: false,
          outputs: {},
        })
      })
    })

    describe("prepareEnvironment", () => {
      it("should prepare the environment for a configured provider", async () => {
        const result = await actions.prepareEnvironment({
          log,
          pluginName: "test-plugin",
          force: false,
          status: { ready: true, outputs: {} },
        })
        expect(result).to.eql({
          status: {
            ready: true,
            outputs: {},
          },
        })
      })
    })

    describe("cleanupEnvironment", () => {
      it("should clean up environment for a provider", async () => {
        const result = await actions.cleanupEnvironment({ log, pluginName: "test-plugin" })
        expect(result).to.eql({})
      })
    })

    describe("getSecret", () => {
      it("should retrieve a secret from the specified provider", async () => {
        const result = await actions.getSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ value: "foo" })
      })
    })

    describe("setSecret", () => {
      it("should set a secret via the specified provider", async () => {
        const result = await actions.setSecret({ log, pluginName: "test-plugin", key: "foo", value: "boo" })
        expect(result).to.eql({})
      })
    })

    describe("deleteSecret", () => {
      it("should delete a secret from the specified provider", async () => {
        const result = await actions.deleteSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ found: true })
      })
    })
  })

  describe("module actions", () => {
    describe("configureModule", () => {
      it("should consolidate the declared build dependencies", async () => {
        const moduleConfigA = (await garden.getRawModuleConfigs(["module-a"]))[0]

        const moduleConfig = {
          ...moduleConfigA,
          build: {
            dependencies: [
              { name: "module-b", copy: [{ source: "1", target: "1" }] },
              { name: "module-b", copy: [{ source: "2", target: "2" }] },
              { name: "module-b", copy: [{ source: "2", target: "2" }] },
              { name: "module-c", copy: [{ source: "3", target: "3" }] },
            ],
          },
        }

        const result = await actions.configureModule({ log, moduleConfig })
        expect(result.moduleConfig.build.dependencies).to.eql([
          {
            name: "module-b",
            copy: [
              { source: "1", target: "1" },
              { source: "2", target: "2" },
            ],
          },
          {
            name: "module-c",
            copy: [{ source: "3", target: "3" }],
          },
        ])
      })
    })

    describe("getBuildStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getBuildStatus({ log, module, graph })
        expect(result).to.eql({
          ready: true,
        })
      })

      it("should emit a buildStatus event", async () => {
        garden.events.eventLog = []
        await actions.getBuildStatus({ log, module, graph })
        const event = garden.events.eventLog[0]
        expect(event).to.exist
        expect(event.name).to.eql("buildStatus")
        expect(event.payload.moduleName).to.eql("module-a")
        expect(event.payload.moduleVersion).to.eql(module.version.versionString)
        expect(event.payload.actionUid).to.be.undefined
        expect(event.payload.status.state).to.eql("fetched")
      })
    })

    describe("build", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.build({ log, module, graph })
        expect(result).to.eql({})
      })

      it("should emit buildStatus events", async () => {
        garden.events.eventLog = []
        await actions.build({ log, module, graph })
        const event1 = garden.events.eventLog[0]
        const event2 = garden.events.eventLog[1]
        const moduleVersion = module.version.versionString
        expect(event1).to.exist
        expect(event1.name).to.eql("buildStatus")
        expect(event1.payload.moduleName).to.eql("module-a")
        expect(event1.payload.moduleVersion).to.eql(moduleVersion)
        expect(event1.payload.status.state).to.eql("building")
        expect(event1.payload.actionUid).to.be.ok
        expect(event2).to.exist
        expect(event2.name).to.eql("buildStatus")
        expect(event2.payload.moduleName).to.eql("module-a")
        expect(event2.payload.moduleVersion).to.eql(moduleVersion)
        expect(event2.payload.status.state).to.eql("built")
        expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
      })
    })

    describe("hotReloadService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.hotReloadService({
          log,
          service,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })
        expect(result).to.eql({})
      })
    })

    describe("runModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const command = ["npm", "run"]
        const result = await actions.runModule({
          log,
          module,
          args: command,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })
        expect(result).to.eql({
          moduleName: module.name,
          command,
          completedAt: now,
          log: "bla bla",
          success: true,
          startedAt: now,
          version: module.version.versionString,
        })
      })
    })

    describe("testModule", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const test = testFromConfig(
          module,
          {
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {},
          },
          graph
        )
        const result = await actions.testModule({
          log,
          module,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
          silent: false,
          test,
        })
        expect(result).to.eql({
          moduleName: module.name,
          command: [],
          completedAt: now,
          log: "bla bla",
          outputs: {
            log: "bla bla",
          },
          success: true,
          startedAt: now,
          testName: "test",
          version: test.version,
        })
      })

      it("should emit testStatus events", async () => {
        garden.events.eventLog = []
        const test = testFromConfig(
          module,
          {
            name: "test",
            dependencies: [],
            disabled: false,
            timeout: 1234,
            spec: {},
          },
          graph
        )
        await actions.testModule({
          log,
          module,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
          silent: false,
          test,
        })
        const moduleVersion = module.version.versionString
        const testVersion = test.version
        const event1 = garden.events.eventLog[0]
        const event2 = garden.events.eventLog[1]
        expect(event1).to.exist
        expect(event1.name).to.eql("testStatus")
        expect(event1.payload.testName).to.eql("test")
        expect(event1.payload.moduleName).to.eql("module-a")
        expect(event1.payload.moduleVersion).to.eql(moduleVersion)
        expect(event1.payload.testVersion).to.eql(testVersion)
        expect(event1.payload.actionUid).to.be.ok
        expect(event1.payload.status.state).to.eql("running")
        expect(event2).to.exist
        expect(event2.name).to.eql("testStatus")
        expect(event2.payload.testName).to.eql("test")
        expect(event2.payload.moduleName).to.eql("module-a")
        expect(event2.payload.moduleVersion).to.eql(moduleVersion)
        expect(event2.payload.testVersion).to.eql(testVersion)
        expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
        expect(event2.payload.status.state).to.eql("succeeded")
      })

      it("should copy artifacts exported by the handler to the artifacts directory", async () => {
        await emptyDir(garden.artifactsPath)

        const testConfig = {
          name: "test",
          dependencies: [],
          disabled: false,
          timeout: 1234,
          spec: {
            artifacts: [
              {
                source: "some-file.txt",
              },
              {
                source: "some-dir/some-file.txt",
                target: "some-dir/some-file.txt",
              },
            ],
          },
        }

        const test = testFromConfig(module, testConfig, graph)

        await actions.testModule({
          log,
          module,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
          silent: false,
          test,
        })

        const targetPaths = testConfig.spec.artifacts.map((spec) => join(garden.artifactsPath, spec.source)).sort()

        for (const path of targetPaths) {
          expect(await pathExists(path)).to.be.true
        }

        const metadataKey = `test.test.${test.version}`
        const metadataFilename = `.metadata.${metadataKey}.json`
        const metadataPath = join(garden.artifactsPath, metadataFilename)
        expect(await pathExists(metadataPath)).to.be.true

        const metadata = JSON.parse((await readFile(metadataPath)).toString())
        expect(metadata).to.eql({
          key: metadataKey,
          files: targetPaths,
        })
      })
    })

    describe("getTestResult", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const test = testFromModule(module, "unit", graph)
        const result = await actions.getTestResult({
          log,
          module,
          test,
          graph,
        })
        expect(result).to.eql({
          moduleName: module.name,
          command: [],
          completedAt: now,
          log: "bla bla",
          outputs: {
            log: "bla bla",
          },
          success: true,
          startedAt: now,
          testName: "unit",
          version: test.version,
        })
      })
    })

    it("should emit a testStatus event", async () => {
      garden.events.eventLog = []
      const test = testFromModule(module, "unit", graph)
      await actions.getTestResult({
        log,
        module,
        test,
        graph,
      })
      const event = garden.events.eventLog[0]
      expect(event).to.exist
      expect(event.name).to.eql("testStatus")
      expect(event.payload.testName).to.eql("unit")
      expect(event.payload.moduleName).to.eql("module-a")
      expect(event.payload.moduleVersion).to.eql(module.version.versionString)
      expect(event.payload.testVersion).to.eql(test.version)
      expect(event.payload.actionUid).to.be.undefined
      expect(event.payload.status.state).to.eql("succeeded")
    })
  })

  describe("service actions", () => {
    describe("getServiceStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getServiceStatus({
          log,
          service,
          graph,
          runtimeContext,
          devMode: false,
          hotReload: false,
          localMode: false,
        })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } })
      })

      it("should emit a serviceStatus event", async () => {
        garden.events.eventLog = []
        await actions.getServiceStatus({
          log,
          service,
          graph,
          runtimeContext,
          devMode: false,
          hotReload: false,
          localMode: false,
        })
        const event = garden.events.eventLog[0]
        expect(event).to.exist
        expect(event.name).to.eql("serviceStatus")
        expect(event.payload.serviceName).to.eql("service-a")
        expect(event.payload.moduleVersion).to.eql(service.module.version.versionString)
        expect(event.payload.serviceVersion).to.eql(service.version)
        expect(event.payload.actionUid).to.be.undefined
        expect(event.payload.status.state).to.eql("ready")
      })

      it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getServiceStatus", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () =>
            actions.getServiceStatus({
              log,
              service,
              graph,
              runtimeContext,
              devMode: false,
              hotReload: false,
              localMode: false,
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from service 'service-a': key .foo must be a string"
            )
        )
      })

      it("should throw if the outputs don't match the service outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getServiceStatus", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () =>
            actions.getServiceStatus({
              log,
              service,
              graph,
              runtimeContext,
              devMode: false,
              hotReload: false,
              localMode: false,
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from service 'service-a': key .base must be a string"
            )
        )
      })
    })

    describe("deployService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deployService({
          log,
          service,
          graph,
          runtimeContext,
          force: true,
          devMode: false,
          hotReload: false,
          localMode: false,
        })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } })
      })

      it("should emit serviceStatus events", async () => {
        garden.events.eventLog = []
        await actions.deployService({
          log,
          service,
          graph,
          runtimeContext,
          force: true,
          devMode: false,
          hotReload: false,
          localMode: false,
        })
        const moduleVersion = service.module.version.versionString
        const event1 = garden.events.eventLog[0]
        const event2 = garden.events.eventLog[1]
        expect(event1).to.exist
        expect(event1.name).to.eql("serviceStatus")
        expect(event1.payload.serviceName).to.eql("service-a")
        expect(event1.payload.moduleName).to.eql("module-a")
        expect(event1.payload.moduleVersion).to.eql(moduleVersion)
        expect(event1.payload.serviceVersion).to.eql(service.version)
        expect(event1.payload.actionUid).to.be.ok
        expect(event1.payload.status.state).to.eql("deploying")
        expect(event2).to.exist
        expect(event2.name).to.eql("serviceStatus")
        expect(event2.payload.serviceName).to.eql("service-a")
        expect(event2.payload.moduleName).to.eql("module-a")
        expect(event2.payload.moduleVersion).to.eql(moduleVersion)
        expect(event2.payload.serviceVersion).to.eql(service.version)
        expect(event2.payload.actionUid).to.eql(event2.payload.actionUid)
        expect(event2.payload.status.state).to.eql("ready")
      })

      it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "deployService", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () =>
            actions.deployService({
              log,
              service,
              graph,
              runtimeContext,
              force: true,
              devMode: false,
              hotReload: false,
              localMode: false,
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from service 'service-a': key .foo must be a string"
            )
        )
      })

      it("should throw if the outputs don't match the service outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "deployService", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () =>
            actions.deployService({
              log,
              service,
              graph,
              runtimeContext,
              force: true,
              devMode: false,
              hotReload: false,
              localMode: false,
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from service 'service-a': key .base must be a string"
            )
        )
      })
    })

    describe("deleteService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deleteService({ log, service, graph, runtimeContext })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: {} })
      })
    })

    describe("execInService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.execInService({
          log,
          service,
          graph,
          runtimeContext,
          command: ["foo"],
          interactive: false,
        })
        expect(result).to.eql({ code: 0, output: "bla bla" })
      })
    })

    describe("getServiceLogs", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const stream = new Stream<ServiceLogEntry>()
        const result = await actions.getServiceLogs({
          log,
          service,
          graph,
          runtimeContext,
          stream,
          follow: false,
          tail: -1,
        })
        expect(result).to.eql({})
      })
    })

    describe("runService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runService({
          log,
          service,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })
        expect(result).to.eql({
          moduleName: service.module.name,
          command: ["foo"],
          completedAt: now,
          log: "bla bla",
          success: true,
          startedAt: now,
          version: service.version,
        })
      })
    })
  })

  describe("task actions", () => {
    let taskResult: RunTaskResult

    before(() => {
      taskResult = {
        moduleName: task.module.name,
        taskName: task.name,
        command: ["foo"],
        completedAt: now,
        log: "bla bla",
        outputs: {
          base: "ok",
          foo: "ok",
        },
        success: true,
        startedAt: now,
        version: task.version,
      }
    })

    describe("getTaskResult", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getTaskResult({
          log,
          task,
          graph,
        })
        expect(result).to.eql(taskResult)
      })

      it("should emit a taskStatus event", async () => {
        garden.events.eventLog = []
        await actions.getTaskResult({
          log,
          task,
          graph,
        })
        const event = garden.events.eventLog[0]
        expect(event).to.exist
        expect(event.name).to.eql("taskStatus")
        expect(event.payload.taskName).to.eql("task-a")
        expect(event.payload.moduleName).to.eql("module-a")
        expect(event.payload.moduleVersion).to.eql(task.module.version.versionString)
        expect(event.payload.taskVersion).to.eql(task.version)
        expect(event.payload.actionUid).to.be.undefined
        expect(event.payload.status.state).to.eql("succeeded")
      })

      it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getTaskResult", async () => {
          return { ...taskResult, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () => actions.getTaskResult({ log, task, graph }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from task 'task-a': key .foo must be a string"
            )
        )
      })

      it("should throw if the outputs don't match the task outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getTaskResult", async () => {
          return { ...taskResult, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () => actions.getTaskResult({ log, task, graph }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from task 'task-a': key .base must be a string"
            )
        )
      })
    })

    describe("runTask", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runTask({
          log,
          task,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })
        expect(result).to.eql(taskResult)
      })

      it("should emit taskStatus events", async () => {
        garden.events.eventLog = []
        await actions.runTask({
          log,
          task,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })
        const moduleVersion = task.module.version.versionString
        const event1 = garden.events.eventLog[0]
        const event2 = garden.events.eventLog[1]
        expect(event1).to.exist
        expect(event1.name).to.eql("taskStatus")
        expect(event1.payload.taskName).to.eql("task-a")
        expect(event1.payload.moduleName).to.eql("module-a")
        expect(event1.payload.moduleVersion).to.eql(moduleVersion)
        expect(event1.payload.taskVersion).to.eql(task.version)
        expect(event1.payload.actionUid).to.be.ok
        expect(event1.payload.status.state).to.eql("running")
        expect(event2).to.exist
        expect(event2.name).to.eql("taskStatus")
        expect(event2.payload.taskName).to.eql("task-a")
        expect(event2.payload.moduleName).to.eql("module-a")
        expect(event2.payload.moduleVersion).to.eql(moduleVersion)
        expect(event2.payload.taskVersion).to.eql(task.version)
        expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
        expect(event2.payload.status.state).to.eql("succeeded")
      })

      it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
        stubModuleAction(actions, task.module.type, "test-plugin", "runTask", async () => {
          return { ...taskResult, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () =>
            actions.runTask({
              log,
              task,
              interactive: true,
              graph,
              runtimeContext: {
                envVars: { FOO: "bar" },
                dependencies: [],
              },
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from task 'task-a': key .foo must be a string"
            )
        )
      })

      it("should throw if the outputs don't match the task outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, task.module.type, "test-plugin", "runTask", async () => {
          return { ...taskResult, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () =>
            actions.runTask({
              log,
              task,
              interactive: true,
              graph,
              runtimeContext: {
                envVars: { FOO: "bar" },
                dependencies: [],
              },
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Error validating outputs from task 'task-a': key .base must be a string"
            )
        )
      })

      it("should copy artifacts exported by the handler to the artifacts directory", async () => {
        await emptyDir(garden.artifactsPath)

        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const _task = graph.getTask("task-a")

        _task.spec.artifacts = [
          {
            source: "some-file.txt",
          },
          {
            source: "some-dir/some-file.txt",
            target: "some-dir/some-file.txt",
          },
        ]

        await actions.runTask({
          log,
          task: _task,
          interactive: true,
          graph,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
        })

        const targetPaths = _task.spec.artifacts.map((spec) => join(garden.artifactsPath, spec.source)).sort()

        for (const path of targetPaths) {
          expect(await pathExists(path)).to.be.true
        }

        const metadataKey = `task.task-a.${_task.version}`
        const metadataFilename = `.metadata.${metadataKey}.json`
        const metadataPath = join(garden.artifactsPath, metadataFilename)
        expect(await pathExists(metadataPath)).to.be.true

        const metadata = JSON.parse((await readFile(metadataPath)).toString())
        expect(metadata).to.eql({
          key: metadataKey,
          files: targetPaths,
        })
      })
    })
  })

  describe("getActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = await actions["getActionHandlers"]("prepareEnvironment")

      expect(Object.keys(handlers)).to.eql(["exec", "test-plugin", "test-plugin-b"])
    })
  })

  describe("getModuleActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = await actions["getModuleActionHandlers"]({ actionType: "build", moduleType: "exec" })

      expect(Object.keys(handlers)).to.eql(["exec"])
    })
  })

  describe("getActionHandler", () => {
    it("should return the configured handler for specified action type and plugin name", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      const handler = await actionsA["getActionHandler"]({ actionType: "prepareEnvironment", pluginName })

      expect(handler!.actionType).to.equal("prepareEnvironment")
      expect(handler!.pluginName).to.equal(pluginName)
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      await expectError(() => actionsA["getActionHandler"]({ actionType: "cleanupEnvironment", pluginName }), "plugin")
    })
  })

  describe("getModuleActionHandler", () => {
    const path = projectRootA

    it("should return default handler, if specified and no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const defaultHandler = async () => {
        return { code: 0, output: "" }
      }
      const handler = await actionsA["getModuleActionHandler"]({
        actionType: "execInService",
        moduleType: "container",
        defaultHandler,
      })
      expect(handler.actionType).to.equal("execInService")
      expect(handler.moduleType).to.equal("container")
      expect(handler.pluginName).to.equal(defaultProvider.name)
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      await expectError(
        () => actionsA["getModuleActionHandler"]({ actionType: "execInService", moduleType: "container" }),
        "parameter"
      )
    })

    context("when no providers extend the module type with requested handler", () => {
      it("should return the handler from the provider that created it", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "bar" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when one provider overrides the requested handler on the module type", () => {
      it("should return the handler from the extending provider", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "base" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "bar" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when multiple providers extend the module type with requested handler", () => {
      it("should return the handler that is not being overridden by another handler", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const too = createGardenPlugin({
          name: "too",
          dependencies: [{ name: "base" }, { name: "foo" }],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, too, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [
              { name: "base" },
              // The order here matters, to verify that the dependency ordering works
              { name: "too" },
              { name: "foo" },
            ],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "bar" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("too")
      })

      context("when multiple providers are side by side in the dependency graph", () => {
        it("should return the last configured handler for the specified module action type", async () => {
          const base = createGardenPlugin({
            name: "base",
            createModuleTypes: [
              {
                name: "bar",
                docs: "bar",
                schema: joi.object(),
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })
          const foo = createGardenPlugin({
            name: "foo",
            dependencies: [{ name: "base" }],
            extendModuleTypes: [
              {
                name: "bar",
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })
          const too = createGardenPlugin({
            name: "too",
            dependencies: [{ name: "base" }],
            extendModuleTypes: [
              {
                name: "bar",
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          })

          const _garden = await makeTestGarden(path, {
            plugins: [base, too, foo],
            config: {
              apiVersion: DEFAULT_API_VERSION,
              kind: "Project",
              name: "test",
              path,
              defaultEnvironment: "default",
              dotIgnoreFiles: [],
              environments: [{ name: "default", defaultNamespace, variables: {} }],
              providers: [
                { name: "base" },
                // The order here matters, since we use that as a "tie-breaker"
                { name: "foo" },
                { name: "too" },
              ],
              variables: {},
            },
          })

          const _actions = await _garden.getActionRouter()

          const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "bar" })

          expect(handler.actionType).to.equal("build")
          expect(handler.moduleType).to.equal("bar")
          expect(handler.pluginName).to.equal("too")
        })
      })
    })

    context("when the handler was added by a provider and not specified in the creating provider", () => {
      it("should return the added handler", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "base" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "bar" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when the module type has a base", () => {
      const projectConfigWithBase: ProjectConfig = {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "base" }, { name: "foo" }],
        variables: {},
      }

      it("should return the handler for the specific module type, if available", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "bar",
              docs: "moo",
              schema: joi.object(),
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: projectConfigWithBase,
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "moo" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("moo")
        expect(handler.pluginName).to.equal("foo")
      })

      it("should fall back on the base if no specific handler is available", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {
                build: async () => ({ buildLog: "base" }),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "bar",
              docs: "moo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: projectConfigWithBase,
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "moo" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("base")
        expect(await handler(<any>{})).to.eql({ buildLog: "base" })
      })

      it("should recursively fall back on the base's bases if needed", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "base-a",
              docs: "base A",
              schema: joi.object(),
              handlers: {
                build: async () => ({ buildLog: "base" }),
              },
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: [{ name: "base-a" }],
          createModuleTypes: [
            {
              name: "base-b",
              base: "base-a",
              docs: "base B",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base-b" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "base-b",
              docs: "moo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [baseA, baseB, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "base-a" }, { name: "base-b" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleActionHandler"]({ actionType: "build", moduleType: "moo" })

        expect(handler.actionType).to.equal("build")
        expect(handler.moduleType).to.equal("base-a")
        expect(handler.pluginName).to.equal("base-a")
        expect(await handler(<any>{})).to.eql({ buildLog: "base" })
      })
    })
  })

  describe("callActionHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {})

      const base = Object.assign(
        async () => ({
          ready: true,
          outputs: {},
        }),
        { actionType: "getEnvironmentStatus", pluginName: "base" }
      )

      const handler: ActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)

        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callActionHandler"]({
        actionType: "getEnvironmentStatus", // Doesn't matter which one it is
        pluginName: "test-plugin",
        params: {
          log,
        },
        defaultHandler: handler,
      })
    })

    it("should recursively override the base parameter when calling a base handler", async () => {
      const baseA = createGardenPlugin({
        name: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.not.exist
            return { value: params.key }
          },
        },
      })
      const baseB = createGardenPlugin({
        name: "base-b",
        base: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.not.exist
            return params.base!(params)
          },
        },
      })
      const foo = createGardenPlugin({
        name: "foo",
        base: "base-b",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.exist
            return params.base!(params)
          },
        },
      })

      const path = projectRootA

      const _garden = await makeTestGarden(path, {
        plugins: [baseA, baseB, foo],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "foo" }],
          variables: {},
        },
      })

      const _actions = await _garden.getActionRouter()

      const result = await _actions["callActionHandler"]({
        actionType: "getSecret", // Doesn't matter which one it is
        pluginName: "foo",
        params: {
          key: "foo",
          log,
        },
      })

      expect(result).to.eql({ value: "foo" })
    })

    it("should call the handler with the template context for the provider", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {})

      const handler: ActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${environment.name}")
        return { ready: true, outputs: { resolved } }
      }

      const result = await emptyActions["callActionHandler"]({
        actionType: "getEnvironmentStatus", // Doesn't matter which one it is
        pluginName: "test-plugin",
        params: {
          log,
        },
        defaultHandler: handler,
      })

      expect(result.outputs?.resolved).to.equal("default")
    })
  })

  describe("callModuleHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("module-a")

      const base = Object.assign(
        async () => ({
          ready: true,
          outputs: {},
        }),
        { actionType: "getBuildStatus", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callModuleHandler"]({
        actionType: "getBuildStatus", // Doesn't matter which one it is
        params: {
          module: moduleA,
          log,
          graph,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the module", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("module-a")
      const moduleB = graph.getModule("module-b")

      const handler: ModuleActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${modules.module-a.version}")
        return { ready: true, detail: { resolved } }
      }

      const result = await emptyActions["callModuleHandler"]({
        actionType: "getBuildStatus", // Doesn't matter which one it is
        params: {
          module: moduleB,
          log,
          graph,
        },
        defaultHandler: handler,
      })

      expect(result.detail?.resolved).to.equal(moduleA.version.versionString)
    })
  })

  describe("callServiceHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const serviceA = graph.getService("service-a")

      const base = Object.assign(
        async () => ({
          forwardablePorts: [],
          state: <ServiceState>"ready",
          detail: {},
        }),
        { actionType: "deployService", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { forwardablePorts: [], state: <ServiceState>"ready", detail: {} }
      }

      handler.base = base

      await emptyActions["callServiceHandler"]({
        actionType: "deployService", // Doesn't matter which one it is
        params: {
          service: serviceA,
          graph,
          runtimeContext,
          log,
          devMode: false,
          hotReload: false,
          localMode: false,
          force: false,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the service", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const serviceA = graph.getService("service-a")
      const serviceB = graph.getService("service-b")

      const handler: ModuleActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${runtime.services.service-a.version}")
        return { forwardablePorts: [], state: <ServiceState>"ready", detail: { resolved } }
      }

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceA],
          run: [],
          test: [],
        },
        version: module.version.versionString,
        moduleVersion: module.version.versionString,
        serviceStatuses: {
          "service-a": { state: "ready", detail: {} },
        },
        taskResults: {},
      })

      const { result } = await emptyActions["callServiceHandler"]({
        actionType: "deployService", // Doesn't matter which one it is
        params: {
          service: serviceB,
          graph,
          runtimeContext: _runtimeContext,
          log,
          devMode: false,
          hotReload: false,
          localMode: false,
          force: false,
        },
        defaultHandler: handler,
      })

      expect(result.detail?.resolved).to.equal(serviceA.version)
    })

    it("should interpolate runtime template strings", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.foo = "${runtime.services.service-b.outputs.foo}"

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const serviceA = graph.getService("service-a")
      const serviceB = graph.getService("service-b")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceB],
          run: [],
          test: [],
        },
        version: serviceA.version,
        moduleVersion: serviceA.module.version.versionString,
        serviceStatuses: {
          "service-b": {
            state: "ready",
            outputs: { foo: "bar" },
            detail: {},
          },
        },
        taskResults: {},
      })

      await emptyActions["callServiceHandler"]({
        actionType: "deployService", // Doesn't matter which one it is
        params: {
          service: serviceA,
          graph,
          runtimeContext: _runtimeContext,
          log,
          devMode: false,
          hotReload: false,
          localMode: false,
          force: false,
        },
        defaultHandler: async (params) => {
          expect(params.module.spec.foo).to.equal("bar")

          return { forwardablePorts: [], state: <ServiceState>"ready", detail: {} }
        },
      })
    })

    it("should throw if one or more runtime variables remain unresolved after re-resolution", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.services[0].foo = "${runtime.services.service-b.outputs.foo}"

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const serviceA = graph.getService("service-a")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [],
          run: [],
          test: [],
        },
        version: serviceA.version,
        moduleVersion: serviceA.module.version.versionString,
        serviceStatuses: {},
        taskResults: {},
      })

      await expectError(
        () =>
          emptyActions["callServiceHandler"]({
            actionType: "deployService", // Doesn't matter which one it is
            params: {
              service: serviceA,
              graph,
              runtimeContext: _runtimeContext,
              log,
              devMode: false,
              hotReload: false,
              localMode: false,
              force: false,
            },
            defaultHandler: async () => {
              return {} as any
            },
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (${runtime.services.service-b.outpu…): Could not find key service-b under runtime.services."
          )
      )
    })
  })

  describe("callTaskHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const taskA = graph.getTask("task-a")

      const base = Object.assign(
        async () => ({
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: task.version,
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }),
        { actionType: "runTask", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return {
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: task.version,
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }
      }

      handler.base = base

      await emptyActions["callTaskHandler"]({
        actionType: "runTask",
        params: {
          artifactsPath: "/tmp",
          task: taskA,
          graph,
          runtimeContext,
          log,
          interactive: false,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the task", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const taskA = graph.getTask("task-a")
      const serviceB = graph.getService("service-b")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceB],
          run: [],
          test: [],
        },
        version: taskA.version,
        moduleVersion: taskA.module.version.versionString,
        serviceStatuses: {
          "service-b": {
            state: "ready",
            outputs: { foo: "bar" },
            detail: {},
          },
        },
        taskResults: {},
      })

      const { result } = await emptyActions["callTaskHandler"]({
        actionType: "runTask",
        params: {
          artifactsPath: "/tmp", // Not used in this test
          task: taskA,
          graph,
          runtimeContext: _runtimeContext,
          log,
          interactive: false,
        },
        defaultHandler: async ({ ctx }) => {
          const resolved = ctx.resolveTemplateStrings("${runtime.services.service-b.version}")

          return {
            moduleName: "module-a",
            taskName: "task-a",
            command: [],
            outputs: { resolved },
            success: true,
            version: task.version,
            moduleVersion: task.module.version.versionString,
            startedAt: new Date(),
            completedAt: new Date(),
            log: "boo",
          }
        },
      })

      expect(result.outputs?.resolved).to.equal(serviceB.version)
    })

    it("should interpolate runtime template strings", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.tasks[0].foo = "${runtime.services.service-b.outputs.foo}"

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const taskA = graph.getTask("task-a")
      const serviceB = graph.getService("service-b")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceB],
          run: [],
          test: [],
        },
        version: taskA.version,
        moduleVersion: taskA.module.version.versionString,
        serviceStatuses: {
          "service-b": {
            state: "ready",
            outputs: { foo: "bar" },
            detail: {},
          },
        },
        taskResults: {},
      })

      await emptyActions["callTaskHandler"]({
        actionType: "runTask",
        params: {
          artifactsPath: "/tmp", // Not used in this test
          task: taskA,
          graph,
          runtimeContext: _runtimeContext,
          log,
          interactive: false,
        },
        defaultHandler: async (params) => {
          expect(params.task.spec.foo).to.equal("bar")

          return {
            moduleName: "module-a",
            taskName: "task-a",
            command: [],
            outputs: { moo: "boo" },
            success: true,
            version: task.version,
            moduleVersion: task.module.version.versionString,
            startedAt: new Date(),
            completedAt: new Date(),
            log: "boo",
          }
        },
      })
    })

    it("should throw if one or more runtime variables remain unresolved after re-resolution", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.tasks[0].foo = "${runtime.services.service-b.outputs.foo}"

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const taskA = graph.getTask("task-a")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [],
          run: [],
          test: [],
        },
        version: taskA.version,
        moduleVersion: taskA.module.version.versionString,
        // Omitting the service-b outputs here
        serviceStatuses: {},
        taskResults: {},
      })

      await expectError(
        () =>
          emptyActions["callTaskHandler"]({
            actionType: "runTask",
            params: {
              artifactsPath: "/tmp", // Not used in this test
              task: taskA,
              graph,
              runtimeContext: _runtimeContext,
              log,
              interactive: false,
            },
            defaultHandler: async () => {
              return {} as any
            },
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (${runtime.services.service-b.outpu…): Could not find key service-b under runtime.services."
          )
      )
    })
  })
})

const baseOutputsSchema = () => joi.object().keys({ base: joi.string() })
const testOutputSchema = () => baseOutputsSchema().keys({ foo: joi.string() })

const basePlugin = createGardenPlugin({
  name: "base",
  createModuleTypes: [
    {
      name: "base",
      docs: "bla bla bla",
      moduleOutputsSchema: baseOutputsSchema(),
      serviceOutputsSchema: baseOutputsSchema(),
      taskOutputsSchema: baseOutputsSchema(),
      handlers: {},
    },
  ],
})

const pluginActionDescriptions = getPluginActionDescriptions()
const moduleActionDescriptions = getModuleActionDescriptions()

const testPlugin = createGardenPlugin({
  name: "test-plugin",
  dependencies: [{ name: "base" }],

  handlers: <PluginActionHandlers>{
    configureProvider: async (params) => {
      validateParams(params, pluginActionDescriptions.configureProvider.paramsSchema)
      return { config: params.config }
    },

    getEnvironmentStatus: async (params) => {
      validateParams(params, pluginActionDescriptions.getEnvironmentStatus.paramsSchema)
      return {
        ready: false,
        outputs: {},
      }
    },

    augmentGraph: async (params) => {
      validateParams(params, pluginActionDescriptions.augmentGraph.paramsSchema)

      const moduleName = "added-by-" + params.ctx.provider.name

      return {
        addRuntimeDependencies: [{ by: moduleName, on: "service-b" }],
        addModules: [
          {
            kind: "Module",
            name: moduleName,
            type: "test",
            path: params.ctx.projectRoot,
            services: [
              {
                name: moduleName,
              },
            ],
          },
        ],
      }
    },

    getDashboardPage: async (params) => {
      validateParams(params, pluginActionDescriptions.getDashboardPage.paramsSchema)
      return { url: "http://" + params.page.name }
    },

    getDebugInfo: async (params) => {
      validateParams(params, pluginActionDescriptions.getDebugInfo.paramsSchema)
      return { info: {} }
    },

    prepareEnvironment: async (params) => {
      validateParams(params, pluginActionDescriptions.prepareEnvironment.paramsSchema)
      return { status: { ready: true, outputs: {} } }
    },

    cleanupEnvironment: async (params) => {
      validateParams(params, pluginActionDescriptions.cleanupEnvironment.paramsSchema)
      return {}
    },

    getSecret: async (params) => {
      validateParams(params, pluginActionDescriptions.getSecret.paramsSchema)
      return { value: params.key }
    },

    setSecret: async (params) => {
      validateParams(params, pluginActionDescriptions.setSecret.paramsSchema)
      return {}
    },

    deleteSecret: async (params) => {
      validateParams(params, pluginActionDescriptions.deleteSecret.paramsSchema)
      return { found: true }
    },
  },

  createModuleTypes: [
    {
      name: "test",
      base: "base",

      docs: "bla bla bla",
      moduleOutputsSchema: testOutputSchema(),
      serviceOutputsSchema: testOutputSchema(),
      taskOutputsSchema: testOutputSchema(),
      schema: joi.object(),
      title: "Bla",

      handlers: <ModuleAndRuntimeActionHandlers>{
        configure: async (params) => {
          validateParams(params, moduleActionDescriptions.configure.paramsSchema)

          const serviceConfigs = params.moduleConfig.spec.services.map((spec) => ({
            name: spec.name,
            dependencies: spec.dependencies || [],
            disabled: false,
            hotReloadable: false,
            spec,
          }))

          const taskConfigs = (params.moduleConfig.spec.tasks || []).map((spec) => ({
            name: spec.name,
            dependencies: spec.dependencies || [],
            disabled: false,
            spec,
          }))

          const testConfigs = (params.moduleConfig.spec.tests || []).map((spec) => ({
            name: spec.name,
            dependencies: spec.dependencies || [],
            disabled: false,
            spec,
          }))

          return {
            moduleConfig: {
              ...params.moduleConfig,
              serviceConfigs,
              taskConfigs,
              testConfigs,
            },
          }
        },

        getModuleOutputs: async (params) => {
          validateParams(params, moduleActionDescriptions.getModuleOutputs.paramsSchema)
          return { outputs: { foo: "bar" } }
        },

        suggestModules: async () => {
          return { suggestions: [] }
        },

        getBuildStatus: async (params) => {
          validateParams(params, moduleActionDescriptions.getBuildStatus.paramsSchema)
          return { ready: true }
        },

        build: async (params) => {
          validateParams(params, moduleActionDescriptions.build.paramsSchema)
          return {}
        },

        publish: async (params) => {
          validateParams(params, moduleActionDescriptions.publish.paramsSchema)
          return { published: true }
        },

        hotReloadService: async (params) => {
          validateParams(params, moduleActionDescriptions.hotReloadService.paramsSchema)
          return {}
        },

        runModule: async (params) => {
          validateParams(params, moduleActionDescriptions.runModule.paramsSchema)
          return {
            moduleName: params.module.name,
            command: params.args,
            completedAt: now,
            log: "bla bla",
            success: true,
            startedAt: now,
            version: params.module.version.versionString,
          }
        },

        testModule: async (params) => {
          validateParams(params, moduleActionDescriptions.testModule.paramsSchema)

          // Create artifacts, to test artifact copying
          for (const artifact of params.test.config.spec.artifacts || []) {
            await ensureFile(join(params.artifactsPath, artifact.source))
          }

          return {
            moduleName: params.module.name,
            command: [],
            completedAt: now,
            log: "bla bla",
            outputs: {
              log: "bla bla",
            },
            success: true,
            startedAt: now,
            testName: params.test.config.name,
            version: params.test.version,
          }
        },

        getTestResult: async (params) => {
          validateParams(params, moduleActionDescriptions.getTestResult.paramsSchema)
          return {
            moduleName: params.module.name,
            command: [],
            completedAt: now,
            log: "bla bla",
            outputs: {
              log: "bla bla",
            },
            success: true,
            startedAt: now,
            testName: params.test.name,
            version: params.test.version,
          }
        },

        getServiceStatus: async (params) => {
          validateParams(params, moduleActionDescriptions.getServiceStatus.paramsSchema)
          return { state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } }
        },

        deployService: async (params) => {
          validateParams(params, moduleActionDescriptions.deployService.paramsSchema)
          return { state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } }
        },

        deleteService: async (params) => {
          validateParams(params, moduleActionDescriptions.deleteService.paramsSchema)
          return { state: "ready", detail: {} }
        },

        execInService: async (params) => {
          validateParams(params, moduleActionDescriptions.execInService.paramsSchema)
          return {
            code: 0,
            output: "bla bla",
          }
        },

        getServiceLogs: async (params) => {
          validateParams(params, moduleActionDescriptions.getServiceLogs.paramsSchema)
          return {}
        },

        runService: async (params) => {
          validateParams(params, moduleActionDescriptions.runService.paramsSchema)
          return {
            moduleName: params.module.name,
            command: ["foo"],
            completedAt: now,
            log: "bla bla",
            success: true,
            startedAt: now,
            version: params.service.version,
          }
        },

        getPortForward: async (params) => {
          validateParams(params, moduleActionDescriptions.getPortForward.paramsSchema)
          return {
            hostname: "bla",
            port: 123,
          }
        },

        stopPortForward: async (params) => {
          validateParams(params, moduleActionDescriptions.stopPortForward.paramsSchema)
          return {}
        },

        getTaskResult: async (params) => {
          validateParams(params, moduleActionDescriptions.getTaskResult.paramsSchema)
          const module = params.task.module
          return {
            moduleName: module.name,
            taskName: params.task.name,
            command: ["foo"],
            completedAt: now,
            log: "bla bla",
            outputs: { base: "ok", foo: "ok" },
            success: true,
            startedAt: now,
            version: params.task.version,
          }
        },

        runTask: async (params) => {
          validateParams(params, moduleActionDescriptions.runTask.paramsSchema)

          const module = params.task.module

          // Create artifacts, to test artifact copying
          for (const artifact of params.task.spec.artifacts || []) {
            await ensureFile(join(params.artifactsPath, artifact.source))
          }

          return {
            moduleName: module.name,
            taskName: params.task.name,
            command: ["foo"],
            completedAt: now,
            log: "bla bla",
            outputs: { base: "ok", foo: "ok" },
            success: true,
            startedAt: now,
            version: params.task.version,
          }
        },
      },
    },
  ],
})

const testPluginB = createGardenPlugin({
  ...omit(testPlugin, ["createModuleTypes"]),
  name: "test-plugin-b",
})

function validateParams(params: any, schema: CustomObjectSchema) {
  validateSchema(
    params,
    schema.keys({
      graph: joi.object(),
    })
  )
}
