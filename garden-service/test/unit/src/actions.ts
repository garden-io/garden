
import {
  ModuleAndRuntimeActionHandlers,
  PluginActionHandlers,
  moduleActionDescriptions,
  pluginActionDescriptions,
  createGardenPlugin,
  ActionHandler,
  GardenPlugin,
  ModuleActionHandler,
} from "../../../src/types/plugin/plugin"
import { Service, ServiceState } from "../../../src/types/service"
import { RuntimeContext, prepareRuntimeContext } from "../../../src/runtime-context"
import { expectError, makeTestGardenA, stubModuleAction, projectRootA, TestGarden } from "../../helpers"
import { ActionRouter } from "../../../src/actions"
import { Garden } from "../../../src/garden"
import { LogEntry } from "../../../src/logger/log-entry"
import { Module } from "../../../src/types/module"
import { ServiceLogEntry } from "../../../src/types/plugin/service/getServiceLogs"
import Stream from "ts-stream"
import { Task } from "../../../src/types/task"
import { expect } from "chai"
import { omit } from "lodash"
import { validate, joi } from "../../../src/config/common"
import { ProjectConfig } from "../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { defaultProvider } from "../../../src/config/provider"
import { RunTaskResult } from "../../../src/types/plugin/task/runTask"
import { defaultDotIgnoreFiles } from "../../../src/util/fs"
import stripAnsi from "strip-ansi"

const now = new Date()

describe("ActionRouter", () => {
  let garden: Garden
  let log: LogEntry
  let actions: ActionRouter
  let module: Module
  let service: Service
  let runtimeContext: RuntimeContext
  let task: Task

  const projectConfig: ProjectConfig = {
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "test",
    path: projectRootA,
    defaultEnvironment: "default",
    dotIgnoreFiles: defaultDotIgnoreFiles,
    environments: [
      { name: "default", variables: {} },
    ],
    providers: [
      { name: "base" },
      { name: "test-plugin" },
      { name: "test-plugin-b" },
    ],
    variables: {},
  }

  before(async () => {
    garden = await TestGarden.factory(projectRootA, {
      plugins: [basePlugin, testPlugin, testPluginB],
      config: projectConfig,
    })
    log = garden.log
    actions = await garden.getActionRouter()
    const graph = await garden.getConfigGraph()
    module = await graph.getModule("module-a")
    service = await graph.getService("service-a")
    runtimeContext = await prepareRuntimeContext({
      garden,
      graph,
      dependencies: {
        build: [],
        service: [],
        task: [],
        test: [],
      },
      module,
      serviceStatuses: {},
      taskResults: {},
    })
    task = await graph.getTask("task-a")
  })

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("configureProvider", () => {
      it("should configure the provider", async () => {
        const config = { foo: "bar" }
        const result = await actions.configureProvider({
          pluginName: "test-plugin",
          log,
          config,
          configStore: garden.configStore,
          projectName: garden.projectName,
          projectRoot: garden.projectRoot,
          dependencies: [],
        })
        expect(result).to.eql({
          config,
        })
      })
    })

    describe("getEnvironmentStatus", () => {
      it("should return the environment status for a provider", async () => {
        const result = await actions.getEnvironmentStatus({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          ready: false,
          outputs: {},
          dashboardPages: [],
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
            dashboardPages: [],
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
    describe("getBuildStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getBuildStatus({ log, module })
        expect(result).to.eql({
          ready: true,
        })
      })
    })

    describe("build", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.build({ log, module })
        expect(result).to.eql({})
      })
    })

    describe("hotReloadService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.hotReloadService({
          log,
          service,
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
        const result = await actions.testModule({
          log,
          module,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
          silent: false,
          testConfig: {
            name: "test",
            dependencies: [],
            timeout: 1234,
            spec: {},
          },
          testVersion: module.version,
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
          version: module.version.versionString,
        })
      })
    })

    describe("getTestResult", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getTestResult({
          log,
          module,
          testName: "test",
          testVersion: module.version,
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
          version: module.version.versionString,
        })
      })
    })
  })

  describe("service actions", () => {
    describe("getServiceStatus", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getServiceStatus({ log, service, runtimeContext, hotReload: false })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } })
      })

      it("should resolve runtime template strings", async () => {
        const result = await actions.getServiceStatus({ log, service, runtimeContext, hotReload: false })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } })
      })

      it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getServiceStatus", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () => actions.getServiceStatus({ log, service, runtimeContext, hotReload: false }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from service 'service-a': key .foo must be a string",
          ),
        )
      })

      it("should throw if the outputs don't match the service outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getServiceStatus", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () => actions.getServiceStatus({ log, service, runtimeContext, hotReload: false }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from service 'service-a': key .base must be a string",
          ),
        )
      })
    })

    describe("deployService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deployService({ log, service, runtimeContext, force: true, hotReload: false })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } })
      })

      it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "deployService", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () => actions.deployService({ log, service, runtimeContext, force: true, hotReload: false }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from service 'service-a': key .foo must be a string",
          ),
        )
      })

      it("should throw if the outputs don't match the service outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "deployService", async () => {
          return { state: <ServiceState>"ready", detail: {}, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () => actions.deployService({ log, service, runtimeContext, force: true, hotReload: false }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from service 'service-a': key .base must be a string",
          ),
        )
      })
    })

    describe("deleteService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.deleteService({ log, service, runtimeContext })
        expect(result).to.eql({ forwardablePorts: [], state: "ready", detail: {} })
      })
    })

    describe("execInService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.execInService({
          log,
          service,
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
        const result = await actions.getServiceLogs({ log, service, runtimeContext, stream, follow: false, tail: -1 })
        expect(result).to.eql({})
      })
    })

    describe("runService", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runService({
          log,
          service,
          interactive: true,
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
          version: service.module.version.versionString,
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
        version: task.module.version.versionString,
      }
    })

    describe("getTaskResult", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.getTaskResult({
          log,
          task,
          taskVersion: task.module.version,
        })
        expect(result).to.eql(taskResult)
      })

      it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getTaskResult", async () => {
          return { ...taskResult, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () => actions.getTaskResult({ log, task, taskVersion: task.module.version }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from task 'task-a': key .foo must be a string",
          ),
        )
      })

      it("should throw if the outputs don't match the task outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, service.module.type, "test-plugin", "getTaskResult", async () => {
          return { ...taskResult, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () => actions.getTaskResult({ log, task, taskVersion: task.module.version }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from task 'task-a': key .base must be a string",
          ),
        )
      })
    })

    describe("runTask", () => {
      it("should correctly call the corresponding plugin handler", async () => {
        const result = await actions.runTask({
          log,
          task,
          interactive: true,
          runtimeContext: {
            envVars: { FOO: "bar" },
            dependencies: [],
          },
          taskVersion: task.module.version,
        })
        expect(result).to.eql(taskResult)
      })

      it("should throw if the outputs don't match the task outputs schema of the plugin", async () => {
        stubModuleAction(actions, task.module.type, "test-plugin", "runTask", async () => {
          return { ...taskResult, outputs: { base: "ok", foo: 123 } }
        })

        await expectError(
          () => actions.runTask({
            log,
            task,
            interactive: true,
            runtimeContext: {
              envVars: { FOO: "bar" },
              dependencies: [],
            },
            taskVersion: task.module.version,
          }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from task 'task-a': key .foo must be a string",
          ),
        )
      })

      it("should throw if the outputs don't match the task outputs schema of a plugin's base", async () => {
        stubModuleAction(actions, task.module.type, "test-plugin", "runTask", async () => {
          return { ...taskResult, outputs: { base: 123, foo: "ok" } }
        })

        await expectError(
          () => actions.runTask({
            log,
            task,
            interactive: true,
            runtimeContext: {
              envVars: { FOO: "bar" },
              dependencies: [],
            },
            taskVersion: task.module.version,
          }),
          (err) => expect(stripAnsi(err.message)).to.equal(
            "Error validating outputs from task 'task-a': key .base must be a string",
          ),
        )
      })
    })
  })

  describe("getActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = await actions["getActionHandlers"]("prepareEnvironment")

      expect(Object.keys(handlers)).to.eql([
        "test-plugin",
        "test-plugin-b",
      ])
    })
  })

  describe("getModuleActionHandlers", () => {
    it("should return all handlers for a type", async () => {
      const handlers = await actions["getModuleActionHandlers"]({ actionType: "build", moduleType: "exec" })

      expect(Object.keys(handlers)).to.eql([
        "exec",
      ])
    })
  })

  describe("getActionHandler", () => {
    it("should return the configured handler for specified action type and plugin name", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      const handler = await actionsA["getActionHandler"]({ actionType: "prepareEnvironment", pluginName })

      expect(handler.actionType).to.equal("prepareEnvironment")
      expect(handler.pluginName).to.equal(pluginName)
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      await expectError(() => actionsA["getActionHandler"]({ actionType: "cleanupEnvironment", pluginName }), "plugin")
    })
  })

  describe("getModuleActionHandler", () => {
    const path = process.cwd()

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
        "parameter",
      )
    })

    context("when no providers extend the module type with requested handler", () => {
      it("should return the handler from the provider that created it", async () => {
        const foo: GardenPlugin = {
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
        }

        const _garden = await Garden.factory(path, {
          plugins: [foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [
              { name: "default", variables: {} },
            ],
            providers: [
              { name: "foo" },
            ],
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
        const base: GardenPlugin = {
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
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base"],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        }

        const _garden = await Garden.factory(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [
              { name: "default", variables: {} },
            ],
            providers: [
              { name: "base" },
              { name: "foo" },
            ],
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
        const base: GardenPlugin = {
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
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base"],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        }
        const too: GardenPlugin = {
          name: "too",
          dependencies: ["base", "foo"],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        }

        const _garden = await Garden.factory(path, {
          plugins: [base, too, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [
              { name: "default", variables: {} },
            ],
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
          const base: GardenPlugin = {
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
          }
          const foo: GardenPlugin = {
            name: "foo",
            dependencies: ["base"],
            extendModuleTypes: [
              {
                name: "bar",
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          }
          const too: GardenPlugin = {
            name: "too",
            dependencies: ["base"],
            extendModuleTypes: [
              {
                name: "bar",
                handlers: {
                  build: async () => ({}),
                },
              },
            ],
          }

          const _garden = await Garden.factory(path, {
            plugins: [base, too, foo],
            config: {
              apiVersion: DEFAULT_API_VERSION,
              kind: "Project",
              name: "test",
              path,
              defaultEnvironment: "default",
              dotIgnoreFiles: [],
              environments: [
                { name: "default", variables: {} },
              ],
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
        const base: GardenPlugin = {
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              handlers: {},
            },
          ],
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base"],
          extendModuleTypes: [
            {
              name: "bar",
              handlers: {
                build: async () => ({}),
              },
            },
          ],
        }

        const _garden = await Garden.factory(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [
              { name: "default", variables: {} },
            ],
            providers: [
              { name: "base" },
              { name: "foo" },
            ],
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
        environments: [
          { name: "default", variables: {} },
        ],
        providers: [
          { name: "base" },
          { name: "foo" },
        ],
        variables: {},
      }

      it("should return the handler for the specific module type, if available", async () => {
        const base: GardenPlugin = {
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
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base"],
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
        }

        const _garden = await Garden.factory(path, {
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
        const base: GardenPlugin = {
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
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base"],
          createModuleTypes: [
            {
              name: "moo",
              base: "bar",
              docs: "moo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        }

        const _garden = await Garden.factory(path, {
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
        const baseA: GardenPlugin = {
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
        }
        const baseB: GardenPlugin = {
          name: "base-b",
          dependencies: ["base-a"],
          createModuleTypes: [
            {
              name: "base-b",
              base: "base-a",
              docs: "base B",
              schema: joi.object(),
              handlers: {},
            },
          ],
        }
        const foo: GardenPlugin = {
          name: "foo",
          dependencies: ["base-b"],
          createModuleTypes: [
            {
              name: "moo",
              base: "base-b",
              docs: "moo",
              schema: joi.object(),
              handlers: {},
            },
          ],
        }

        const _garden = await Garden.factory(path, {
          plugins: [baseA, baseB, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFiles: [],
            environments: [
              { name: "default", variables: {} },
            ],
            providers: [
              { name: "base-a" },
              { name: "base-b" },
              { name: "foo" },
            ],
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
        { actionType: "getEnvironmentStatus", pluginName: "base" },
      )

      const handler: ActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)

        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callActionHandler"]({
        actionType: "getEnvironmentStatus",  // Doesn't matter which one it is
        pluginName: "test-plugin",
        params: {
          log,
        },
        defaultHandler: handler,
      })
    })

    it("should recursively override the base parameter when calling a base handler", async () => {
      const baseA: GardenPlugin = {
        name: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.not.exist
            return { value: params.key }
          },
        },
      }
      const baseB: GardenPlugin = {
        name: "base-b",
        base: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.not.exist
            return params.base!(params)
          },
        },
      }
      const foo: GardenPlugin = {
        name: "foo",
        base: "base-b",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.exist
            return params.base!(params)
          },
        },
      }

      const path = process.cwd()

      const _garden = await Garden.factory(path, {
        plugins: [baseA, baseB, foo],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path,
          defaultEnvironment: "default",
          dotIgnoreFiles: [],
          environments: [
            { name: "default", variables: {} },
          ],
          providers: [
            { name: "foo" },
          ],
          variables: {},
        },
      })

      const _actions = await _garden.getActionRouter()

      const result = await _actions["callActionHandler"]({
        actionType: "getSecret",  // Doesn't matter which one it is
        pluginName: "foo",
        params: {
          key: "foo",
          log,
        },
      })

      expect(result).to.eql({ value: "foo" })
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

      const graph = await garden.getConfigGraph()
      const moduleA = await graph.getModule("module-a")

      const base = Object.assign(
        async () => ({
          ready: true,
          outputs: {},
        }),
        { actionType: "getBuildStatus", pluginName: "base", moduleType: "test" },
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callModuleHandler"]({
        actionType: "getBuildStatus",  // Doesn't matter which one it is
        params: {
          module: moduleA,
          log,
        },
        defaultHandler: handler,
      })
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

      const graph = await garden.getConfigGraph()
      const serviceA = await graph.getService("service-a")

      const base = Object.assign(
        async () => ({
          forwardablePorts: [],
          state: <ServiceState>"ready",
          detail: {},
        }),
        { actionType: "deployService", pluginName: "base", moduleType: "test" },
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { forwardablePorts: [], state: <ServiceState>"ready", detail: {} }
      }

      handler.base = base

      await emptyActions["callServiceHandler"]({
        actionType: "deployService",  // Doesn't matter which one it is
        params: {
          service: serviceA,
          runtimeContext,
          log,
          hotReload: false,
          force: false,
        },
        defaultHandler: handler,
      })
    })

    it("should interpolate runtime template strings", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.foo = "\${runtime.services.service-b.outputs.foo}"

      const graph = await garden.getConfigGraph()
      const serviceA = await graph.getService("service-a")
      const serviceB = await graph.getService("service-b")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          service: [serviceB],
          task: [],
          test: [],
        },
        module: serviceA.module,
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
        actionType: "deployService",  // Doesn't matter which one it is
        params: {
          service: serviceA,
          runtimeContext: _runtimeContext,
          log,
          hotReload: false,
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

      garden["moduleConfigs"]["module-a"].spec.services[0].foo = "\${runtime.services.service-b.outputs.foo}"

      const graph = await garden.getConfigGraph()
      const serviceA = await graph.getService("service-a")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          service: [],
          task: [],
          test: [],
        },
        module: serviceA.module,
        serviceStatuses: {},
        taskResults: {},
      })

      await expectError(
        () => emptyActions["callServiceHandler"]({
          actionType: "deployService",  // Doesn't matter which one it is
          params: {
            service: serviceA,
            runtimeContext: _runtimeContext,
            log,
            hotReload: false,
            force: false,
          },
          defaultHandler: async () => {
            return {} as any
          },
        }),
        (err) => expect(err.message).to.equal(
          "Unable to resolve one or more runtime template values for service 'service-a': " +
          "\${runtime.services.service-b.outputs.foo}",
        ),
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

      const graph = await garden.getConfigGraph()
      const taskA = await graph.getTask("task-a")

      const base = Object.assign(
        async () => ({
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: task.module.version.versionString,
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }),
        { actionType: "runTask", pluginName: "base", moduleType: "test" },
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return {
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: task.module.version.versionString,
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }
      }

      handler.base = base

      await emptyActions["callTaskHandler"]({
        actionType: "runTask",
        params: {
          task: taskA,
          runtimeContext,
          log,
          taskVersion: task.module.version,
          interactive: false,
        },
        defaultHandler: handler,
      })
    })

    it("should interpolate runtime template strings", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          handlers: {},
        },
      })

      garden["moduleConfigs"]["module-a"].spec.tasks[0].foo = "\${runtime.services.service-b.outputs.foo}"

      const graph = await garden.getConfigGraph()
      const taskA = await graph.getTask("task-a")
      const serviceB = await graph.getService("service-b")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          service: [serviceB],
          task: [],
          test: [],
        },
        module: taskA.module,
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
          task: taskA,
          runtimeContext: _runtimeContext,
          log,
          taskVersion: task.module.version,
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
            version: task.module.version.versionString,
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

      garden["moduleConfigs"]["module-a"].spec.tasks[0].foo = "\${runtime.services.service-b.outputs.foo}"

      const graph = await garden.getConfigGraph()
      const taskA = await graph.getTask("task-a")

      const _runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          service: [],
          task: [],
          test: [],
        },
        module: taskA.module,
        // Omitting the service-b outputs here
        serviceStatuses: {},
        taskResults: {},
      })

      await expectError(
        () => emptyActions["callTaskHandler"]({
          actionType: "runTask",
          params: {
            task: taskA,
            runtimeContext: _runtimeContext,
            log,
            taskVersion: task.module.version,
            interactive: false,
          },
          defaultHandler: async () => {
            return {} as any
          },
        }),
        (err) => expect(err.message).to.equal(
          "Unable to resolve one or more runtime template values for task 'task-a': " +
          "\${runtime.services.service-b.outputs.foo}",
        ),
      )
    })
  })
})

const baseOutputsSchema = joi.object().keys({ base: joi.string() })
const testOutputSchema = baseOutputsSchema.keys({ foo: joi.string() })

const basePlugin = createGardenPlugin({
  name: "base",
  createModuleTypes: [{
    name: "base",
    docs: "bla bla bla",
    moduleOutputsSchema: baseOutputsSchema,
    serviceOutputsSchema: baseOutputsSchema,
    taskOutputsSchema: baseOutputsSchema,
    handlers: {},
  }],
})

const testPlugin = createGardenPlugin({
  name: "test-plugin",
  dependencies: ["base"],

  handlers: <PluginActionHandlers>{
    getEnvironmentStatus: async (params) => {
      validate(params, pluginActionDescriptions.getEnvironmentStatus.paramsSchema)
      return {
        ready: false,
        outputs: {},
      }
    },

    prepareEnvironment: async (params) => {
      validate(params, pluginActionDescriptions.prepareEnvironment.paramsSchema)
      return { status: { ready: true, outputs: {} } }
    },

    cleanupEnvironment: async (params) => {
      validate(params, pluginActionDescriptions.cleanupEnvironment.paramsSchema)
      return {}
    },

    getSecret: async (params) => {
      validate(params, pluginActionDescriptions.getSecret.paramsSchema)
      return { value: params.key }
    },

    setSecret: async (params) => {
      validate(params, pluginActionDescriptions.setSecret.paramsSchema)
      return {}
    },

    deleteSecret: async (params) => {
      validate(params, pluginActionDescriptions.deleteSecret.paramsSchema)
      return { found: true }
    },
  },

  createModuleTypes: [{
    name: "test",
    base: "base",

    docs: "bla bla bla",
    moduleOutputsSchema: testOutputSchema,
    serviceOutputsSchema: testOutputSchema,
    taskOutputsSchema: testOutputSchema,
    schema: joi.object(),
    title: "Bla",

    handlers: <ModuleAndRuntimeActionHandlers>{
      configure: async (params) => {
        validate(params, moduleActionDescriptions.configure.paramsSchema)

        const serviceConfigs = params.moduleConfig.spec.services.map(spec => ({
          name: spec.name,
          dependencies: spec.dependencies || [],
          hotReloadable: false,
          spec,
        }))

        const taskConfigs = (params.moduleConfig.spec.tasks || []).map(spec => ({
          name: spec.name,
          dependencies: spec.dependencies || [],
          spec,
        }))

        return {
          moduleConfig: {
            ...params.moduleConfig,
            serviceConfigs,
            taskConfigs,
          },
        }
      },

      getBuildStatus: async (params) => {
        validate(params, moduleActionDescriptions.getBuildStatus.paramsSchema)
        return { ready: true }
      },

      build: async (params) => {
        validate(params, moduleActionDescriptions.build.paramsSchema)
        return {}
      },

      publish: async (params) => {
        validate(params, moduleActionDescriptions.publish.paramsSchema)
        return { published: true }
      },

      hotReloadService: async (params) => {
        validate(params, moduleActionDescriptions.hotReloadService.paramsSchema)
        return {}
      },

      runModule: async (params) => {
        validate(params, moduleActionDescriptions.runModule.paramsSchema)
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
        validate(params, moduleActionDescriptions.testModule.paramsSchema)
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
          testName: params.testConfig.name,
          version: params.module.version.versionString,
        }
      },

      getTestResult: async (params) => {
        validate(params, moduleActionDescriptions.getTestResult.paramsSchema)
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
          testName: params.testName,
          version: params.module.version.versionString,
        }
      },

      getServiceStatus: async (params) => {
        validate(params, moduleActionDescriptions.getServiceStatus.paramsSchema)
        return { state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } }
      },

      deployService: async (params) => {
        validate(params, moduleActionDescriptions.deployService.paramsSchema)
        return { state: "ready", detail: {}, outputs: { base: "ok", foo: "ok" } }
      },

      deleteService: async (params) => {
        validate(params, moduleActionDescriptions.deleteService.paramsSchema)
        return { state: "ready", detail: {} }
      },

      execInService: async (params) => {
        validate(params, moduleActionDescriptions.execInService.paramsSchema)
        return {
          code: 0,
          output: "bla bla",
        }
      },

      getServiceLogs: async (params) => {
        validate(params, moduleActionDescriptions.getServiceLogs.paramsSchema)
        return {}
      },

      runService: async (params) => {
        validate(params, moduleActionDescriptions.runService.paramsSchema)
        return {
          moduleName: params.module.name,
          command: ["foo"],
          completedAt: now,
          log: "bla bla",
          success: true,
          startedAt: now,
          version: params.module.version.versionString,
        }
      },

      getPortForward: async (params) => {
        validate(params, moduleActionDescriptions.getPortForward.paramsSchema)
        return {
          hostname: "bla",
          port: 123,
        }
      },

      stopPortForward: async (params) => {
        validate(params, moduleActionDescriptions.stopPortForward.paramsSchema)
        return {}
      },

      getTaskResult: async (params) => {
        validate(params, moduleActionDescriptions.getTaskResult.paramsSchema)
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
          version: params.module.version.versionString,
        }
      },

      runTask: async (params) => {
        validate(params, moduleActionDescriptions.runTask.paramsSchema)
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
          version: params.module.version.versionString,
        }
      },
    },
  }],
})

const testPluginB = createGardenPlugin({
  ...omit(testPlugin, ["createModuleTypes"]),
  name: "test-plugin-b",
})
