import { join } from "path"
import { expect } from "chai"
import { Task } from "../../src/tasks/base"
import {
  TaskGraph,
  TaskResult,
  TaskResults,
} from "../../src/task-graph"
import { makeTestGarden } from "../helpers"

const projectRoot = join(__dirname, "..", "data", "test-project-empty")

type TestTaskCallback = (name: string, result: any) => Promise<void>

interface TestTaskOptions {
  callback?: TestTaskCallback
  id?: string
  throwError?: boolean
}

class TestTask extends Task {
  type = "test"
  name: string
  callback: TestTaskCallback | null
  id: string
  throwError: boolean

  constructor(
    name: string,
    dependencies?: Task[],
    options?: TestTaskOptions,
  ) {
    super({
      version: {
        versionString: "12345-6789",
        dirtyTimestamp: 6789,
        dependencyVersions: {},
      },
    })
    this.name = name
    this.callback = (options && options.callback) || null
    this.id = (options && options.id) || ""
    this.throwError = !!(options && options.throwError)

    if (dependencies) {
      this.dependencies = dependencies
    }
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
    async function getContext() {
      const garden = await makeTestGarden(projectRoot)
      return garden.getPluginContext()
    }

    it("should successfully process a single task without dependencies", async () => {
      const ctx = await getContext()
      const graph = new TaskGraph(ctx)
      const task = new TestTask("a")

      await graph.addTask(task)
      const results = await graph.processTasks()

      const expected: TaskResults = {
        a: {
          type: "test",
          description: "a",
          output: {
            result: "result-a",
            dependencyResults: {},
          },
          dependencyResults: {},
        },
      }

      expect(results).to.eql(expected)
    })

    it("should process multiple tasks in dependency order", async () => {
      const ctx = await getContext()
      const graph = new TaskGraph(ctx)

      const callbackResults = {}
      const resultOrder: string[] = []

      const callback = async (key: string, result: any) => {
        resultOrder.push(key)
        callbackResults[key] = result
      }

      const opts = { callback }

      const taskA = new TestTask("a", [], opts)
      const taskB = new TestTask("b", [taskA], opts)
      const taskC = new TestTask("c", [taskB], opts)
      const taskD = new TestTask("d", [taskB, taskC], opts)

      // we should be able to add tasks multiple times and in any order
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

      const resultA: TaskResult = {
        type: "test",
        description: "a",
        output: {
          result: "result-a",
          dependencyResults: {},
        },
        dependencyResults: {},
      }
      const resultB: TaskResult = {
        type: "test",
        description: "b",
        output: {
          result: "result-b",
          dependencyResults: { a: resultA },
        },
        dependencyResults: { a: resultA },
      }
      const resultC: TaskResult = {
        type: "test",
        description: "c",
        output: {
          result: "result-c",
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
          description: "d",
          output: {
            result: "result-d",
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

      expect(results).to.eql(expected)
      expect(resultOrder).to.eql(["a", "b", "c", "d"])

      expect(callbackResults).to.eql({
        a: "result-a",
        b: "result-b",
        c: "result-c",
        d: "result-d",
      })
    })

    it("should recursively cancel a task's dependants when it throws an error", async () => {
      const ctx = await getContext()
      const graph = new TaskGraph(ctx)

      const resultOrder: string[] = []

      const callback = async (key: string) => {
        resultOrder.push(key)
      }

      const opts = { callback }

      const taskA = new TestTask("a", [], opts)
      const taskB = new TestTask("b", [taskA], { callback, throwError: true })
      const taskC = new TestTask("c", [taskB], opts)
      const taskD = new TestTask("d", [taskB, taskC], opts)

      await graph.addTask(taskA)
      await graph.addTask(taskB)
      await graph.addTask(taskC)
      await graph.addTask(taskD)

      const results = await graph.processTasks()

      const resultA: TaskResult = {
        type: "test",
        description: "a",
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

    it.skip(
      "should process a task as an inheritor of an existing, in-progress task when they have the same base key",
      async () => {
        const ctx = await getContext()
        const graph = new TaskGraph(ctx)

        let callbackResults = {}
        let resultOrder: string[] = []

        let parentTaskStarted = false
        let inheritorAdded = false

        const intervalMs = 10

        const inheritorAddedPromise = new Promise(resolve => {
          setInterval(() => {
            if (inheritorAdded) {
              resolve()
            }
          }, intervalMs)
        })

        const parentTaskStartedPromise = new Promise(resolve => {
          setInterval(() => {
            if (parentTaskStarted) {
              resolve()
            }
          }, intervalMs)
        })

        const defaultCallback = async (key: string, result: any) => {
          resultOrder.push(key)
          callbackResults[key] = result
        }

        const parentCallback = async (key: string, result: any) => {
          parentTaskStarted = true
          await inheritorAddedPromise
          resultOrder.push(key)
          callbackResults[key] = result
        }

        const dependencyA = new TestTask("dependencyA", [], { callback: defaultCallback })
        const dependencyB = new TestTask("dependencyB", [], { callback: defaultCallback })
        const parentTask = new TestTask("sharedName", [dependencyA, dependencyB], { callback: parentCallback, id: "1" })
        const dependantA = new TestTask("dependantA", [parentTask], { callback: defaultCallback })
        const dependantB = new TestTask("dependantB", [parentTask], { callback: defaultCallback })

        const inheritorTask = new TestTask(
          "sharedName", [dependencyA, dependencyB], { callback: defaultCallback, id: "2" },
        )

        await graph.addTask(dependencyA)
        await graph.addTask(dependencyB)
        await graph.addTask(parentTask)
        await graph.addTask(dependantA)
        await graph.addTask(dependantB)

        const resultsPromise = graph.processTasks()
        await parentTaskStartedPromise
        await graph.addTask(inheritorTask)
        inheritorAdded = true
        const results = await resultsPromise

        expect(resultOrder).to.eql([
          "dependencyA",
          "dependencyB",
          "sharedName.1",
          "sharedName.2",
          "dependantA",
          "dependantB",
        ])

        const resultDependencyA = {
          output: "result-dependencyA",
          dependencyResults: {},
        }

        const resultDependencyB = {
          output: "result-dependencyB",
          dependencyResults: {},
        }

        const resultSharedName = {
          output: "result-sharedName.2",
          dependencyResults: { dependencyA: resultDependencyA, dependencyB: resultDependencyB },
        }

        expect(results).to.eql({
          dependencyA: { output: "result-dependencyA", dependencyResults: {} },
          dependencyB: { output: "result-dependencyB", dependencyResults: {} },
          sharedName: {
            output: "result-sharedName.2",
            dependencyResults: { dependencyA: resultDependencyA, dependencyB: resultDependencyB },
          },
          dependantA:
          {
            result: "result-dependantA",
            dependencyResults: { sharedName: resultSharedName },
          },
          dependantB:
          {
            result: "result-dependantB",
            dependencyResults: { sharedName: resultSharedName },
          },
        })
      })
  })
})
