/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import yaml from "js-yaml"
import hasAnsi = require("has-ansi")
import { every, flatten, intersection, merge, padEnd, union, uniqWith, without } from "lodash"
import { BaseTask, TaskDefinitionError, TaskType } from "./tasks/base"

import { LogEntry, LogEntryMetadata, TaskLogStatus } from "./logger/log-entry"
import { toGardenError, GardenBaseError } from "./exceptions"
import { Garden } from "./garden"
import { dedent } from "./util/string"
import uuid from "uuid"
import { defer, relationshipClasses } from "./util/util"

class TaskGraphError extends GardenBaseError {
  type = "task-graph"
}

export interface TaskResult {
  type: TaskType
  description: string
  key: string
  name: string
  output?: any
  dependencyResults?: TaskResults
  batchId: string
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
  throwOnError?: boolean
  unlimitedConcurrency?: boolean
}

export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap
  private inProgress: TaskNodeMap

  private pendingBatches: TaskBatch[]
  private inProgressBatches: TaskBatch[]

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
  private taskDependencyCache: { [id: string]: BaseTask[] }

  private resultCache: ResultCache

  constructor(private garden: Garden, private log: LogEntry) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.pendingBatches = []
    this.inProgressBatches = []
    this.latestTasks = {}
    this.pendingKeys = new Set()
    this.taskDependencyCache = {}
    this.resultCache = new ResultCache()
    this.logEntryMap = {}
  }

  async process(tasks: BaseTask[], opts?: ProcessTasksOpts): Promise<TaskResults> {
    for (const t of tasks) {
      this.latestTasks[t.getKey()] = t
    }

    await this.populateTaskDependencyCache(tasks)
    const unlimitedConcurrency = opts ? !!opts.unlimitedConcurrency : false
    const batches = this.partition(tasks, { unlimitedConcurrency })
    this.pendingBatches.push(...batches)
    this.processGraph()

    /**
     * Since partitioned batches don't share any result keys, we can safely merge their results.
     *
     * Note that these promises will never throw errors, since all errors in async code related
     * to processing tasks are caught in processNode and stored on that task's result.error.
     */
    const results: TaskResults = merge({}, ...(await Bluebird.map(batches, (b) => b.promise)))

    if (opts && opts.throwOnError) {
      const failed = Object.entries(results).filter(([_, result]) => result && result.error)

      if (failed.length > 0) {
        throw new TaskGraphError(
          dedent`
            ${failed.length} task(s) failed:
            ${failed.map(([key, result]) => `- ${key}: ${result?.error?.toString()}`).join("\n")}
          `,
          { results }
        )
      }
    }

    return results
  }

  /**
   * Returns an array of TaskBatches, where each batch consists of tasks that share one or more dependencies (or are
   * a dependency of another task in their batch).
   *
   * Also deduplicates tasks by key + version.
   */
  partition(tasks: BaseTask[], { unlimitedConcurrency = false }): TaskBatch[] {
    const deduplicatedTasks = uniqWith(tasks, (t1, t2) => {
      return t1.getKey() === t2.getKey() && t1.version.versionString === t2.version.versionString
    })

    const tasksWithKeys = deduplicatedTasks.map((task) => {
      return { task, resultKeys: this.keysWithDependencies(task) }
    })

    const sharesDeps = (task1withKeys, task2withKeys) => {
      return intersection(task1withKeys.resultKeys, task2withKeys.resultKeys).length > 0
    }

    return relationshipClasses(tasksWithKeys, sharesDeps).map((cls) => {
      const tasksForBatch = cls.map((t) => t.task)
      const resultKeys: string[] = union(...cls.map((ts) => ts.resultKeys))
      return new TaskBatch(tasksForBatch, resultKeys, unlimitedConcurrency)
    })
  }

  /**
   * Populates this.taskDependencyCache for tasks and its dependencies, recursively.
   */
  async populateTaskDependencyCache(tasks: BaseTask[]): Promise<void> {
    await Bluebird.map(tasks, async (task) => {
      const deps = await task.getDependencies()
      this.taskDependencyCache[task.getId()] = deps
      await this.populateTaskDependencyCache(deps)
    })
  }

  /**
   * Rebuilds the dependency relationships between the TaskNodes in this.index, and updates this.roots accordingly.
   */
  private rebuild() {
    const taskNodes = this.index.getNodes()

    // this.taskDependencyCache will already have been populated at this point (happens in process).
    for (const node of taskNodes) {
      /**
       * We set the list of dependency nodes to the intersection of the set of nodes in this.index with
       * the node's task's dependencies (from configuration).
       */
      node.clear()
      const taskDeps = this.taskDependencyCache[node.getId()]
      node.setDependencies(taskNodes.filter((n) => taskDeps.find((d) => d.getKey() === n.getKey())))
    }

    const newRootNodes = taskNodes.filter((n) => n.getDependencies().length === 0)
    this.roots.clear()
    this.roots.setNodes(newRootNodes)
  }

  private addTask(batchId: string, task: BaseTask, unlimitedConcurrency: boolean) {
    this.addNodeWithDependencies(task, batchId, unlimitedConcurrency)
    this.rebuild()
    if (this.index.getNode(task)) {
      this.garden.events.emit("taskPending", {
        addedAt: new Date(),
        batchId,
        key: task.getKey(),
        name: task.getName(),
        type: task.type,
      })
    } else {
      const result = this.resultCache.get(task.getKey(), task.version.versionString)
      if (result) {
        this.garden.events.emit("taskComplete", result)
      }
    }
  }

  private getNode(task: BaseTask, batchId: string, unlimitedConcurrency: boolean): TaskNode | null {
    const id = task.getId()
    const key = task.getKey()
    const existing = this.index
      .getNodes()
      .filter((n) => n.getKey() === key && n.getId() !== id)
      .reverse()[0]

    if (existing) {
      // A task with the same key is already pending.
      return existing
    } else {
      const cachedResult = this.resultCache.get(task.getKey(), task.version.versionString)
      if (cachedResult && !task.force) {
        // No need to add task or its dependencies.
        const dependencyResults = <TaskResult[]>this.keysWithDependencies(task)
          .map((k) => this.resultCache.getNewest(k))
          .filter(Boolean)
        this.provideCachedResultToInProgressBatches(cachedResult, dependencyResults)
        return null
      } else {
        return new TaskNode(task, batchId, unlimitedConcurrency)
      }
    }
  }

  /**
   * This method implements the graph's main processing loop.
   *
   * The calls to this.processNode will result in further calls to this.processGraph, eventually resulting in all
   * requested tasks being processed.
   */
  private processGraph() {
    const concurrencyLimit = defaultTaskConcurrency

    if (this.index.length === 0 && this.inProgressBatches.length === 0 && this.pendingBatches.length > 0) {
      this.log.silly("")
      this.log.silly("TaskGraph: this.index before processing")
      this.log.silly("---------------------------------------")
      this.log.silly(yaml.safeDump(this.index.inspect(), { noRefs: true, skipInvalid: true }))

      this.garden.events.emit("taskGraphProcessing", { startedAt: new Date() })
    }

    while (this.pickDisjointPendingBatches().length > 0) {
      this.addPendingBatches()
    }

    if (this.index.length === 0 && this.pendingBatches.length === 0 && this.inProgressBatches.length === 0) {
      // done!
      this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: "info" })
      this.garden.events.emit("taskGraphComplete", { completedAt: new Date() })
      return
    }

    const pendingRoots = this.roots.getNodes().filter((n) => !this.inProgress.contains(n))
    const pendingWithUnlimitedConcurrency = pendingRoots.filter((n) => n.unlimitedConcurrency)
    const pendingWithLimitedConcurrency = pendingRoots.filter((n) => !n.unlimitedConcurrency)

    const nodesToProcess = [
      ...pendingWithUnlimitedConcurrency,
      ...pendingWithLimitedConcurrency.slice(0, concurrencyLimit - this.inProgress.length),
    ]

    nodesToProcess.forEach((n) => this.inProgress.addNode(n))

    this.rebuild()
    this.initLogging()

    for (const node of nodesToProcess) {
      this.pendingKeys.delete(node.getKey())
    }
    for (const node of nodesToProcess) {
      this.processNode(node).catch((error) => {
        this.garden.events.emit("internalError", { error, timestamp: new Date() })
        this.logInternalError(node, error)
        this.cancelDependants(node.batchId, node)
      })
    }

    this.rebuild()
  }

  private addNode(task: BaseTask, batchId: string, unlimitedConcurrency: boolean): TaskNode | null {
    const node = this.getNode(task, batchId, unlimitedConcurrency)
    if (node) {
      this.index.addNode(node)
    }
    return node
  }

  private addNodeWithDependencies(task: BaseTask, batchId: string, unlimitedConcurrency: boolean) {
    const node = this.addNode(task, batchId, unlimitedConcurrency)

    if (node) {
      const depTasks = this.taskDependencyCache[node.getId()]
      for (const dep of depTasks) {
        this.addNodeWithDependencies(dep, batchId, unlimitedConcurrency)
      }
    }
  }

  /**
   * Processes a single TaskNode to completion, handling errors and providing its result to in-progress task batches.
   */
  private async processNode(node: TaskNode) {
    let success = true
    // Errors thrown in this outer try block are caught in processGraph.
    try {
      const task = node.task
      const name = task.getName()
      const type = node.getType()
      const key = node.getKey()
      const batchId = node.batchId
      const description = node.getDescription()

      let result: TaskResult = { type, description, key: task.getKey(), name: task.getName(), batchId }

      this.logTask(node)
      this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

      const dependencyBaseKeys = this.taskDependencyCache[task.getId()].map((dep) => dep.getKey())
      const dependencyResults = this.resultCache.pick(dependencyBaseKeys)

      try {
        this.garden.events.emit("taskProcessing", {
          name,
          type,
          key,
          batchId,
          startedAt: new Date(),
          version: task.version,
        })
        result = await node.process(dependencyResults, node.batchId)
        this.garden.events.emit("taskComplete", result)
      } catch (error) {
        success = false
        result = { type, description, key, name, error, completedAt: new Date(), batchId }
        this.garden.events.emit("taskError", result)
        this.logTaskError(node, error)
        this.cancelDependants(batchId, node)
      } finally {
        this.resultCache.put(key, task.version.versionString, result)
        this.provideResultToInProgressBatches(result)
      }
    } finally {
      this.completeTask(node, success)
      this.processGraph()
    }
  }

  private completeTask(node: TaskNode, success: boolean) {
    if (node.getDependencies().length > 0) {
      throw new TaskGraphError(`Task ${node.getId()} still has unprocessed dependencies`, { node })
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

  /**
   * Recursively remove node's dependants, without removing node.
   */
  private cancelDependants(batchId: string, node: TaskNode) {
    const cancelledAt = new Date()
    for (const dependant of this.getDependants(node)) {
      this.logTaskComplete(dependant, false)
      this.garden.events.emit("taskCancelled", {
        cancelledAt,
        key: dependant.getKey(),
        name: dependant.task.getName(),
        type: dependant.getType(),
        batchId,
      })
      this.remove(dependant)
      this.cancelKeyForInProgressBatches(dependant.getKey())
    }
    this.rebuild()
  }

  private getDependants(node: TaskNode): TaskNode[] {
    const dependants = this.index
      .getNodes()
      .filter((n) => n.getDependencies().find((d) => d.getKey() === node.getKey()))
    return dependants.concat(flatten(dependants.map((d) => this.getDependants(d))))
  }

  private addPendingBatches() {
    const batches = this.pickDisjointPendingBatches()
    this.pendingBatches = without(this.pendingBatches, ...batches)
    this.inProgressBatches.push(...batches)
    for (const batch of batches) {
      /**
       * We want at most one pending (i.e. not in-progress) task for a given key at any given time,
       * so we deduplicate here.
       */
      const tasksToProcess = batch.tasks.filter((t) => !this.pendingKeys.has(t.getKey()))
      for (const task of tasksToProcess) {
        this.addTask(batch.id, this.latestTasks[task.getKey()], batch.unlimitedConcurrency)
      }
    }

    this.rebuild()
  }

  /**
   * Find any pending task batches that are disjoint with all in-progress batches, and mutually disjoint among
   * themselves (preferring to add older batches first, i.e. lower-indexed in this.pendingBatches).
   */
  private pickDisjointPendingBatches(): TaskBatch[] {
    const pickedBatches: TaskBatch[] = []

    const disjointFromAll = (batches: TaskBatch[], candidate: TaskBatch) => every(batches, (b) => b.disjoint(candidate))

    for (const pending of this.pendingBatches) {
      if (disjointFromAll(this.inProgressBatches, pending) && disjointFromAll(pickedBatches, pending)) {
        pickedBatches.push(pending)
      }
    }

    return pickedBatches
  }

  private provideResultToInProgressBatches(result: TaskResult) {
    const finished: TaskBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.taskFinished(result)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  private provideCachedResultToInProgressBatches(result: TaskResult, depResults: TaskResult[]) {
    const finished: TaskBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.taskCached(result, depResults)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  private cancelKeyForInProgressBatches(key: string) {
    const finished: TaskBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.cancelKey(key)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  /**
   * Returns the keys of task and its dependencies, recursively.
   *
   * Expects this.taskDependencyCache to have been populated for tasks and their dependencies.
   */
  private keysWithDependencies(task: BaseTask): string[] {
    const keySet = new Set<string>()

    const getKeys = (t: BaseTask, keys: Set<string>) => {
      keys.add(t.getKey())
      for (const dep of this.taskDependencyCache[t.getId()]) {
        getKeys(dep, keys)
      }
    }

    getKeys(task, keySet)
    return [...keySet]
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

  private logTaskError(node: TaskNode, err: Error) {
    const prefix = `Failed ${node.getDescription()}. Here is the output:`
    this.logError(err, prefix)
  }

  private logInternalError(node: TaskNode, err: Error) {
    const prefix = `An internal error occurred while ${node.getDescription()}. Here is the output:`
    this.logError(err, prefix)
  }

  private logError(err: Error, errMessagePrefix: string) {
    const divider = padEnd("", 80, "━")
    const error = toGardenError(err)
    const errorMessage = error.message.trim()

    const msg =
      chalk.red.bold(`\n${errMessagePrefix}\n${divider}\n`) +
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
  batchId: string
  unlimitedConcurrency: boolean

  private dependencies: TaskNodeMap

  constructor(task: BaseTask, batchId: string, unlimitedConcurrency: boolean) {
    this.task = task
    this.batchId = batchId
    this.unlimitedConcurrency = unlimitedConcurrency
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
      dependencies: this.getDependencies().map((d) => d.inspect()),
    }
  }

  async process(dependencyResults: TaskResults, batchId: string): Promise<TaskResult> {
    const output = await this.task.process(dependencyResults)

    return {
      type: this.getType(),
      key: this.getKey(),
      name: this.task.getName(),
      description: this.getDescription(),
      completedAt: new Date(),
      batchId,
      output,
      dependencyResults,
    }
  }
}

interface CachedResult {
  result: TaskResult
  versionString: string
}

class ResultCache {
  /**
   * By design, at most one TaskResult (the most recently processed) is cached for a given key.
   *
   * Invariant: No concurrent calls are made to this class' instance methods, since they
   * only happen within TaskGraph's processGraph method, which is never executed concurrently.
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
    return r && r.versionString === versionString && !r.result.error ? r.result : null
  }

  getNewest(key: string): TaskResult | null {
    const r = this.cache[key]
    return r && !r.result.error ? r.result : null
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

export class TaskBatch {
  public id: string
  public tasks: BaseTask[]
  public unlimitedConcurrency: boolean
  /**
   * The keys of tasks and their dependencies, recursively.
   *
   * We want to return results for all these keys, regardless of whether there's a cached result or an
   * already pending task for a given key.
   */
  public resultKeys: string[]
  public remainingResultKeys: Set<string>
  public results: TaskResults
  public promise: Promise<TaskResults>
  private resolver: any

  /**
   * keys should be the set union of the keys of tasks and those of their dependencies, recursively.
   */
  constructor(tasks: BaseTask[], resultKeys: string[], unlimitedConcurrency = false) {
    this.id = uuid.v4()
    this.tasks = tasks
    this.unlimitedConcurrency = unlimitedConcurrency
    this.resultKeys = resultKeys
    this.remainingResultKeys = new Set(resultKeys)
    this.results = {}
    const { promise, resolver } = defer<TaskResults>()
    this.promise = promise
    this.resolver = resolver
  }

  disjoint(otherBatch: TaskBatch): boolean {
    return intersection(this.resultKeys, otherBatch.resultKeys).length === 0
  }

  /**
   * Should be called when a task finishes processing and this batch is in progress.
   *
   * Returns true if this call finishes the batch.
   */
  taskFinished(result: TaskResult): boolean {
    const key = result.key
    if (!this.remainingResultKeys.has(key)) {
      return false
    }
    this.results[key] = result
    this.remainingResultKeys.delete(key)
    if (this.remainingResultKeys.size === 0) {
      this.resolver(this.results)
      return true
    } else {
      return false
    }
  }

  /**
   * Should be called when a task result was read from cache, and this batch is in progress.
   *
   * Returns true if this call finishes the batch.
   */
  taskCached(result: TaskResult, depResults: TaskResult[]): boolean {
    const key = result.key
    this.results[key] = result
    this.remainingResultKeys.delete(key)
    for (const depResult of depResults) {
      this.results[depResult.key] = depResult
      this.remainingResultKeys.delete(depResult.key)
    }
    if (this.remainingResultKeys.size === 0) {
      this.resolver(this.results)
      return true
    } else {
      return false
    }
  }

  /**
   * Should be called when this task, or one of its dependencies, threw an error during processing
   * and this batch is in progress.
   *
   * Returns true if this call finishes the batch.
   */
  cancelKey(key: string): boolean {
    if (!this.remainingResultKeys.has(key)) {
      return false
    }
    this.remainingResultKeys.delete(key)
    if (this.remainingResultKeys.size === 0) {
      this.resolver(this.results)
      return true
    } else {
      return false
    }
  }
}

interface LogEntryMap {
  [key: string]: LogEntry
}

const taskStyle = chalk.cyan.bold

function inProgressToStr(nodes) {
  return `Currently in progress [${nodes.map((n) => taskStyle(n.getId())).join(", ")}]`
}

function remainingTasksToStr(num) {
  const style = num === 0 ? chalk.green : chalk.yellow
  return `Remaining tasks ${style.bold(String(num))}`
}
