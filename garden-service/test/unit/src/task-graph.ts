import Bluebird from "bluebird"
import { join } from "path"
import { expect } from "chai"
import { BaseTask, TaskType } from "../../../src/tasks/base"
import { TaskGraph, TaskResult, TaskResults } from "../../../src/task-graph"
import { makeTestGarden, freezeTime, dataDir, defer } from "../../helpers"
import { Garden } from "../../../src/garden"
import { deepFilter } from "../../../src/util/util"

const projectRoot = join(dataDir, "test-project-empty")

type TestTaskCallback = (name: string, result: any) => Promise<void>

interface TestTaskOptions {
  callback?: TestTaskCallback
  dependencies?: BaseTask[]
  versionString?: string
  uid?: string
  throwError?: boolean
}

class TestTask extends BaseTask {
  type: TaskType = "test"
  name: string
  callback: TestTaskCallback | null
  uid: string
  throwError: boolean

  constructor(garden: Garden, name: string, force: boolean, options?: TestTaskOptions) {
    super({
      garden,
      log: garden.log,
      version: {
        versionString: (options && options.versionString) || "12345-6789",
        dependencyVersions: {},
        files: [],
      },
      force,
    })

    if (!options) {
      options = {}
    }

    this.name = name
    this.callback = options.callback || null
    this.uid = options.uid || ""
    this.throwError = !!options.throwError
    this.dependencies = options.dependencies || []
  }

  getName() {
    return this.name
  }

  getKey(): string {
    return this.name
  }

  getId(): string {
    return this.uid ? `${this.name}.${this.uid}` : this.name
  }

  getDescription() {
    return this.getId()
  }

  async process(dependencyResults: TaskResults) {
    const result = { result: "result-" + this.getId(), dependencyResults }

    if (this.callback) {
      await this.callback(this.getId(), result.result)
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
      const now = freezeTime()
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false)

      const results = await graph.process([task])

      const expected: TaskResults = {
        a: {
          type: "test",
          description: "a",
          key: "a",
          name: "a",
          completedAt: now,
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

      const result = await graph.process([task])

      expect(garden.events.eventLog).to.eql([
        {
          name: "taskPending",
          payload: {
            addedAt: now,
            key: task.getKey(),
            name: task.name,
            type: task.type,
          },
        },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        {
          name: "taskProcessing",
          payload: {
            startedAt: now,
            key: task.getKey(),
            name: task.name,
            type: task.type,
            version: task.version,
          },
        },
        { name: "taskComplete", payload: result["a"] },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it.skip("should throw if tasks have circular dependencies", async () => {
      throw new Error("TODO")
    })

    it("should emit events when processing and completing a task", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false)
      await graph.process([task])

      garden.events.eventLog = []

      // repeatedTask has the same key and version as task, so its result is already cached
      const repeatedTask = new TestTask(garden, "a", false)
      await graph.process([repeatedTask])

      expect(garden.events.eventLog).to.eql([
        {
          name: "taskComplete",
          payload: {
            completedAt: now,
            dependencyResults: {},
            description: "a",
            key: task.getKey(),
            type: "test",
            name: "a",
            output: { dependencyResults: {}, result: "result-a" },
          },
        },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it("should emit a taskError event when failing a task", async () => {
      const now = freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false, { throwError: true })

      const result = await graph.process([task])
      expect(garden.events.eventLog).to.eql([
        {
          name: "taskPending",
          payload: {
            addedAt: now,
            key: task.getKey(),
            name: task.name,
            type: task.type,
          },
        },
        { name: "taskGraphProcessing", payload: { startedAt: now } },
        {
          name: "taskProcessing",
          payload: {
            startedAt: now,
            key: task.getKey(),
            name: task.name,
            type: task.type,
            version: task.version,
          },
        },
        { name: "taskError", payload: result["a"] },
        { name: "taskGraphComplete", payload: { completedAt: now } },
      ])
    })

    it("should have error property inside taskError event when failing a task", async () => {
      freezeTime()

      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)
      const task = new TestTask(garden, "a", false, { throwError: true })

      await graph.process([task])
      const taskError = garden.events.eventLog.find((obj) => obj.name === "taskError")

      expect(taskError && taskError.payload["error"]).to.exist
    })

    it("should process multiple tasks in dependency order", async () => {
      const now = freezeTime()
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const callbackResults = {}
      const resultOrder: string[] = []

      const callback = async (key: string, result: any) => {
        resultOrder.push(key)
        callbackResults[key] = result
      }

      const opts = { callback }

      const taskA = new TestTask(garden, "a", false, { ...opts, dependencies: [], uid: "a1" })
      const taskB = new TestTask(garden, "b", false, { ...opts, dependencies: [taskA], uid: "b1" })
      const taskC = new TestTask(garden, "c", false, { ...opts, dependencies: [taskB], uid: "c1" })
      const taskD = new TestTask(garden, "d", false, { ...opts, dependencies: [taskB, taskC], uid: "d1" })

      // we should be able to add tasks multiple times and in any order
      const results = await graph.process([taskA, taskB, taskC, taskC, taskD, taskA, taskD, taskB, taskD, taskA])

      // repeat

      const repeatCallbackResults = {}
      const repeatResultOrder: string[] = []

      const repeatCallback = async (key: string, result: any) => {
        repeatResultOrder.push(key)
        repeatCallbackResults[key] = result
      }

      const repeatOpts = { callback: repeatCallback }

      const repeatTaskA = new TestTask(garden, "a", false, { ...repeatOpts, dependencies: [], uid: "a2" })
      const repeatTaskB = new TestTask(garden, "b", false, { ...repeatOpts, dependencies: [repeatTaskA], uid: "b2" })
      const repeatTaskC = new TestTask(garden, "c", true, { ...repeatOpts, dependencies: [repeatTaskB], uid: "c2" })

      const repeatTaskAforced = new TestTask(garden, "a", true, { ...repeatOpts, dependencies: [], uid: "a2f" })
      const repeatTaskBforced = new TestTask(garden, "b", true, {
        ...repeatOpts,
        dependencies: [repeatTaskA],
        uid: "b2f",
      })

      await graph.process([repeatTaskBforced, repeatTaskAforced, repeatTaskC])

      const resultA: TaskResult = {
        type: "test",
        description: "a.a1",
        key: "a",
        name: "a",
        completedAt: now,
        output: {
          result: "result-a.a1",
          dependencyResults: {},
        },
        dependencyResults: {},
      }
      const resultB: TaskResult = {
        type: "test",
        key: "b",
        name: "b",
        description: "b.b1",
        completedAt: now,
        output: {
          result: "result-b.b1",
          dependencyResults: { a: resultA },
        },
        dependencyResults: { a: resultA },
      }
      const resultC: TaskResult = {
        type: "test",
        description: "c.c1",
        key: "c",
        name: "c",
        completedAt: now,
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
          key: "d",
          name: "d",
          completedAt: now,
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

      expect(callbackResults).to.eql(
        {
          "a.a1": "result-a.a1",
          "b.b1": "result-b.b1",
          "c.c1": "result-c.c1",
          "d.d1": "result-d.d1",
        },
        "Wrong callbackResults after initial add and process"
      )

      expect(repeatResultOrder).to.eql(["a.a2f", "b.b2f", "c.c2"], "Wrong result order after repeat add & process")

      expect(repeatCallbackResults).to.eql(
        {
          "a.a2f": "result-a.a2f",
          "b.b2f": "result-b.b2f",
          "c.c2": "result-c.c2",
        },
        "Wrong callbackResults after repeat add & process"
      )
    })

    it("should add at most one pending task for a given key", async () => {
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const processedVersions: string[] = []

      const { promise: t1StartedPromise, resolver: t1StartedResolver } = defer()
      const { promise: t1DonePromise, resolver: t1DoneResolver } = defer()

      const t1 = new TestTask(garden, "a", false, {
        versionString: "1",
        uid: "1",
        callback: async () => {
          t1StartedResolver()
          processedVersions.push("1")
          await t1DonePromise
        },
      })

      const repeatedCallback = (version: string) => {
        return async () => {
          processedVersions.push(version)
        }
      }
      const t2 = new TestTask(garden, "a", false, { uid: "2", versionString: "2", callback: repeatedCallback("2") })
      const t3 = new TestTask(garden, "a", false, { uid: "3", versionString: "3", callback: repeatedCallback("3") })

      const firstProcess = graph.process([t1])

      // We make sure t1 is being processed before adding t2 and t3. Since t3 is added after t2,
      // only t1 and t3 should be processed (since t2 and t3 have the same key, "a").
      await t1StartedPromise
      const secondProcess = graph.process([t2])
      const thirdProcess = graph.process([t3])
      t1DoneResolver()
      await Bluebird.all([firstProcess, secondProcess, thirdProcess])
      expect(processedVersions).to.eql(["1", "3"])
    })

    it("should recursively cancel a task's dependants when it throws an error", async () => {
      const now = freezeTime()
      const garden = await getGarden()
      const graph = new TaskGraph(garden, garden.log)

      const resultOrder: string[] = []

      const callback = async (key: string) => {
        resultOrder.push(key)
      }

      const opts = { callback }

      const taskA = new TestTask(garden, "a", true, { ...opts })
      const taskB = new TestTask(garden, "b", true, { callback, throwError: true, dependencies: [taskA] })
      const taskC = new TestTask(garden, "c", true, { ...opts, dependencies: [taskB] })
      const taskD = new TestTask(garden, "d", true, { ...opts, dependencies: [taskB, taskC] })

      const results = await graph.process([taskA, taskB, taskC, taskD])

      const resultA: TaskResult = {
        type: "test",
        description: "a",
        key: "a",
        name: "a",
        completedAt: now,
        output: {
          result: "result-a",
          dependencyResults: {},
        },
        dependencyResults: {},
      }

      const filteredKeys: Set<string | number> = new Set([
        "version",
        "error",
        "addedAt",
        "startedAt",
        "cancelledAt",
        "completedAt",
      ])

      const filteredEventLog = garden.events.eventLog.map((e) => {
        return deepFilter(e, (_, key) => !filteredKeys.has(key))
      })

      expect(results.a).to.eql(resultA)
      expect(results.b).to.have.property("error")
      expect(resultOrder).to.eql(["a", "b"])
      expect(filteredEventLog).to.eql([
        { name: "taskPending", payload: { key: "a", name: "a", type: "test" } },
        { name: "taskPending", payload: { key: "b", name: "b", type: "test" } },
        { name: "taskPending", payload: { key: "c", name: "c", type: "test" } },
        { name: "taskPending", payload: { key: "d", name: "d", type: "test" } },
        { name: "taskGraphProcessing", payload: {} },
        { name: "taskProcessing", payload: { key: "a", name: "a", type: "test" } },
        {
          name: "taskComplete",
          payload: {
            dependencyResults: {},
            description: "a",
            key: "a",
            name: "a",
            output: { dependencyResults: {}, result: "result-a" },
            type: "test",
          },
        },
        { name: "taskProcessing", payload: { key: "b", name: "b", type: "test" } },
        { name: "taskError", payload: { description: "b", key: "b", name: "b", type: "test" } },
        { name: "taskCancelled", payload: { key: "c", name: "c", type: "test" } },
        { name: "taskCancelled", payload: { key: "d", name: "d", type: "test" } },
        { name: "taskCancelled", payload: { key: "d", name: "d", type: "test" } },
        { name: "taskGraphComplete", payload: {} },
      ])
    })
  })
})
