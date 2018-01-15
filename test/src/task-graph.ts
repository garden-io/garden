import { join } from "path"
import { expect } from "chai"
import { Task, TaskGraph } from "../../src/task-graph"
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

    async process() {
      const result = "result-" + this.key

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

      graph.addTask(task)
      const results = await graph.processTasks()

      expect(results).to.eql({
        "test.a": "result-a",
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
      graph.addTask(taskC)
      graph.addTask(taskD)
      graph.addTask(taskA)
      graph.addTask(taskD)
      graph.addTask(taskB)
      graph.addTask(taskB)
      graph.addTask(taskD)
      graph.addTask(taskA)
      graph.addTask(taskB)

      const results = await graph.processTasks()

      expect(results).to.eql(callbackResults)
      expect(results).to.eql({
        "test.a": "result-a",
        "test.b": "result-b",
        "test.c": "result-c",
        "test.d": "result-d",
      })
      expect(resultOrder).to.eql(["a", "b", "c", "d"])
    })
  })
})
