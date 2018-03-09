/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { pick } from "lodash"
import { GardenContext } from "./context"
import { Task, TaskDefinitionError } from "./types/task"

import { EntryStyle, LogSymbolType } from "./logger/types"
import { LogEntry } from "./logger"
import { PluginContext } from "./plugin-context"

class TaskGraphError extends Error { }

/*
  When multiple tasks with the same baseKey are completed during a call to processTasks,
  the result from the last processed is used (hence only one key-value pair here per baseKey).
 */
export interface TaskResults {
  [baseKey: string]: any
}

interface LogEntryMap { [key: string]: LogEntry }

const DEFAULT_CONCURRENCY = 4

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

  constructor(private ctx: PluginContext, private concurrency: number = DEFAULT_CONCURRENCY) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.logEntryMap = {}
  }

  async addTask(task: Task) {
    // TODO: Detect circular dependencies.

    const predecessor = this.getPredecessor(task)
    let node = this.getNode(task)

    if (predecessor) {
      /*
        predecessor is already in the graph, having the same baseKey as task,
        but a different key (see the getPredecessor method below).
      */
      if (this.inProgress.contains(predecessor)) {
        this.index.addNode(node)
        /*
          We transition
            [dependencies] > predecessor > [dependants]
          to
            [dependencies] > predecessor > node > [dependants]
         */
        this.inherit(predecessor, node)
        return
      } else {
        node = predecessor // No need to add a new TaskNode.
      }
    }

    this.index.addNode(node)
    await this.addDependencies(node)

    if (node.getDependencies().length === 0) {
      this.roots.addNode(node)
    } else {
      await this.addDependants(node)
    }
  }

  private getNode(task: Task): TaskNode {
    const existing = this.index.getNode(task)
    return existing || new TaskNode(task)
  }

  /*
    Process the graph until it's complete
   */
  async processTasks(): Promise<TaskResults> {
    const _this = this
    let results: TaskResults = {}

    const loop = async () => {
      if (_this.index.length === 0) {
        // done!
        this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: LogSymbolType.info })
        return
      }

      const batch = _this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .slice(0, _this.concurrency - this.inProgress.length)

      batch.forEach(n => this.inProgress.addNode(n))

      this.initLogging()

      return Bluebird.map(batch, async (node: TaskNode) => {
        const baseKey = node.getBaseKey()

        try {
          this.logTask(node)
          this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

          const dependencyBaseKeys = (await node.task.getDependencies())
            .map(task => task.getBaseKey())
          const dependencyResults = pick(results, dependencyBaseKeys)

          results[baseKey] = await node.process(dependencyResults)
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

    this.remove(node)
    this.logTaskComplete(node)
  }

  private getPredecessor(task: Task): TaskNode | null {
    const key = task.getKey()
    const baseKey = task.getBaseKey()
    const predecessors = this.index.getNodes()
      .filter(n => n.getBaseKey() === baseKey && n.getKey() !== key)
      .reverse()
    return predecessors[0] || null
  }

  private async addDependencies(node: TaskNode) {
    const task = node.task
    for (const d of await task.getDependencies()) {
      const dependency = this.getPredecessor(d) || this.getNode(d)
      this.index.addNode(dependency)
      node.addDependency(dependency)
    }
  }

  private async addDependants(node: TaskNode) {
    const nodeDependencies = node.getDependencies()
    for (const d of nodeDependencies) {
      const dependant = this.getPredecessor(d.task) || d
      await this.addTask(dependant.task)
      dependant.addDependant(node)
    }
  }

  private inherit(oldNode: TaskNode, newNode: TaskNode) {
    oldNode.getDependants().forEach(node => {
      newNode.addDependant(node)
      oldNode.removeDependant(node)
      node.removeDependency(oldNode)
      node.addDependency(newNode)
    })

    newNode.addDependency(oldNode)
    oldNode.addDependant(newNode)
  }

  // Should only be called when node is not a dependant for any task.
  private remove(node: TaskNode) {
    this.roots.removeNode(node)
    this.index.removeNode(node)
    this.inProgress.removeNode(node)
  }

  // Logging
  private logTask(node: TaskNode) {
    const entry = this.ctx.log.debug({
      section: "tasks",
      msg: `Processing task ${taskStyle(node.getKey())}`,
      entryStyle: EntryStyle.activity,
    })
    this.logEntryMap[node.getKey()] = entry
  }

  private logTaskComplete(node: TaskNode) {
    const entry = this.logEntryMap[node.getKey()]
    entry && entry.setSuccess()
    this.logEntryMap.counter.setState(remainingTasksToStr(this.index.length))
  }

  private initLogging() {
    if (!Object.keys(this.logEntryMap).length) {
      const header = this.ctx.log.debug("Processing tasks...")
      const counter = this.ctx.log.debug({
        msg: remainingTasksToStr(this.index.length),
        entryStyle: EntryStyle.activity,
      })
      const inProgress = this.ctx.log.debug(inProgressToStr(this.inProgress.getNodes()))
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

  return key
}

class TaskNodeMap {
  // Map is used here to facilitate in-order traversal.
  index: Map<string, TaskNode>
  length: number

  constructor() {
    this.index = new Map()
    this.length = 0
  }

  getNode(task: Task) {
    const indexKey = getIndexKey(task)
    const element = this.index.get(indexKey)
    return element
  }

  addNode(node: TaskNode): void {
    const indexKey = node.getKey()

    if (!this.index.get(indexKey)) {
      this.index.set(indexKey, node)
      this.length++
    }
  }

  removeNode(node: TaskNode): void {
    if (this.index.delete(node.getKey())) {
      this.length--
    }
  }

  getNodes(): TaskNode[] {
    return Array.from(this.index.values())
  }

  contains(node: TaskNode): boolean {
    return this.index.has(node.getKey())
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

  removeDependant(node: TaskNode) {
    this.dependants.removeNode(node)
  }

  getDependencies() {
    return this.dependencies.getNodes()
  }

  getDependants() {
    return this.dependants.getNodes()
  }

  getBaseKey() {
    return this.task.getBaseKey()
  }

  getKey() {
    return getIndexKey(this.task)
  }

  // For testing/debugging purposes
  inspect(): object {
    return {
      key: this.getKey(),
      dependencies: this.getDependencies().map(d => d.getKey()),
      dependants: this.getDependants().map(d => d.getKey()),
    }
  }

  async process(dependencyResults: TaskResults) {
    return await this.task.process(dependencyResults)
  }
}
