import * as Bluebird from "bluebird"
import chalk from "chalk"
import { GardenContext } from "./context"
import { pick } from "lodash"

import { LogEntry, EntryStyles } from "./log"

class TaskDefinitionError extends Error { }
class TaskGraphError extends Error { }

export interface TaskResults {
  [key: string]: any
}

interface LogEntryMap { [key: string]: LogEntry }

const DEFAULT_CONCURRENCY = 4

export abstract class Task {
  abstract type: string

  key?: string
  dependencies: Task[]

  constructor() {
    this.dependencies = []
  }

  async getDependencies(): Promise<Task[]> {
    return this.dependencies
  }

  getKey(): string {
    if (!this.key) {
      throw new TaskDefinitionError("Missing key")
    }

    return this.key
  }

  abstract async process(dependencyResults: TaskResults): Promise<any>
}

const taskStyle = chalk.cyan.bold

function inProgressToStr(nodes) {
  return `Currently in progress [${nodes.map(n => taskStyle(n.getKey())).join(", ")}]`
}

function remainingTasksToStr(num) {
  const style = num === 0 ? chalk.green : chalk.yellow
  return `Remaining tasks ${style.bold(String(num))}`
}

export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap

  private inProgress: TaskNodeMap
  private logEntryMap: LogEntryMap

  constructor(private context: GardenContext, private concurrency: number = DEFAULT_CONCURRENCY) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.logEntryMap = {}
  }

  async addTask(task: Task) {
    // TODO: Detect circular dependencies.
    const node = this.getNode(task)

    for (const d of await task.getDependencies()) {
      node.addDependency(this.getNode(d))
    }

    const nodeDependencies = node.getDependencies()

    if (nodeDependencies.length === 0) {
      this.roots.addNode(node)
    } else {
      for (const d of nodeDependencies) {
        await this.addTask(d.task)
        d.addDependant(node)
      }
    }
  }

  private getNode(task: Task): TaskNode {
    const existing = this.index.getNode(task)

    if (existing) {
      return existing
    } else {
      const node = new TaskNode(task)
      this.index.addNode(node)
      return node
    }
  }

  /*
    Process the graph until it's complete
   */
  async processTasks(): Promise<TaskResults> {
    const results = {}
    const _this = this

    const loop = async () => {
      if (_this.index.length === 0) {
        // done!
        this.logEntryMap.counter.done()
        return
      }

      const batch = _this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .slice(0, _this.concurrency - this.inProgress.length)

      batch.forEach(n => this.inProgress.addNode(n))

      this.initLogging()

      return Bluebird.map(batch, async (node: TaskNode) => {
        const key = node.getKey()

        try {
          this.logTask(node, `Processing task ${taskStyle(node.getKey())}`)
          this.logEntryMap.inProgress.update({
            msg: inProgressToStr(this.inProgress.getNodes()),
            replace: true,
          })

          const dependencyKeys = (await node.task.getDependencies()).map(d => getIndexKey(d))
          const dependencyResults = pick(results, dependencyKeys)

          results[key] = await node.process(dependencyResults)
        } finally {
          this.completeTask(node)
        }

        return loop()
      })
    }

    await loop()

    return results
  }

  private completeTask(node: TaskNode) {
    if (node.getDependencies().length > 0) {
      throw new TaskGraphError(`Task ${node.getKey()} still has unprocessed dependencies`)
    }

    for (let d of node.getDependants()) {
      d.removeDependency(node)

      if (d.getDependencies().length === 0) {
        this.roots.addNode(d)
      }
    }

    this.roots.removeNode(node)
    this.index.removeNode(node)
    this.inProgress.removeNode(node)

    this.logTaskComplete(node)
  }

  // Logging
  logTask(node: TaskNode, msg: string) {
    const entry = this.context.log.debug({
      section: "tasks",
      msg,
      entryStyle: EntryStyles.activity,
    })
    this.logEntryMap[node.getKey()] = entry
  }

  logTaskComplete(node: TaskNode, msg: string = "") {
    const entry = this.logEntryMap[node.getKey()]
    entry && entry.success({ msg })
    this.logEntryMap.counter.update({
      msg: remainingTasksToStr(this.index.length),
      replace: true,
    })
  }

  initLogging() {
    if (!Object.keys(this.logEntryMap).length) {
      const header = this.context.log.debug({ msg: "Processing tasks..." })
      const counter = this.context.log.debug({
        msg: remainingTasksToStr(this.index.length),
        entryStyle: EntryStyles.activity,
      })
      const inProgress = this.context.log.debug({
        msg: inProgressToStr(this.inProgress.getNodes()),
      })
      this.logEntryMap = {
        ...this.logEntryMap,
        header,
        counter,
        inProgress,
      }
    }
  }

}

function getIndexKey(task: Task) {
  const key = task.getKey()

  if (!task.type || !key || task.type.length === 0 || key.length === 0) {
    throw new TaskDefinitionError("Tasks must define a type and a key")
  }

  return `${task.type}.${key}`
}

class TaskNodeMap {
  index: { [key: string]: TaskNode }
  length: number

  constructor() {
    this.index = {}
    this.length = 0
  }

  getNode(task: Task) {
    const indexKey = getIndexKey(task)
    return this.index[indexKey]
  }

  addNode(node: TaskNode) {
    const indexKey = getIndexKey(node.task)

    if (!this.index[indexKey]) {
      this.index[indexKey] = node
      this.length++
    }
  }

  removeNode(node: TaskNode) {
    const indexKey = getIndexKey(node.task)

    if (this.index[indexKey]) {
      delete this.index[indexKey]
      this.length--
    }
  }

  getNodes() {
    return Object.keys(this.index).map(k => this.index[k])
  }

  contains(node: TaskNode) {
    return this.index.hasOwnProperty(node.getKey())
  }
}

class TaskNode {
  task: Task

  private dependencies: TaskNodeMap
  private dependants: TaskNodeMap

  constructor(task: Task) {
    this.task = task
    this.dependencies = new TaskNodeMap()
    this.dependants = new TaskNodeMap()
  }

  addDependency(node: TaskNode) {
    this.dependencies.addNode(node)
  }

  addDependant(node: TaskNode) {
    this.dependants.addNode(node)
  }

  removeDependency(node: TaskNode) {
    this.dependencies.removeNode(node)
  }

  getDependencies() {
    return this.dependencies.getNodes()
  }

  getDependants() {
    return this.dependants.getNodes()
  }

  getKey() {
    return getIndexKey(this.task)
  }

  async process(dependencyResults: TaskResults) {
    return await this.task.process(dependencyResults)
  }
}
