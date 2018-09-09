/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { merge, padEnd, pick } from "lodash"
import { Task, TaskDefinitionError } from "./tasks/base"

import { EntryStyle, LogSymbolType } from "./logger/types"
import { LogEntry } from "./logger/logger"
import { PluginContext } from "./plugin-context"
import { toGardenError } from "./exceptions"

class TaskGraphError extends Error { }

export interface TaskResult {
  type: string
  description: string
  output?: any
  dependencyResults?: TaskResults
  error?: Error
}

/*
  When multiple tasks with the same baseKey are completed during a call to processTasks,
  the result from the last processed is used (hence only one key-value pair here per baseKey).
 */
export interface TaskResults {
  [baseKey: string]: TaskResult
}

interface LogEntryMap { [key: string]: LogEntry }

export const DEFAULT_CONCURRENCY = 4

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

  private resultCache: ResultCache
  private opQueue: OperationQueue

  constructor(private ctx: PluginContext, private concurrency: number = DEFAULT_CONCURRENCY) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.resultCache = new ResultCache()
    this.opQueue = new OperationQueue(this)
    this.logEntryMap = {}
  }

  addTask(task: Task): Promise<any> {
    return this.opQueue.request({ type: "addTask", task })
  }

  async addTaskInternal(task: Task) {
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

  processTasks(): Promise<TaskResults> {
    return this.opQueue.request({ type: "processTasks" })
  }

  /*
    Process the graph until it's complete
   */
  async processTasksInternal(): Promise<TaskResults> {

    const _this = this
    const results: TaskResults = {}

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
        const task = node.task
        const type = node.getType()
        const baseKey = node.getBaseKey()
        const description = node.getDescription()
        let result

        try {
          this.logTask(node)
          this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

          const dependencyBaseKeys = (await task.getDependencies())
            .map(dep => dep.getBaseKey())

          const dependencyResults = merge(
            this.resultCache.pick(dependencyBaseKeys),
            pick(results, dependencyBaseKeys))

          try {
            result = await node.process(dependencyResults)
          } catch (error) {
            result = { type, description, error }
            this.logTaskError(node, error)
            this.cancelDependants(node)
          } finally {
            results[baseKey] = result
            this.resultCache.put(baseKey, task.version.versionString, result)
          }
        } finally {
          this.completeTask(node, !result.error)
        }

        return loop()
      })
    }

    await loop()

    return results
  }

  private completeTask(node: TaskNode, success: boolean) {
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
    this.logTaskComplete(node, success)
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

      if (!d.force && this.resultCache.get(d.getBaseKey(), d.version.versionString)) {
        continue
      }

      const dependency = this.getPredecessor(d) || this.getNode(d)
      this.index.addNode(dependency)
      node.addDependency(dependency)

    }
  }

  private async addDependants(node: TaskNode) {
    const nodeDependencies = node.getDependencies()
    for (const d of nodeDependencies) {
      const dependant = this.getPredecessor(d.task) || d
      await this.addTaskInternal(dependant.task)
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

  // Recursively remove node's dependants, without removing node.
  private cancelDependants(node: TaskNode) {
    const remover = (n) => {
      for (const dependant of n.getDependants()) {
        this.logTaskComplete(n, false)
        remover(dependant)
      }
      this.remove(n)
    }

    for (const dependant of node.getDependants()) {
      node.removeDependant(dependant)
      remover(dependant)
    }
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

  private logTaskComplete(node: TaskNode, success: boolean) {
    const entry = this.logEntryMap[node.getKey()]
    if (entry) {
      success ? entry.setSuccess() : entry.setError()
    }
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

  private logTaskError(node: TaskNode, err) {
    const divider = padEnd("", 80, "—")
    const error = toGardenError(err)
    const msg = `\nFailed ${node.getDescription()}. Here is the output:\n${divider}\n${error.message}\n${divider}\n`
    this.ctx.log.error({ msg, error })
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

  getDescription() {
    return this.task.getDescription()
  }

  getType() {
    return this.task.type
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
    const output = await this.task.process(dependencyResults)

    return {
      type: this.getType(),
      description: this.getDescription(),
      output,
      dependencyResults,
    }
  }
}

interface CachedResult {
  result: TaskResult,
  versionString: string
}

class ResultCache {
  /*
    By design, at most one TaskResult (the most recently processed) is cached for a given baseKey.

    Invariant: No concurrent calls are made to this class' instance methods, since they
    only happen within TaskGraph's addTaskInternal and processTasksInternal methods,
    which are never executed concurrently, since they are executed sequentially by the
    operation queue.
  */
  private cache: { [key: string]: CachedResult }

  constructor() {
    this.cache = {}
  }

  put(baseKey: string, versionString: string, result: TaskResult): void {
    this.cache[baseKey] = { result, versionString }
  }

  get(baseKey: string, versionString: string): TaskResult | null {
    const r = this.cache[baseKey]
    return (r && r.versionString === versionString && !r.result.error) ? r.result : null
  }

  getNewest(baseKey: string): TaskResult | null {
    const r = this.cache[baseKey]
    return (r && !r.result.error) ? r.result : null
  }

  // Returns newest cached results, if any, for baseKeys
  pick(baseKeys: string[]): TaskResults {
    const results: TaskResults = {}

    for (const baseKey of baseKeys) {
      const cachedResult = this.getNewest(baseKey)
      if (cachedResult) {
        results[baseKey] = cachedResult
      }
    }

    return results
  }

}

// TODO: Add more typing to this class.

/*
  Used by TaskGraph to prevent race conditions e.g. when calling addTask or
  processTasks.
*/
class OperationQueue {
  queue: object[]
  draining: boolean

  constructor(private taskGraph: TaskGraph) {
    this.queue = []
    this.draining = false
  }

  request(opRequest): Promise<any> {
    let findFn

    switch (opRequest.type) {

      case "addTask":
        findFn = (o) => o.type === "addTask" && o.task.getBaseKey() === opRequest.task.getBaseKey()
        break

      case "processTasks":
        findFn = (o) => o.type === "processTasks"
        break
    }

    const existingOp = this.queue.find(findFn)

    const prom = new Promise((resolver) => {
      if (existingOp) {
        existingOp["resolvers"].push(resolver)
      } else {
        this.queue.push({ ...opRequest, resolvers: [resolver] })
      }
    })

    if (!this.draining) {
      this.process()
    }

    return prom
  }

  async process() {
    this.draining = true
    const op = this.queue.shift()

    if (!op) {
      this.draining = false
      return
    }

    switch (op["type"]) {

      case "addTask":
        const task = op["task"]
        await this.taskGraph.addTaskInternal(task)
        for (const resolver of op["resolvers"]) {
          resolver()
        }
        break

      case "processTasks":
        const results = await this.taskGraph.processTasksInternal()
        for (const resolver of op["resolvers"]) {
          resolver(results)
        }
        break
    }

    this.process()
  }

}
