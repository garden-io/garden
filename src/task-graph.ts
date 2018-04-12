/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { Garden } from "./garden"
import { pick } from "lodash"

import { EntryStyle, LogSymbolType } from "./logger/types"
import { LogEntry } from "./logger"

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

  constructor(private ctx: Garden, private concurrency: number = DEFAULT_CONCURRENCY) {
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
        this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: LogSymbolType.info })
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
          this.logTask(node)
          this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

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
