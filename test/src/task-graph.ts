import { join } from "path"
import { expect } from "chai"
import { Garden } from "../../src/garden"
import { Task } from "../../src/types/task"
import { TaskGraph, TaskResults } from "../../src/task-graph"

const projectRoot = join(__dirname, "..", "data", "test-project-empty")

describe("task-graph", () => {
  class TestTask extends Task {
    type = "test"
    name: string
    id: string

    constructor(
      name: string,
      dependencies?: Task[],
      private callback?: (name: string, result: any) => Promise<void>,
      id: string = "",
    ){
      super()
      this.name = name
      this.id = id

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

    async process(dependencyResults: TaskResults) {
      const result = { result: "result-" + this.getKey(), dependencyResults }

      if (this.callback) {
        await this.callback(this.getKey(), result)
      }

      return result
    }
  }

  describe("TaskGraph", () => {
    async function getContext() {
      const garden = await Garden.factory(projectRoot)
      return garden.pluginContext
    }

    it("should successfully process a single task without dependencies", async () => {
      const ctx = await getContext()
      const graph = new TaskGraph(ctx)
      const task = new TestTask("a")

      await graph.addTask(task)
      const results = await graph.processTasks()

      expect(results).to.eql({
        a: { result: "result-a", dependencyResults: {} },
      })
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

      const taskA = new TestTask("a", [], callback)
      const taskB = new TestTask("b", [taskA], callback)
      const taskC = new TestTask("c", [taskB], callback)
      const taskD = new TestTask("d", [taskB, taskC], callback)

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

      const resultA = { result: "result-a", dependencyResults: {} }
      const resultB = {
        result: "result-b",
        dependencyResults: { a: resultA },
      }
      const resultC = {
        result: "result-c",
        dependencyResults: { b: resultB },
      }

      expect(results).to.eql(callbackResults)
      expect(results).to.eql({
        a: resultA,
        b: {
          result: "result-b",
          dependencyResults: { a: resultA },
        },
        c: {
          result: "result-c",
          dependencyResults: { b: resultB },
        },
        d: {
          result: "result-d",
          dependencyResults: {
            b: resultB,
            c: resultC,
          },
        },
      })
      expect(resultOrder).to.eql(["a", "b", "c", "d"])
    })

    it(
      "should process a task as an inheritor of an existing, in-progress task when they have the same base key",
      async () =>
    {
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

      const dependencyA = new TestTask("dependencyA", [], defaultCallback)
      const dependencyB = new TestTask("dependencyB", [], defaultCallback)
      const parentTask  = new TestTask("sharedName", [dependencyA, dependencyB], parentCallback, "1")
      const dependantA  = new TestTask("dependantA", [parentTask], defaultCallback)
      const dependantB  = new TestTask("dependantB", [parentTask], defaultCallback)

      const inheritorTask = new TestTask("sharedName", [dependencyA, dependencyB], defaultCallback, "2")

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
        result: "result-dependencyA",
        dependencyResults: {},
      }

      const resultDependencyB = {
        result: "result-dependencyB",
        dependencyResults: {},
      }

      const resultSharedName = {
        result: "result-sharedName.2",
        dependencyResults: {dependencyA: resultDependencyA, dependencyB: resultDependencyB},
      }

      expect(results).to.eql({
        dependencyA: { result: "result-dependencyA", dependencyResults: {} },
        dependencyB: { result: "result-dependencyB", dependencyResults: {} },
        sharedName: { result: "result-sharedName.2",
          dependencyResults: { dependencyA: resultDependencyA, dependencyB: resultDependencyB } },
        dependantA:
        { result: "result-dependantA",
          dependencyResults: { sharedName: resultSharedName } },
        dependantB:
        { result: "result-dependantB",
          dependencyResults: { sharedName: resultSharedName } },
      })
    })
  })
})
