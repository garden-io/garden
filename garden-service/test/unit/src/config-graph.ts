import { resolve, join } from "path"
import { expect } from "chai"
import { ensureDir } from "fs-extra"
import { makeTestGardenA, makeTestGarden, dataDir, expectError } from "../../helpers"
import { getNames } from "../../../src/util/util"
import { ConfigGraph, DependencyGraphNode } from "../../../src/config-graph"
import { Garden } from "../../../src/garden"
import { DEFAULT_API_VERSION, GARDEN_SERVICE_ROOT } from "../../../src/constants"

describe("ConfigGraph", () => {
  let gardenA: Garden
  let graphA: ConfigGraph
  let tmpPath: string

  before(async () => {
    gardenA = await makeTestGardenA()
    graphA = await gardenA.getConfigGraph(gardenA.log)
    tmpPath = join(GARDEN_SERVICE_ROOT, "tmp")
    await ensureDir(tmpPath)
  })

  it("should throw when two services have the same name", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-service"))

    await expectError(
      () => garden.getConfigGraph(garden.log),
      (err) =>
        expect(err.message).to.equal(
          "Service names must be unique - the service name 'dupe' is declared multiple times " +
            "(in modules 'module-a' and 'module-b')"
        )
    )
  })

  it("should throw when two tasks have the same name", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-task"))

    await expectError(
      () => garden.getConfigGraph(garden.log),
      (err) =>
        expect(err.message).to.equal(
          "Task names must be unique - the task name 'dupe' is declared multiple times " +
            "(in modules 'module-a' and 'module-b')"
        )
    )
  })

  it("should throw when a service and a task have the same name", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-service-and-task"))

    await expectError(
      () => garden.getConfigGraph(garden.log),
      (err) =>
        expect(err.message).to.equal(
          "Service and task names must be mutually unique - the name 'dupe' is used for a task " +
            "in 'module-b' and for a service in 'module-a'"
        )
    )
  })

  it("should automatically add service source modules as module build dependencies", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "source-module"))
    const graph = await garden.getConfigGraph(garden.log)
    const module = await graph.getModule("module-b")
    expect(module.build.dependencies).to.eql([{ name: "module-a", copy: [] }])
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const modules = await graphA.getModules()
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const modules = await graphA.getModules({ names: ["module-b", "module-c"] })
      expect(getNames(modules).sort()).to.eql(["module-b", "module-c"])
    })

    it("should omit disabled modules", async () => {
      const garden = await makeTestGardenA()

      await garden.scanModules()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph(garden.log)
      const modules = await graph.getModules()

      expect(modules.map((m) => m.name).sort()).to.eql(["module-a", "module-b"])
    })

    it("should optionally include disabled modules", async () => {
      const garden = await makeTestGardenA()

      await garden.scanModules()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph(garden.log)
      const modules = await graph.getModules({ includeDisabled: true })

      expect(modules.map((m) => m.name).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should throw if specifically requesting a disabled module", async () => {
      const garden = await makeTestGardenA()

      await garden.scanModules()
      garden["moduleConfigs"]["module-c"].disabled = true

      const graph = await garden.getConfigGraph(garden.log)

      await expectError(
        () => graph.getModules({ names: ["module-c"] }),
        (err) => expect(err.message).to.equal("Could not find module(s): module-c")
      )
    })

    it("should throw if named module is missing", async () => {
      try {
        await graphA.getModules({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getServices", () => {
    it("should scan for modules and return all registered services in the context", async () => {
      const services = await graphA.getServices()

      expect(getNames(services).sort()).to.eql(["service-a", "service-b", "service-c"])
    })

    it("should optionally return specified services in the context", async () => {
      const services = await graphA.getServices({ names: ["service-b", "service-c"] })

      expect(getNames(services).sort()).to.eql(["service-b", "service-c"])
    })

    it("should omit disabled services", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
                hotReloadable: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)
      const deps = await graph.getServices()

      expect(deps).to.eql([])
    })

    it("should optionally include disabled services", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "disabled-service",
                dependencies: [],
                disabled: true,
                hotReloadable: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)
      const deps = await graph.getServices({ includeDisabled: true })

      expect(deps.map((s) => s.name)).to.eql(["disabled-service"])
    })

    it("should throw if specifically requesting a disabled service", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: true,
                hotReloadable: false,
                spec: {},
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      await expectError(
        () => graph.getServices({ names: ["service-a"] }),
        (err) => expect(err.message).to.equal("Could not find service(s): service-a")
      )
    })

    it("should throw if named service is missing", async () => {
      try {
        await graphA.getServices({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getService", () => {
    it("should return the specified service", async () => {
      const service = await graphA.getService("service-b")

      expect(service.name).to.equal("service-b")
    })

    it("should throw if service is missing", async () => {
      try {
        await graphA.getService("bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getTasks", () => {
    it("should scan for modules and return all registered tasks in the context", async () => {
      const tasks = await graphA.getTasks()
      expect(getNames(tasks).sort()).to.eql(["task-a", "task-b", "task-c"])
    })

    it("should optionally return specified tasks in the context", async () => {
      const tasks = await graphA.getTasks({ names: ["task-b", "task-c"] })
      expect(getNames(tasks).sort()).to.eql(["task-b", "task-c"])
    })

    it("should omit disabled tasks", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)
      const deps = await graph.getTasks()

      expect(deps).to.eql([])
    })

    it("should optionally include disabled tasks", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)
      const deps = await graph.getTasks({ includeDisabled: true })

      expect(deps.map((t) => t.name)).to.eql(["disabled-task"])
    })

    it("should throw if specifically requesting a disabled task", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            tasks: [
              {
                name: "disabled-task",
                dependencies: [],
                disabled: true,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      await expectError(
        () => graph.getTasks({ names: ["disabled-task"] }),
        (err) => expect(err.message).to.equal("Could not find task(s): disabled-task")
      )
    })

    it("should throw if named task is missing", async () => {
      try {
        await graphA.getTasks({ names: ["bla"] })
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getTask", () => {
    it("should return the specified task", async () => {
      const task = await graphA.getTask("task-b")

      expect(task.name).to.equal("task-b")
    })

    it("should throw if task is missing", async () => {
      try {
        await graphA.getTask("bla")
      } catch (err) {
        expect(err.type).to.equal("parameter")
        return
      }

      throw new Error("Expected error")
    })
  })

  describe("getDependencies", () => {
    it("should include disabled modules in build dependencies", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true,
          name: "module-a",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: false,
          name: "module-b",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "build",
        name: "module-b",
        recursive: false,
      })

      expect(deps.build.map((m) => m.name)).to.eql(["module-a"])
    })

    it("should ignore dependencies by services on disabled services", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "disabled-service",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
            {
              name: "enabled-service",
              dependencies: ["disabled-service"],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "deploy",
        name: "enabled-service",
        recursive: false,
      })

      expect(deps.deploy).to.eql([])
    })

    it("should ignore dependencies by services on disabled tasks", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "enabled-service",
              dependencies: ["disabled-task"],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [
            {
              name: "disabled-task",
              dependencies: [],
              disabled: true,
              spec: {},
              timeout: null,
            },
          ],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "deploy",
        name: "enabled-service",
        recursive: false,
      })

      expect(deps.run).to.eql([])
    })

    it("should ignore dependencies by services on services in disabled modules", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "disabled-service",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-b",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "enabled-service",
              dependencies: ["disabled-service"],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "deploy",
        name: "enabled-service",
        recursive: false,
      })

      expect(deps.deploy).to.eql([])
    })

    it("should ignore dependencies by tasks on disabled services", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "disabled-service",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [
            {
              name: "enabled-task",
              dependencies: ["disabled-service"],
              disabled: false,
              spec: {},
              timeout: null,
            },
          ],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "deploy",
        name: "enabled-task",
        recursive: false,
      })

      expect(deps.deploy).to.eql([])
    })

    it("should ignore dependencies by tests on disabled services", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "foo",
          outputs: {},
          path: tmpPath,
          serviceConfigs: [
            {
              name: "disabled-service",
              dependencies: [],
              disabled: true,
              hotReloadable: false,
              spec: {},
            },
          ],
          taskConfigs: [],
          spec: {},
          testConfigs: [
            {
              name: "enabled-test",
              dependencies: ["disabled-service"],
              disabled: false,
              spec: {},
              timeout: null,
            },
          ],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)

      const deps = await graph.getDependencies({
        nodeType: "deploy",
        name: "enabled-test",
        recursive: false,
      })

      expect(deps.deploy).to.eql([])
    })
  })

  describe("resolveDependencyModules", () => {
    it("should include disabled modules in build dependencies", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true,
          name: "module-a",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-b",
          include: [],
          outputs: {},
          path: tmpPath,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {},
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph(garden.log)
      const deps = await graph.resolveDependencyModules([{ name: "module-a", copy: [] }], [])

      expect(deps.map((m) => m.name)).to.eql(["module-a"])
    })
  })

  describe("resolveDependencyModules", () => {
    it("should resolve build dependencies", async () => {
      const modules = await graphA.resolveDependencyModules([{ name: "module-c", copy: [] }], [])
      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should resolve service dependencies", async () => {
      const modules = await graphA.resolveDependencyModules([], ["service-b"])
      expect(getNames(modules)).to.eql(["module-a", "module-b"])
    })

    it("should combine module and service dependencies", async () => {
      const modules = await graphA.resolveDependencyModules([{ name: "module-b", copy: [] }], ["service-c"])
      expect(getNames(modules)).to.eql(["module-a", "module-b", "module-c"])
    })
  })

  describe("render", () => {
    it("should render config graph nodes with test names", () => {
      const rendered = graphA.render()
      expect(rendered.nodes).to.have.deep.members([
        {
          type: "build",
          name: "module-a",
          moduleName: "module-a",
          key: "build.module-a",
        },
        {
          type: "build",
          name: "module-b",
          moduleName: "module-b",
          key: "build.module-b",
        },
        {
          type: "build",
          name: "module-c",
          moduleName: "module-c",
          key: "build.module-c",
        },
        {
          type: "test",
          name: "unit",
          moduleName: "module-c",
          key: "test.module-c.unit",
        },
        {
          type: "test",
          name: "integ",
          moduleName: "module-c",
          key: "test.module-c.integ",
        },
        {
          type: "run",
          name: "task-c",
          moduleName: "module-c",
          key: "task.task-c",
        },
        {
          type: "deploy",
          name: "service-c",
          moduleName: "module-c",
          key: "deploy.service-c",
        },
        {
          type: "test",
          name: "unit",
          moduleName: "module-a",
          key: "test.module-a.unit",
        },
        {
          type: "test",
          name: "integration",
          moduleName: "module-a",
          key: "test.module-a.integration",
        },
        {
          type: "run",
          name: "task-a",
          moduleName: "module-a",
          key: "task.task-a",
        },
        {
          type: "test",
          name: "unit",
          moduleName: "module-b",
          key: "test.module-b.unit",
        },
        {
          type: "run",
          name: "task-b",
          moduleName: "module-b",
          key: "task.task-b",
        },
        {
          type: "deploy",
          name: "service-a",
          moduleName: "module-a",
          key: "deploy.service-a",
        },
        {
          type: "deploy",
          name: "service-b",
          moduleName: "module-b",
          key: "deploy.service-b",
        },
      ])
    })
  })
})

describe("DependencyGraphNode", () => {
  describe("render", () => {
    it("should render a build node", () => {
      const node = new DependencyGraphNode("build", "module-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "build",
        name: "module-a",
        moduleName: "module-a",
        key: "build.module-a",
      })
    })

    it("should render a deploy node", () => {
      const node = new DependencyGraphNode("deploy", "service-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "deploy",
        name: "service-a",
        moduleName: "module-a",
        key: "deploy.service-a",
      })
    })

    it("should render a run node", () => {
      const node = new DependencyGraphNode("run", "task-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "run",
        name: "task-a",
        moduleName: "module-a",
        key: "task.task-a",
      })
    })

    it("should render a test node", () => {
      const node = new DependencyGraphNode("test", "module-a.test-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "test",
        name: "test-a",
        moduleName: "module-a",
        key: "test.module-a.test-a",
      })
    })
  })
})
