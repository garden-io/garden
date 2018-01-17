import { join } from "path"
import { expect } from "chai"
import { Task, TaskGraph, TaskResults } from "../../src/task-graph"
import { GardenContext } from "../../src/context"

describe("task-graph", () => {
  class TestTask extends Task {
    type = "test"
    key: string

    constructor(key: string, dependencies?: Task[], private callback?: (key: string, result: any) => void) {
      super()
      this.key = key

      if (dependencies) {
        this.dependencies = dependencies
      }
    }

    async process(dependencyResults: TaskResults) {
      const result = { result: "result-" + this.key, dependencyResults }

      if (this.callback) {
        this.callback(this.key, result)
      }

      return result
    }
  }

  describe("TaskGraph", () => {
    const ctx = new GardenContext(join(__dirname, "..", "..", "examples", "hello-world"))

    it("should successfully process a single task without dependencies", async () => {
      const graph = new TaskGraph(ctx)
      const task = new TestTask("a")

      await graph.addTask(task)
      const results = await graph.processTasks()

      expect(results).to.eql({
        "test.a": { result: "result-a", dependencyResults: {} },
      })
    })

    it("should process multiple tasks in dependency order", async () => {
      const graph = new TaskGraph(ctx)

      const callbackResults = {}
      const resultOrder: string[] = []

      const callback = (key: string, result: any) => {
        resultOrder.push(key)
        callbackResults["test." + key] = result
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

      const resultA = {result: "result-a", dependencyResults: {}}
      const resultB = {
        result: "result-b",
        dependencyResults: { "test.a": resultA },
      }
      const resultC = {
        result: "result-c",
        dependencyResults: { "test.b": resultB },
      }

      expect(results).to.eql(callbackResults)
      expect(results).to.eql({
        "test.a": resultA,
        "test.b": {
          result: "result-b",
          dependencyResults: { "test.a": resultA },
        },
        "test.c": {
          result: "result-c",
          dependencyResults: { "test.b": resultB },
        },
        "test.d": {
          result: "result-d",
          dependencyResults: {
            "test.b": resultB,
            "test.c": resultC,
          },
        },
      })
      expect(resultOrder).to.eql(["a", "b", "c", "d"])
    })
  })
})
