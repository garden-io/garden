import * as Bluebird from "bluebird"
import { GardenContext } from "./context"

class TaskDefinitionError extends Error { }
class TaskGraphError extends Error { }

interface TaskResults {
  [key: string]: any
}

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

  getKey() {
    return this.key
  }

  abstract async process(taskGraph: TaskGraph): Promise<any>
}

export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap

  private inProgress: TaskNodeMap

  constructor(private context: GardenContext, private concurrency: number = DEFAULT_CONCURRENCY) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
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

  log(msg: string) {
    this.context.log.debug("tasks", msg)
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
        return
      }

      const batch = _this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .slice(0, _this.concurrency - this.inProgress.length)

      batch.forEach(n => this.inProgress.addNode(n))

      return Bluebird.map(batch, async (node: TaskNode) => {
        const key = node.getKey()

        try {
          this.log(`Processing task ${node.getKey()}`)
          this.log(`In progress: ${this.inProgress.getNodes().map(n => n.getKey()).join(", ")}`)

          results[key] = await node.process(_this)
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

    this.log(`Completed task ${node.getKey()}`)
    this.log(`Remaining tasks: ${this.index.length}`)
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

  async process(taskGraph: TaskGraph) {
    return await this.task.process(taskGraph)
  }
}
