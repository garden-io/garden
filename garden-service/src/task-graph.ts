/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { Mutex } from "async-mutex"
import chalk from "chalk"
import yaml from "js-yaml"
import hasAnsi = require("has-ansi")
import {
  flatten,
  merge,
  padEnd,
  pick,
  sortBy,
  without,
} from "lodash"
import { BaseTask, TaskDefinitionError, TaskType } from "./tasks/base"

import { LogEntry, LogEntryMetadata, TaskLogStatus } from "./logger/log-entry"
import { toGardenError } from "./exceptions"
import { Garden } from "./garden"
import { AnalyticsHandler } from "./analytics/analytics"
import { defer } from "./util/util"

class TaskGraphError extends Error { }

export interface TaskResult {
  type: TaskType
  description: string
  key: string
  name: string
  output?: any
  dependencyResults?: TaskResults
  completedAt?: Date
  error?: Error
}

/**
 * When multiple tasks with the same key are completed during a call to processTasks,
 * the result from the last processed is used (hence only one key-value pair here per key).
 */
export interface TaskResults {
  [key: string]: TaskResult | null
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
  private processRequests: ProcessRequest[]
  private addTasksMutex: Mutex
  private processing: boolean // flag to prevent concurrent calls to processTasks.

  private taskGraphOrd: Number

  /**
   * latestTasks[key] is the most recently requested task (via process) for that key.
   * We use this table to ensure that the last requested task version is used as
   * we deduplicate tasks by key.
   */
  private latestTasks: { [key: string]: BaseTask }
  private pendingTasks: BaseTask[]
  private logEntryMap: LogEntryMap

  /**
   * A given task instance (uniquely identified by its id) should always return the same
   * list of dependencies (by key) from its getDependencies method.
   */
  private taskDependencyCache: { [id: string]: Set<string> } // sets of keys

  private resultCache: ResultCache

  constructor(private garden: Garden, private log: LogEntry) {
    this.addTasksMutex = new Mutex()
    this.processing = false
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.processRequests = []
    this.pendingTasks = []
    this.latestTasks = {} // TODO: Describe invariant for this map's contents
    this.taskDependencyCache = {}
    this.resultCache = new ResultCache()
    this.logEntryMap = {}
  }

  async process(tasks: BaseTask[], opts?: ProcessTasksOpts): Promise<TaskResults> {
    for (const t of tasks) {
      this.latestTasks[t.getKey()] = t
    }

    // We want at most one pending (i.e. not in-progress) task for a given key at any given time,
    // so we deduplicate here.
    const keysForRequest = await keysWithDependencies(tasks)
    const tasksToAdd = tasks.filter(t => !this.pendingTasks.find(pt => pt.getKey() === t.getKey()))
    this.pendingTasks.push(...tasksToAdd)

    const processRequest = new ProcessRequest(keysForRequest)
    this.processRequests.push(processRequest)

    this.processTasks()
        .catch(err => {
          console.error(chalk.red(`Graph ${this.taskGraphOrd} Exception in processTasks: ${err.message}`))
        })

    return processRequest.requestPromise
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

  private async addTasks(tasks: BaseTask[]) {
    const release = await this.addTasksMutex.acquire()
    for (const task of tasks) {
      await this.addNodeWithDependencies(task)
      this.rebuild()
      if (this.index.getNode(task)) {
        this.garden.events.emit("taskPending", {
          addedAt: new Date(),
          key: task.getKey(),
          type: task.type,
          name: task.getName(),
          version: task.version,
        })
      } else {
        const result = this.resultCache.get(task.getKey(), task.version.versionString)
        if (result) {
          const withDeps = await withDependencies(task)
          const resultWithDeps = <TaskResult[]>withDeps
            .map(t => this.resultCache.getNewest(t.getKey()))
            .filter(Boolean)
          this.garden.events.emit("taskComplete", result)
          this.provideCachedResultToProcessRequests(result, resultWithDeps)
        }
      }
    }
    release()
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
      if (cachedResultExists) {
      }
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
  private async processTasks(): Promise<void> {
    // console.log(chalk.blue(`starting processTasks`))
    if (this.processing) {
      return
    }

    const concurrencyLimit = defaultTaskConcurrency

    this.log.silly("")
    this.log.silly("TaskGraph: this.index before processing")
    this.log.silly("---------------------------------------")
    this.log.silly(yaml.safeDump(this.index.inspect(), { noRefs: true, skipInvalid: true }))

    const results: TaskResults = {}

    this.garden.events.emit("taskGraphProcessing", { startedAt: new Date() })

    const loop = async () => {
      const availableConcurrency = concurrencyLimit - this.inProgress.length

      // We don't add tasks that have one or more dependencies in progress.
      const pendingRootCount = this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))
        .length

      // TODO: Explain logic
      if (availableConcurrency - pendingRootCount > 0) {
        const tasksToAdd = this.pendingTasks
          .splice(0, availableConcurrency - pendingRootCount)
          .map(t => this.latestTasks[t.getKey()])
        await this.addTasks(tasksToAdd)
      }

      // console.log(chalk.magenta(`loop: this.index.length ${this.index.length} this.pendingTasks.length ${this.pendingTasks.length}`))

      if (this.index.length === 0 && this.pendingTasks.length === 0) {
        // done!
        this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: "info" })
        this.processing = false
        this.garden.events.emit("taskGraphComplete", { completedAt: new Date() })
        return
      }

      const pendingRootNodes = this.roots.getNodes()
        .filter(n => !this.inProgress.contains(n))

      // We process the oldest root notes first.
      const batch = sortBy(pendingRootNodes, n => n.nodeCreatedAt)
        .slice(0, availableConcurrency)

      batch.forEach(n => this.inProgress.addNode(n))
      this.rebuild()

      this.initLogging()

      // TODO-DODDI: add async factory method for TaskGraph and init & assign this there (adapt unit tests as needed)
      // const analytics = await new AnalyticsHandler(this.garden).init()

      Bluebird.each(batch, async (node: TaskNode) => {
        const task = node.task
        const name = task.getName()
        const type = node.getType()
        const key = node.getKey()
        const description = node.getDescription()

        let result: TaskResult = { type, description, key: task.getKey(), name: task.getName() }

        try {
          this.logTask(node)
          this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

          const dependencyKeys = (await task.getDependencies())
            .map(dep => dep.getKey())

          const dependencyResults = merge(
            this.resultCache.pick(dependencyKeys),
            pick(results, dependencyKeys))

          const startedAt = new Date()

          try {
            this.garden.events.emit("taskProcessing", {
              name,
              type,
              startedAt,
              key: task.getKey(),
              version: task.version,
            })
            result = await node.process(dependencyResults)

            // TODO-DODDI: uncomment
            // Track task if user has opted-in
            // analytics.trackTask(result.key, result.type)

            this.garden.events.emit("taskComplete", result)
          } catch (error) {
            result.error = error
            result.completedAt = new Date()
            this.garden.events.emit("taskError", result)
            this.logTaskError(node, error)
            this.cancelDependants(node, startedAt)
          } finally {
            results[key] = result
            this.resultCache.put(key, task.version.versionString, result)
            this.provideResultToProcessRequests(result)
          }
        } finally {
          this.completeTask(node, !result.error)
        }

        return loop()
      })
    }
    await loop()
    // this.garden.events.emit("taskGraphComplete", { completedAt: new Date() })
    this.rebuild()
    this.processing = false
  }

  private provideResultToProcessRequests(result: TaskResult): void {
    const fulfilled: ProcessRequest[] = []
    for (const request of this.processRequests) {
      const requestFulfilled = request.taskFinished(result)
      if (requestFulfilled) {
        fulfilled.push(request)
      }
    }
    this.processRequests = without(this.processRequests, ...fulfilled)
  }

  private provideCachedResultToProcessRequests(result: TaskResult, depResults: TaskResult[]) {
    const fulfilled: ProcessRequest[] = []
    for (const request of this.processRequests) {
      const requestFulfilled = request.taskCached(result, depResults)
      if (requestFulfilled) {
        fulfilled.push(request)
      }
    }
    this.processRequests = without(this.processRequests, ...fulfilled)
  }

  private cancelKeyForProcessRequests(key: string, addedAt: Date): void {
    const fulfilled: ProcessRequest[] = []
    for (const request of this.processRequests) {
      const requestFulfilled = request.cancelKey(key, addedAt)
      if (requestFulfilled) {
        fulfilled.push(request)
      }
    }
    this.processRequests = without(this.processRequests, ...fulfilled)
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
      const incompleteDeps = node.getDependencies().map(d => d.getKey())
      throw new TaskGraphError(`Task ${node.getId()} still has unprocessed dependencies: ${incompleteDeps}`)
    }

    this.remove(node)
    this.logTaskComplete(node, success)
    this.rebuild()
  }

  private remove(node: TaskNode) {
    this.index.removeNode(node)
    this.inProgress.removeNode(node)
    // this.pendingKeys.delete(node.getKey())
  }

  // Recursively remove node's dependants, without removing node.
  private cancelDependants(node: TaskNode, startedAt: Date) {
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
      this.cancelKeyForProcessRequests(dependant.getKey(), startedAt)
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
  nodeCreatedAt: Date // Used for sorting when picking batches during processing.

  private dependencies: TaskNodeMap

  constructor(task: BaseTask) {
    this.task = task
    this.nodeCreatedAt = new Date()
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
      completedAt: new Date(),
      output,
      dependencyResults,
    }
  }
}

class ProcessRequest {

  requestedAt: Date
  remainingKeys: Set<string>
  results: TaskResults

  requestPromise: Promise<TaskResults>
  resolveRequest: any
  rejectRequest: any

  number: number

  constructor(taskKeys: string[]) {
    this.requestedAt = new Date()
    this.remainingKeys = new Set(taskKeys)
    this.results = {}
    const { promise, resolver, rejecter } = defer<TaskResults>()
    this.requestPromise = promise
    this.resolveRequest = resolver
    this.rejectRequest = rejecter
  }

  /**
   * Used for taskComplete and taskError.
   */
  taskFinished(result: TaskResult): boolean {
    const key = result.key
    if (result.completedAt! < this.requestedAt || !this.remainingKeys.has(key)) {
      return false
    }

    this.results[key] = result
    this.remainingKeys.delete(key)
    if (this.remainingKeys.size === 0) {
      this.resolveRequest(this.results)
      return true
    } else {
      return false
    }
  }

  taskCached(result: TaskResult, depResults: TaskResult[]): boolean {
    this.results[result.key] = result
    this.remainingKeys.delete(result.key)
    for (const depResult of depResults) {
      this.results[depResult.key] = depResult
      this.remainingKeys.delete(depResult.key)
    }
    if (this.remainingKeys.size === 0) {
      this.resolveRequest(this.results)
      return true
    } else {
      return false
    }
  }

  cancelKey(key: string, addedAt: Date): boolean {
    if (addedAt < this.requestedAt || !this.remainingKeys.has(key)) {
      return false
    }

    this.remainingKeys.delete(key)
    if (this.remainingKeys.size === 0) {
      this.resolveRequest(this.results)
      return true
    } else {
      return false
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

async function withDependencies(task: BaseTask): Promise<BaseTask[]> {
  const taskWithDependencies: BaseTask[] = []

  const withDeps = async (t: BaseTask, tasks: BaseTask[]) => {
    tasks.push(t)
    await Bluebird.map(await t.getDependencies(), (dep) => withDeps(dep, tasks))
  }

  await withDeps(task, taskWithDependencies)
  taskWithDependencies.splice(0)
  return taskWithDependencies
}

async function keysWithDependencies(tasks: BaseTask[]): Promise<string[]> {
  const keySet = new Set<string>()

  const getKeys = async (task: BaseTask, keys: Set<string>) => {
    keys.add(task.getKey())
    await Bluebird.map(await task.getDependencies(), (dep) => getKeys(dep, keys))
  }

  await Bluebird.map(tasks, (task) => getKeys(task, keySet))
  return [...keySet]
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