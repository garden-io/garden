/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import PQueue from "p-queue"
import chalk from "chalk"
import yaml from "js-yaml"
import hasAnsi = require("has-ansi")
import { flatten, merge, padEnd, pick } from "lodash"
import { BaseTask, TaskDefinitionError, TaskType } from "./tasks/base"

import { LogEntry, LogEntryMetadata, TaskLogStatus } from "./logger/log-entry"
import { toGardenError } from "./exceptions"
import { Garden } from "./garden"
import { AnalyticsHandler } from "./analytics/analytics"

class TaskGraphError extends Error { }

export interface TaskResult {
  type: TaskType
  description: string
  key: string
  name: string
  output?: any
  dependencyResults?: TaskResults
  error?: Error
}

/**
 * When multiple tasks with the same key are completed during a call to processTasks,
 * the result from the last processed is used (hence only one key-value pair here per key).
 */
export interface TaskResults {
  [key: string]: TaskResult
}

const DEFAULT_CONCURRENCY = 6
const concurrencyFromEnv = process.env.GARDEN_TASK_CONCURRENCY_LIMIT

export const defaultTaskConcurrency = (concurrencyFromEnv && parseInt(concurrencyFromEnv, 10)) || DEFAULT_CONCURRENCY

export interface ProcessTasksOpts {
  concurrencyLimit?: number
}

export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap
  private inProgress: TaskNodeMap

  /**
   * latestTasks[key] is the most recently requested task (via process) for that key.
   * We use this table to ensure that the last requested task version is used as
   * we deduplicate tasks by key.
   */
  private latestTasks: { [key: string]: BaseTask }
  private pendingKeys: Set<string>

  private logEntryMap: LogEntryMap

  /**
   * A given task instance (uniquely identified by its id) should always return the same
   * list of dependencies (by key) from its getDependencies method.
   */
  private taskDependencyCache: { [id: string]: Set<string> } // sets of keys

  private resultCache: ResultCache
  private opQueue: PQueue

  constructor(private garden: Garden, private log: LogEntry) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.latestTasks = {}
    this.pendingKeys = new Set()
    this.taskDependencyCache = {}
    this.resultCache = new ResultCache()
    this.opQueue = new PQueue({ concurrency: 1 })
    this.logEntryMap = {}
  }

  async process(tasks: BaseTask[], opts?: ProcessTasksOpts): Promise<TaskResults> {
    for (const t of tasks) {
      this.latestTasks[t.getKey()] = t
    }

    // We want at most one pending (i.e. not in-progress) task for a given key at any given time,
    // so we deduplicate here.
    const tasksToProcess = tasks.filter(t => !this.pendingKeys.has(t.getKey()))
    for (const t of tasksToProcess) {
      this.pendingKeys.add(t.getKey())
    }

    // Regardless of whether it was added by this call to this.processTasksInternal, we want
    // to return the latest result for each requested task.
    const resultKeys = tasks.map(t => t.getKey())

    return this.opQueue.add(() => this.processTasksInternal(tasksToProcess, resultKeys, opts))
  }

  /**
   * Rebuilds the dependency relationships between the TaskNodes in this.index, and updates this.roots accordingly.
   */
  private rebuild() {
    const taskNodes = this.index.getNodes()

    // this.taskDependencyCache will already have been populated at this point (happens in addTaskInternal).
    for (const node of taskNodes) {
      /**
       * We set the list of dependency nodes to the intersection of the set of nodes in this.index with
       * the node's task's dependencies (from configuration).
       */
      node.clear()
      const taskDeps = this.taskDependencyCache[node.getId()] || new Set()
      node.setDependencies(taskNodes.filter(n => taskDeps.has(n.getKey())))
    }

    const newRootNodes = taskNodes.filter(n => n.getDependencies().length === 0)
    this.roots.clear()
    this.roots.setNodes(newRootNodes)
  }

  private async addTask(task: BaseTask) {
    await this.addNodeWithDependencies(task)
    this.rebuild()
    if (this.index.getNode(task)) {
      this.garden.events.emit("taskPending", {
        addedAt: new Date(),
        key: task.getKey(),
        version: task.version,
      })
    } else {
      const result = this.resultCache.get(task.getKey(), task.version.versionString)
      if (result) {
        this.garden.events.emit("taskComplete", result)
      }
    }
  }

  private getNode(task: BaseTask): TaskNode | null {
    const id = task.getId()
    const key = task.getKey()
    const existing = this.index.getNodes()
      .filter(n => n.getKey() === key && n.getId() !== id)
      .reverse()[0]

    if (existing) {
      // A task with the same key is already pending.
      return existing
    } else {
      const cachedResultExists = !!this.resultCache.get(task.getKey(), task.version.versionString)
      if (cachedResultExists && !task.force) {
        // No need to add task or its dependencies.
        return null
      } else {
        return new TaskNode((task))
      }
    }
  }

  /**
   * Process the graph until it's complete.
   */
  private async processTasksInternal(
    tasks: BaseTask[], resultKeys: string[], opts?: ProcessTasksOpts,
  ): Promise<TaskResults> {
    const { concurrencyLimit = defaultTaskConcurrency } = opts || {}

    for (const task of tasks) {
      await this.addTask(this.latestTasks[task.getKey()])
    }

    this.log.silly("")
    this.log.silly("TaskGraph: this.index before processing")
    this.log.silly("---------------------------------------")
    this.log.silly(yaml.safeDump(this.index.inspect(), { noRefs: true, skipInvalid: true }))

    const _this = this
    const results: TaskResults = {}

    this.garden.events.emit("taskGraphProcessing", { startedAt: new Date() })

    const loop = async () => {
      if (_this.index.length === 0) {
        // done!
        this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: "info" })
        this.garden.events.emit("taskGraphComplete", { completedAt: new Date() })
        return
      }

      const batch = _this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .slice(0, concurrencyLimit - this.inProgress.length)

      batch.forEach(n => this.inProgress.addNode(n))
      this.rebuild()

      this.initLogging()

      const analytics = await new AnalyticsHandler(this.garden).init()

      return Bluebird.map(batch, async (node: TaskNode) => {
        const task = node.task
        const type = node.getType()
        const key = node.getKey()
        const description = node.getDescription()

        let result: TaskResult = { type, description, key: task.getKey(), name: task.getName() }

        try {
          this.logTask(node)
          this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

          const dependencyBaseKeys = (await task.getDependencies())
            .map(dep => dep.getKey())

          const dependencyResults = merge(
            this.resultCache.pick(dependencyBaseKeys),
            pick(results, dependencyBaseKeys))

          try {
            this.pendingKeys.delete(task.getKey())
            this.garden.events.emit("taskProcessing", {
              startedAt: new Date(),
              key: task.getKey(),
              version: task.version,
            })
            result = await node.process(dependencyResults)

            // Track task if user has opted-in
            analytics.trackTask(result.key, result.type)

            this.garden.events.emit("taskComplete", result)
          } catch (error) {
            result.error = error
            this.garden.events.emit("taskError", result)
            this.logTaskError(node, error)
            this.cancelDependants(node)
          } finally {
            results[key] = result
            this.resultCache.put(key, task.version.versionString, result)
          }
        } finally {
          this.completeTask(node, !result.error)
        }

        return loop()
      })
    }

    await loop()

    this.rebuild()

    for (const resultKey of resultKeys) {
      if (!results[resultKey]) {
        // We know there's a cached result for resultKey, since each key in resultKeys
        // corresponds to a task that was processed during this run of processTasks, or
        // during a previous run of processTasks. See the process method above for details.
        results[resultKey] = this.resultCache.getNewest(resultKey)!
      }
    }

    return results
  }

  private addNode(task: BaseTask): TaskNode | null {
    const node = this.getNode(task)
    if (node) {
      this.index.addNode(node)
    }
    return node
  }

  private async addNodeWithDependencies(task: BaseTask) {
    const node = this.addNode(task)

    if (node) {
      const depTasks = await node.task.getDependencies()
      this.taskDependencyCache[node.getId()] = new Set(depTasks.map(d => d.getKey()))
      for (const dep of depTasks) {
        await this.addNodeWithDependencies(dep)
      }
    }
  }

  private completeTask(node: TaskNode, success: boolean) {
    if (node.getDependencies().length > 0) {
      throw new TaskGraphError(`Task ${node.getId()} still has unprocessed dependencies`)
    }

    this.remove(node)
    this.logTaskComplete(node, success)
    this.rebuild()
  }

  private remove(node: TaskNode) {
    this.index.removeNode(node)
    this.inProgress.removeNode(node)
    this.pendingKeys.delete(node.getKey())
  }

  // Recursively remove node's dependants, without removing node.
  private cancelDependants(node: TaskNode) {
    const cancelledAt = new Date()
    for (const dependant of this.getDependants(node)) {
      this.logTaskComplete(dependant, false)
      this.garden.events.emit("taskCancelled", {
        cancelledAt,
        key: dependant.getKey(),
        name: dependant.task.getName(),
        type: dependant.getType(),
      })
      this.remove(dependant)
    }
    this.rebuild()
  }

  private getDependants(node: TaskNode): TaskNode[] {
    const dependants = this.index.getNodes().filter(n => n.getDependencies()
      .find(d => d.getKey() === node.getKey()))
    return dependants.concat(flatten(dependants.map(d => this.getDependants(d))))
  }

  // Logging
  private logTask(node: TaskNode) {
    const entry = this.log.debug({
      section: "tasks",
      msg: `Processing task ${taskStyle(node.getId())}`,
      status: "active",
      metadata: metadataForLog(node.task, "active"),
    })
    this.logEntryMap[node.getId()] = entry
  }

  private logTaskComplete(node: TaskNode, success: boolean) {
    const entry = this.logEntryMap[node.getId()]
    if (entry) {
      const idStr = taskStyle(node.getId())
      if (success) {
        const durationSecs = entry.getDuration(3)
        const metadata = metadataForLog(node.task, "success")
        metadata.task!.durationMs = durationSecs * 1000
        entry.setSuccess({ msg: `Completed task ${idStr} (took ${durationSecs} sec)`, metadata })
      } else {
        const metadata = metadataForLog(node.task, "error")
        entry.setError({ msg: `Failed task ${idStr}`, metadata })
      }
    }
    this.logEntryMap.counter.setState(remainingTasksToStr(this.index.length))
  }

  private initLogging() {
    if (!Object.keys(this.logEntryMap).length) {
      const header = this.log.debug("Processing tasks...")
      const counter = this.log.debug({
        msg: remainingTasksToStr(this.index.length),
        status: "active",
      })
      const inProgress = this.log.debug(inProgressToStr(this.inProgress.getNodes()))
      this.logEntryMap = {
        ...this.logEntryMap,
        header,
        counter,
        inProgress,
      }
    }
  }

  private logTaskError(node: TaskNode, err) {
    const divider = padEnd("", 80, "━")
    const error = toGardenError(err)
    const errorMessage = error.message.trim()

    const msg =
      chalk.red.bold(`\nFailed ${node.getDescription()}. Here is the output:\n${divider}\n`) +
      (hasAnsi(errorMessage) ? errorMessage : chalk.red(errorMessage)) +
      chalk.red.bold(`\n${divider}\n`)

    this.log.error({ msg, error })
  }
}

function getIndexId(task: BaseTask) {
  const id = task.getId()

  if (!task.type || !id || task.type.length === 0 || id.length === 0) {
    throw new TaskDefinitionError("Tasks must define a type and an id")
  }

  return id
}

function metadataForLog(task: BaseTask, status: TaskLogStatus): LogEntryMetadata {
  return {
    task: {
      type: task.type,
      key: task.getKey(),
      status,
      uid: task.uid,
      versionString: task.version.versionString,
    },
  }
}

class TaskNodeMap {
  // Map is used here to facilitate in-order traversal.
  index: Map<string, TaskNode>
  length: number

  constructor() {
    this.index = new Map()
    this.length = 0
  }

  getNode(task: BaseTask) {
    const taskId = getIndexId(task)
    const element = this.index.get(taskId)
    return element
  }

  addNode(node: TaskNode): void {
    const taskId = node.getId()

    if (!this.index.get(taskId)) {
      this.index.set(taskId, node)
      this.length++
    }
  }

  removeNode(node: TaskNode): void {
    if (this.index.delete(node.getId())) {
      this.length--
    }
  }

  setNodes(nodes: TaskNode[]): void {
    for (const node of nodes) {
      this.addNode(node)
    }
  }

  getNodes(): TaskNode[] {
    return Array.from(this.index.values())
  }

  contains(node: TaskNode): boolean {
    return this.index.has(node.getId())
  }

  clear() {
    this.index.clear()
    this.length = 0
  }

  // For testing/debugging purposes
  inspect(): object {
    const out = {}
    this.index.forEach((node, id) => {
      out[id] = node.inspect()
    })
    return out
  }

}

class TaskNode {
  task: BaseTask

  private dependencies: TaskNodeMap

  constructor(task: BaseTask) {
    this.task = task
    this.dependencies = new TaskNodeMap()
  }

  clear() {
    this.dependencies.clear()
  }

  setDependencies(nodes: TaskNode[]) {
    for (const node of nodes) {
      this.dependencies.addNode(node)
    }
  }
  getDependencies() {
    return this.dependencies.getNodes()
  }

  getKey() {
    return this.task.getKey()
  }

  getId() {
    return getIndexId(this.task)
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
      id: this.getId(),
      dependencies: this.getDependencies().map(d => d.inspect()),
    }
  }

  async process(dependencyResults: TaskResults): Promise<TaskResult> {
    const output = await this.task.process(dependencyResults)

    return {
      type: this.getType(),
      key: this.getKey(),
      name: this.task.getName(),
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
  /**
   * By design, at most one TaskResult (the most recently processed) is cached for a given key.
   *
   * Invariant: No concurrent calls are made to this class' instance methods, since they
   * only happen within TaskGraph's addTaskInternal and processTasksInternal methods,
   * which are never executed concurrently, since they are executed sequentially by the
   * operation queue.
   */
  private cache: { [key: string]: CachedResult }

  constructor() {
    this.cache = {}
  }

  put(key: string, versionString: string, result: TaskResult): void {
    this.cache[key] = { result, versionString }
  }

  get(key: string, versionString: string): TaskResult | null {
    const r = this.cache[key]
    return (r && r.versionString === versionString && !r.result.error) ? r.result : null
  }

  getNewest(key: string): TaskResult | null {
    const r = this.cache[key]
    return (r && !r.result.error) ? r.result : null
  }

  // Returns newest cached results, if any, for keys
  pick(keys: string[]): TaskResults {
    const results: TaskResults = {}

    for (const key of keys) {
      const cachedResult = this.getNewest(key)
      if (cachedResult) {
        results[key] = cachedResult
      }
    }

    return results
  }

}

interface LogEntryMap { [key: string]: LogEntry }

const taskStyle = chalk.cyan.bold

function inProgressToStr(nodes) {
  return `Currently in progress [${nodes.map(n => taskStyle(n.getId())).join(", ")}]`
}

function remainingTasksToStr(num) {
  const style = num === 0 ? chalk.green : chalk.yellow
  return `Remaining tasks ${style.bold(String(num))}`
}
