import * as Bluebird from "bluebird"
import { GardenContext } from "./context"

class TaskDefinitionError extends Error { }
class TaskGraphError extends Error { }

function getIndexKey(task: Task) {
  const key = task.getKey()

  if (!task.type || !key || task.type.length === 0 || key.length === 0) {
    throw new TaskDefinitionError("Tasks must define a type and a key")
  }

  return `${task.type}.${key}`
}

export abstract class Task {
  abstract type: string

  key?: string
  dependencies?: Task[]

  getKey() {
    return this.key
  }

  abstract async process(taskGraph: TaskGraph): Promise<any>
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
    await this.task.process(taskGraph)
  }
}

export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap

  private inProgress: TaskNodeMap

  constructor(private context: GardenContext) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
  }

  addTask(task: Task) {
    const node = this.getNode(task)

    for (let d of task.dependencies || []) {
      node.addDependency(this.getNode(d))
    }

    const nodeDependencies = node.getDependencies()

    if (nodeDependencies.length === 0) {
      this.roots.addNode(node)
    } else {
      for (let d of nodeDependencies) {
        this.addTask(d.task)
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
  async processTasks(concurrency = 1) {
    const results = {}
    const graph = this

    const loop = async () => {
      if (this.index.length === 0) {
        // done!
        return
      }

      const batch = this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .slice(0, concurrency - this.inProgress.length)

      batch.forEach(n => this.inProgress.addNode(n))

      return Bluebird.map(batch, async (node: TaskNode) => {
        const key = node.getKey()

        try {
          this.context.log.debug(`Processing task ${node.getKey()}`, 2, 2)
          this.context.log.debug(`In progress: ${this.inProgress.getNodes().map(n => n.getKey()).join(", ")}`, 2, 2)

          results[key] = await node.process(graph)
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

    this.context.log.debug(`Completed task ${node.getKey()}`, 2, 2)
    this.context.log.debug(`Remaining tasks: ${this.index.length}`, 2, 2)
  }
}
