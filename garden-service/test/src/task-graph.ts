import { join } from "path"
import { expect } from "chai"
import { BaseTask } from "../../src/tasks/base"
import {
  TaskGraph,
  TaskResult,
  TaskResults,
} from "../../src/task-graph"
import { makeTestGarden, freezeTime } from "../helpers"
import { Garden } from "../../src/garden"
import { DependencyGraphNodeType } from "../../src/config-graph"

const projectRoot = join(__dirname, "..", "data", "test-project-empty")

type TestTaskCallback = (name: string, result: any) => Promise<void>

interface TestTaskOptions {
  callback?: TestTaskCallback
  dependencies?: BaseTask[],
  id?: string
  throwError?: boolean
}

class TestTask extends BaseTask {
  type = "test"
  depType: DependencyGraphNodeType = "test"
  name: string
  callback: TestTaskCallback | null
  id: string
  throwError: boolean

  constructor(
    garden: Garden,
    name: string,
    force,
    options?: TestTaskOptions,
  ) {
    super({
      garden,
      log: garden.log,
      version: {
        versionString: "12345-6789",
        dirtyTimestamp: 6789,
        dependencyVersions: {},
      },
      force,
    })

    if (!options) {
      options = {}
    }

    this.name = name
    this.callback = options.callback || null
    this.id = options.id || ""
    this.throwError = !!options.throwError
    this.dependencies = options.dependencies || []
  }

  getName() {
    return this.name
  }

  getBaseKey(): string {
    return this.name
  }

  getKey(): string {
    return this.id ? `${this.name}.${this.id}` : this.name
  }

  getDescription() {
    return this.getKey()
  }

  async process(dependencyResults: TaskResults) {
    const result = { result: "result-" + this.getKey(), dependencyResults }

    if (this.callback) {
      await this.callback(this.getKey(), result.result)
    }

    if (this.throwError) {
      throw new Error()
    }

    return result
  }
}

describe("task-graph", () => {

  describe("TaskGraph", () => {
    async function getGarden() {
      return makeTestGarden(projectRoot)
    }

    it("should successfully process a single task without dependencies", async () => {
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false)

      await graph.addTask(task)
      const results = await graph.processTasks()

      const expected: TaskResults = {
        a: {
          type: "test",
          description: "a",
          key: "a",
          output: {
            result: "result-a",
            dependencyResults: {},
          },
          dependencyResults: {},
        },
      }

      expect(results).to.eql(expected)
    })

    it("should emit a taskPending event when adding a task", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false)

      await graph.addTask(task)

      expect(garden.events.log).to.eql([
        { name: "taskPending", payload: { addedAt: now, key: task.getKey(), version: task.version } },
      ])
    })

    it("should not emit a taskPending event when adding a task with a cached result", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const task = new TestTask(garden, "a", false)
      await graph.addTask(task)
      const result = await graph.processTasks()

      // repeatedTask has the same baseKey and version as task, so its result is already cached
      const repeatedTask = new TestTask(garden, "a", false)
      await graph.addTask(repeatedTask)

      expect(garden.events.log).to.eql([
        { name: "taskPending", payload: { addedAt: now, key: task.getKey(), version: task.version } },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        { name: "taskComplete", payload: result["a"] },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it("should emit events when processing and completing a task", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false)

      await graph.addTask(task)
      const result = await graph.processTasks()

      expect(garden.events.log).to.eql([
        { name: "taskPending", payload: { addedAt: now, key: task.getKey(), version: task.version } },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        { name: "taskComplete", payload: result["a"] },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it("should emit a taskError event when failing a task", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false, { throwError: true })

      await graph.addTask(task)
      const result = await graph.processTasks()

      expect(garden.events.log).to.eql([
        { name: "taskPending", payload: { addedAt: now, key: task.getKey(), version: task.version } },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        { name: "taskError", payload: result["a"] },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it("should process multiple tasks in dependency order", async () => {
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const callbackResults = {}
      const resultOrder: string[] = []

      const callback = async (key: string, result: any) => {
        resultOrder.push(key)
        callbackResults[key] = result
      }

      const opts = { callback }

      const taskA = new TestTask(garden, "a", false, { ...opts, dependencies: [], id: "a1" })
      const taskB = new TestTask(garden, "b", false, { ...opts, dependencies: [taskA], id: "b1" })
      const taskC = new TestTask(garden, "c", false, { ...opts, dependencies: [taskB], id: "c1" })
      const taskD = new TestTask(garden, "d", false, { ...opts, dependencies: [taskB, taskC], id: "d1" })

      // we should be able to add tasks multiple times and in any order

      await graph.addTask(taskA)
      await graph.addTask(taskB)
      await graph.addTask(taskC)
      await graph.addTask(taskC)
      await graph.addTask(taskD)
      await graph.addTask(taskA)
      await graph.addTask(taskD)
      await graph.addTask(taskB)
      await graph.addTask(taskB)
      await graph.addTask(taskD)
      await graph.addTask(taskA)
      await graph.addTask(taskB)

      const results = await graph.processTasks()

      // repeat

      const repeatCallbackResults = {}
      const repeatResultOrder: string[] = []

      const repeatCallback = async (key: string, result: any) => {
        repeatResultOrder.push(key)
        repeatCallbackResults[key] = result
      }

      const repeatOpts = { callback: repeatCallback }

      const repeatTaskA = new TestTask(garden, "a", false, { ...repeatOpts, dependencies: [], id: "a2" })
      const repeatTaskB = new TestTask(garden, "b", false, { ...repeatOpts, dependencies: [repeatTaskA], id: "b2" })
      const repeatTaskC = new TestTask(garden, "c", true, { ...repeatOpts, dependencies: [repeatTaskB], id: "c2" })

      const repeatTaskAforced = new TestTask(garden, "a", true, { ...repeatOpts, dependencies: [], id: "a2f" })
      const repeatTaskBforced = new TestTask(garden, "b", true,
        { ...repeatOpts, dependencies: [repeatTaskA], id: "b2f" })

      await graph.addTask(repeatTaskBforced)
      await graph.addTask(repeatTaskAforced)
      await graph.addTask(repeatTaskC)

      await graph.processTasks()

      const resultA: TaskResult = {
        type: "test",
        description: "a.a1",
        key: "a.a1",
        output: {
          result: "result-a.a1",
          dependencyResults: {},
        },
        dependencyResults: {},
      }
      const resultB: TaskResult = {
        type: "test",
        key: "b.b1",
        description: "b.b1",
        output: {
          result: "result-b.b1",
          dependencyResults: { a: resultA },
        },
        dependencyResults: { a: resultA },
      }
      const resultC: TaskResult = {
        type: "test",
        description: "c.c1",
        key: "c.c1",
        output: {
          result: "result-c.c1",
          dependencyResults: { b: resultB },
        },
        dependencyResults: { b: resultB },
      }

      const expected: TaskResults = {
        a: resultA,
        b: resultB,
        c: resultC,
        d: {
          type: "test",
          description: "d.d1",
          key: "d.d1",
          output: {
            result: "result-d.d1",
            dependencyResults: {
              b: resultB,
              c: resultC,
            },
          },
          dependencyResults: {
            b: resultB,
            c: resultC,
          },
        },
      }

      expect(results).to.eql(expected, "Wrong results after initial add and process")
      expect(resultOrder).to.eql(["a.a1", "b.b1", "c.c1", "d.d1"], "Wrong result order after initial add and process")

      expect(callbackResults).to.eql({
        "a.a1": "result-a.a1",
        "b.b1": "result-b.b1",
        "c.c1": "result-c.c1",
        "d.d1": "result-d.d1",
      }, "Wrong callbackResults after initial add and process")

      expect(repeatResultOrder).to.eql(["a.a2f", "b.b2f", "c.c2"], "Wrong result order after repeat add & process")

      expect(repeatCallbackResults).to.eql({
        "a.a2f": "result-a.a2f",
        "b.b2f": "result-b.b2f",
        "c.c2": "result-c.c2",
      }, "Wrong callbackResults after repeat add & process")

    })

    it("should recursively cancel a task's dependants when it throws an error", async () => {
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const resultOrder: string[] = []

      const callback = async (key: string) => {
        resultOrder.push(key)
      }

      const opts = { callback }

      const taskA = new TestTask(garden, "a", false, { ...opts })
      const taskB = new TestTask(garden, "b", false, { callback, throwError: true, dependencies: [taskA] })
      const taskC = new TestTask(garden, "c", false, { ...opts, dependencies: [taskB] })
      const taskD = new TestTask(garden, "d", false, { ...opts, dependencies: [taskB, taskC] })

      await graph.addTask(taskA)
      await graph.addTask(taskB)
      await graph.addTask(taskC)
      await graph.addTask(taskD)

      const results = await graph.processTasks()

      const resultA: TaskResult = {
        type: "test",
        description: "a",
        key: "a",
        output: {
          result: "result-a",
          dependencyResults: {},
        },
        dependencyResults: {},
      }

      expect(results.a).to.eql(resultA)
      expect(results.b).to.have.property("error")
      expect(resultOrder).to.eql(["a", "b"])
    })

  })
})
