import { resolve } from "path"
import { expect } from "chai"
import { makeTestGardenA, makeTestGarden, dataDir, expectError } from "../../helpers"
import { getNames } from "../../../src/util/util"
import { ConfigGraph, DependencyGraphNode } from "../../../src/config-graph"
import { Garden } from "../../../src/garden"

describe("ConfigGraph", () => {
  let gardenA: Garden
  let graphA: ConfigGraph

  before(async () => {
    gardenA = await makeTestGardenA()
    graphA = await gardenA.getConfigGraph()
  })

  it("should throw when two services have the same name", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "duplicate-service"))

    await expectError(
      () => garden.getConfigGraph(),
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
      () => garden.getConfigGraph(),
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
      () => garden.getConfigGraph(),
      (err) =>
        expect(err.message).to.equal(
          "Service and task names must be mutually unique - the name 'dupe' is used for a task " +
            "in 'module-b' and for a service in 'module-a'"
        )
    )
  })

  it("should automatically add service source modules as module build dependencies", async () => {
    const garden = await makeTestGarden(resolve(dataDir, "test-projects", "source-module"))
    const graph = await garden.getConfigGraph()
    const module = await graph.getModule("module-b")
    expect(module.build.dependencies).to.eql([{ name: "module-a", copy: [] }])
  })

  describe("getModules", () => {
    it("should scan and return all registered modules in the context", async () => {
      const modules = await graphA.getModules()
      expect(getNames(modules).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should optionally return specified modules in the context", async () => {
      const modules = await graphA.getModules(["module-b", "module-c"])
      expect(getNames(modules).sort()).to.eql(["module-b", "module-c"])
    })

    it("should throw if named module is missing", async () => {
      try {
        await graphA.getModules(["bla"])
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
      const services = await graphA.getServices(["service-b", "service-c"])

      expect(getNames(services).sort()).to.eql(["service-b", "service-c"])
    })

    it("should throw if named service is missing", async () => {
      try {
        await graphA.getServices(["bla"])
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
      const tasks = await graphA.getTasks(["task-b", "task-c"])
      expect(getNames(tasks).sort()).to.eql(["task-b", "task-c"])
    })

    it("should throw if named task is missing", async () => {
      try {
        await graphA.getTasks(["bla"])
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
      const node = new DependencyGraphNode("service", "service-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "deploy",
        name: "service-a",
        moduleName: "module-a",
        key: "deploy.service-a",
      })
    })

    it("should render a run node", () => {
      const node = new DependencyGraphNode("task", "task-a", "module-a")
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

    it("should render a publish node", () => {
      const node = new DependencyGraphNode("publish", "module-a", "module-a")
      const res = node.render()
      expect(res).to.eql({
        type: "publish",
        name: "module-a",
        moduleName: "module-a",
        key: "publish.module-a",
      })
    })
  })
})
