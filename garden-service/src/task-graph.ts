/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { every, flatten, intersection, merge, union, uniqWith, without } from "lodash"
import { BaseTask, TaskDefinitionError, TaskType } from "./tasks/base"

import { LogEntry, LogEntryMetadata, TaskLogStatus } from "./logger/log-entry"
import { toGardenError, GardenBaseError } from "./exceptions"
import { Garden } from "./garden"
import { dedent } from "./util/string"
import { defer, relationshipClasses, uuidv4, safeDumpYaml } from "./util/util"
import { renderError } from "./logger/renderers"
import { cyclesToString } from "./util/validate-dependencies"
import { Profile } from "./util/profiling"
import { renderMessageWithDivider } from "./logger/util"

class TaskGraphError extends GardenBaseError {
  type = "task-graph"
}

class CircularDependenciesError extends GardenBaseError {
  type = "circular-dependencies"
}

export interface GraphResult {
  type: TaskType
  description: string
  key: string
  name: string
  output?: any
  dependencyResults?: GraphResults
  batchId: string
  startedAt?: Date
  completedAt?: Date
  error?: Error
  version: string
}

/**
 * When multiple tasks with the same key are completed during a call to processTasks,
 * the result from the last processed is used (hence only one key-value pair here per key).
 */
export interface GraphResults {
  [key: string]: GraphResult | null
}

const DEFAULT_CONCURRENCY = 6
const concurrencyFromEnv = process.env.GARDEN_TASK_CONCURRENCY_LIMIT

export const defaultTaskConcurrency = (concurrencyFromEnv && parseInt(concurrencyFromEnv, 10)) || DEFAULT_CONCURRENCY

export interface ProcessTasksOpts {
  throwOnError?: boolean
  unlimitedConcurrency?: boolean
}

@Profile()
export class TaskGraph {
  private roots: TaskNodeMap
  private index: TaskNodeMap
  private inProgress: TaskNodeMap

  private pendingBatches: TaskNodeBatch[]
  private inProgressBatches: TaskNodeBatch[]

  /**
   * latestNodes[key] is the node for the most recently requested task (via process) for that key.
   * We use this map to ensure that the last requested task version is used as we deduplicate
   * tasks nodes by key.
   */
  private latestNodes: { [key: string]: TaskNode }
  private logEntryMap: LogEntryMap
  private resultCache: ResultCache

  constructor(private garden: Garden, private log: LogEntry) {
    this.roots = new TaskNodeMap()
    this.index = new TaskNodeMap()
    this.inProgress = new TaskNodeMap()
    this.pendingBatches = []
    this.inProgressBatches = []
    this.latestNodes = {}
    this.resultCache = new ResultCache()
    this.logEntryMap = {}
  }

  async process(tasks: BaseTask[], opts?: ProcessTasksOpts): Promise<GraphResults> {
    const unlimitedConcurrency = opts ? !!opts.unlimitedConcurrency : false

    let nodes: TaskNode[]
    try {
      nodes = await this.nodesWithDependencies({ tasks, unlimitedConcurrency, dependencyCache: {}, stack: [] })
    } catch (circularDepsErr) {
      throw circularDepsErr
    }

    const batches = this.partition(nodes, { unlimitedConcurrency })
    for (const batch of batches) {
      for (const node of batch.nodes) {
        this.latestNodes[node.key] = node
      }
    }

    this.pendingBatches.push(...batches)
    this.processGraph()

    /**
     * Since partitioned batches don't share any result keys, we can safely merge their results.
     *
     * Note that these promises will never throw errors, since all errors in async code related
     * to processing tasks are caught in processNode and stored on that task's result.error.
     */
    const results: GraphResults = merge({}, ...(await Bluebird.map(batches, (b) => b.promise)))

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

  private async nodesWithDependencies({
    tasks,
    unlimitedConcurrency,
    dependencyCache,
    stack,
  }: {
    tasks: BaseTask[]
    unlimitedConcurrency: boolean
    dependencyCache: { [key: string]: BaseTask[] }
    stack: string[]
  }): Promise<TaskNode[]> {
    return Bluebird.map(tasks, async (task) => {
      const key = task.getKey()

      // Detect circular dependencies
      const previousOccurrence = stack.indexOf(key)
      if (previousOccurrence !== -1) {
        const cycle = stack.slice(previousOccurrence)
        const description = cyclesToString([cycle])
        const msg = `Circular task dependencies detected:\n\n${description}\n`
        throw new CircularDependenciesError(msg, { description, cycle })
      }

      let depTasks = dependencyCache[key]

      if (!depTasks) {
        dependencyCache[key] = depTasks = await task.resolveDependencies()
      }

      const depNodes = await this.nodesWithDependencies({
        tasks: depTasks,
        unlimitedConcurrency,
        dependencyCache,
        stack: [...stack, key],
      })
      return new TaskNode(task, depNodes, unlimitedConcurrency)
    })
  }

  /**
   * Returns an array of TaskNodeBatches, where each batch consists of nodes that share one or more dependencies (or are
   * a dependency of another node in their batch).
   *
   * Also deduplicates nodes by node key + version.
   */
  partition(nodes: TaskNode[], { unlimitedConcurrency = false }): TaskNodeBatch[] {
    const deduplicatedNodes = uniqWith(nodes, (n1, n2) => {
      return n1.key === n2.key && n1.getVersion() === n2.getVersion()
    })

    const nodesWithKeys = deduplicatedNodes.map((node) => {
      return { node, resultKeys: this.keysWithDependencies(node) }
    })

    const sharesDeps = (node1withKeys, node2withKeys) => {
      return intersection(node1withKeys.resultKeys, node2withKeys.resultKeys).length > 0
    }

    return relationshipClasses(nodesWithKeys, sharesDeps).map((cls) => {
      const nodesForBatch = cls.map((n) => n.node)
      const resultKeys: string[] = union(...cls.map((ts) => ts.resultKeys))
      return new TaskNodeBatch(nodesForBatch, resultKeys, unlimitedConcurrency)
    })
  }

  clearCache() {
    this.resultCache = new ResultCache()
  }

  /**
   * Rebuilds the dependency relationships between the TaskNodes in this.index, and updates this.roots accordingly.
   */
  private rebuild() {
    const taskNodes = this.index.getNodes()

    for (const node of taskNodes) {
      /**
       * We set the list of dependency nodes to the intersection of the set of nodes in this.index with
       * the node's task's dependencies (from configuration).
       */
      node.clearRemainingDependencies()
      const deps = node.getDependencies()
      node.setRemainingDependencies(taskNodes.filter((n) => deps.find((d) => d.key === n.key)))
    }

    const newRootNodes = taskNodes.filter((n) => n.getRemainingDependencies().length === 0)
    this.roots.clear()
    this.roots.setNodes(newRootNodes)
  }

  private addNode(node: TaskNode) {
    this.addNodeWithDependencies(node)
    this.rebuild()
    if (this.index.contains(node)) {
      const task = node.task
      this.garden.events.emit("taskPending", {
        addedAt: new Date(),
        batchId: node.batchId,
        key: node.key,
        name: task.getName(),
        type: task.type,
      })
    } else {
      const result = this.resultCache.get(node.key, node.getVersion())
      if (result) {
        this.garden.events.emit(result.error ? "taskError" : "taskComplete", result)
      }
    }
  }

  private addNodeWithDependencies(node: TaskNode) {
    const nodeToAdd = this.getNodeToAdd(node)
    if (nodeToAdd) {
      this.index.addNode(nodeToAdd)
      for (const depNode of nodeToAdd.getDependencies()) {
        this.addNodeWithDependencies(depNode)
      }
    }
  }

  private getNodeToAdd(node: TaskNode): TaskNode | null {
    const id = node.id
    const key = node.key
    const task = node.task

    // If found, a node with the same key is already pending/in the index, so no node needs to be added.
    const existing = this.index
      .getNodes()
      .filter((n) => n.key === key && n.id !== id)
      .reverse()[0]

    if (existing) {
      return null
    }

    const cachedResult = this.resultCache.get(node.key, node.getVersion())
    if (cachedResult && !task.force) {
      if (cachedResult.error || this.hasFailedDependencyInCache(node)) {
        this.cancelDependants(node)
        for (const keyToCancel of this.keysWithDependencies(node)) {
          this.cancelKeyForInProgressBatches(keyToCancel)
        }
        return null
      }
      // No need to add task or its dependencies.
      const dependencyResults = <GraphResult[]>this.keysWithDependencies(node)
        .map((k) => this.resultCache.getNewest(k))
        .filter(Boolean)
      this.provideCachedResultToInProgressBatches(cachedResult, dependencyResults)
      return null
    } else {
      return node
    }
  }

  /**
   * Returns true if one or more of node's dependencies has a cached result (and that dependency's task has
   * force = false).
   *
   * Returns false otherwise.
   */
  private hasFailedDependencyInCache(node: TaskNode): boolean {
    for (const dep of node.getDependencies()) {
      const cachedResult = this.resultCache.get(dep.key, dep.getVersion())
      if (!dep.task.force && cachedResult && cachedResult.error) {
        return true
      }
    }
    return false
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
      this.log.silly(safeDumpYaml(this.index.inspect(), { noRefs: true }))

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
      this.processNode(node).catch((error) => {
        this.garden.events.emit("internalError", { error, timestamp: new Date() })
        this.logInternalError(node, error)
        this.cancelDependants(node)
      })
    }

    this.rebuild()
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
      const key = node.key
      const batchId = node.batchId
      const description = node.getDescription()
      const version = node.getVersion()

      let result: GraphResult = { type, description, key: task.getKey(), name: task.getName(), batchId, version }

      this.logTask(node)
      this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()))

      const dependencyBaseKeys = node.getDependencies().map((dep) => dep.key)
      const dependencyResults = this.resultCache.pick(dependencyBaseKeys)
      const startedAt = new Date()

      try {
        this.garden.events.emit("taskProcessing", {
          name,
          type,
          key,
          batchId,
          startedAt: new Date(),
          version: task.version,
        })
        result = await node.process(dependencyResults)
        result.startedAt = startedAt
        this.garden.events.emit("taskComplete", result)
      } catch (error) {
        success = false
        result = { type, description, key, name, error, startedAt, completedAt: new Date(), batchId, version }
        this.garden.events.emit("taskError", result)
        this.logTaskError(node, error)
        this.cancelDependants(node)
      } finally {
        this.resultCache.put(key, node.getVersion(), result)
        this.provideResultToInProgressBatches(result)
      }
    } finally {
      this.completeTask(node, success)
      this.processGraph()
    }
  }

  private completeTask(node: TaskNode, success: boolean) {
    if (node.getRemainingDependencies().length > 0) {
      throw new TaskGraphError(`Task ${node.id} still has unprocessed dependencies`, { node })
    }
    this.remove(node)
    this.logTaskComplete(node, success)
    this.rebuild()
  }

  private remove(node: TaskNode) {
    this.index.removeNode(node)
    this.inProgress.removeNode(node)
  }

  /**
   * Recursively remove node's dependants, without removing node.
   */
  private cancelDependants(node: TaskNode) {
    const cancelledAt = new Date()
    for (const dependant of this.getDependants(node)) {
      this.logTaskComplete(dependant, false)
      this.garden.events.emit("taskCancelled", {
        cancelledAt,
        key: dependant.key,
        name: dependant.task.getName(),
        type: dependant.getType(),
        batchId: node.batchId,
      })
      this.remove(dependant)
      this.cancelKeyForInProgressBatches(dependant.key)
    }
    this.rebuild()
  }

  private getDependants(node: TaskNode): TaskNode[] {
    const dependants = this.index.getNodes().filter((n) => n.getDependencies().find((d) => d.key === node.key))
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
      for (const node of batch.nodes) {
        this.addNode(this.latestNodes[node.key])
      }
    }

    this.rebuild()
  }

  /**
   * Find any pending task batches that are disjoint with all in-progress batches, and mutually disjoint among
   * themselves (preferring to add older batches first, i.e. lower-indexed in this.pendingBatches).
   */
  private pickDisjointPendingBatches(): TaskNodeBatch[] {
    const pickedBatches: TaskNodeBatch[] = []

    const disjointFromAll = (batches: TaskNodeBatch[], candidate: TaskNodeBatch) => {
      return every(batches, (b) => b.disjoint(candidate))
    }

    for (const pending of this.pendingBatches) {
      if (disjointFromAll(this.inProgressBatches, pending) && disjointFromAll(pickedBatches, pending)) {
        pickedBatches.push(pending)
      }
    }

    return pickedBatches
  }

  private provideResultToInProgressBatches(result: GraphResult) {
    const finished: TaskNodeBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.taskFinished(result)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  private provideCachedResultToInProgressBatches(result: GraphResult, depResults: GraphResult[]) {
    const finished: TaskNodeBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.taskCached(result, depResults)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  private cancelKeyForInProgressBatches(key: string) {
    const finished: TaskNodeBatch[] = []
    for (const batch of this.inProgressBatches) {
      const batchFinished = batch.cancelKey(key)
      if (batchFinished) {
        finished.push(batch)
      }
    }
    this.inProgressBatches = without(this.inProgressBatches, ...finished)
  }

  /**
   * Returns the keys of node and its dependencies, recursively.
   */
  private keysWithDependencies(node: TaskNode): string[] {
    const keySet = new Set<string>()

    const getKeys = (n: TaskNode, keys: Set<string>) => {
      keys.add(n.key)
      for (const dep of n.getDependencies()) {
        getKeys(dep, keys)
      }
    }

    getKeys(node, keySet)
    return [...keySet]
  }

  // Logging
  private logTask(node: TaskNode) {
    const entry = this.log.silly({
      section: "tasks",
      msg: `Processing task ${taskStyle(node.id)}`,
      status: "active",
      metadata: metadataForLog(node.task, "active"),
    })
    this.logEntryMap[node.id] = entry
  }

  private logTaskComplete(node: TaskNode, success: boolean) {
    const entry = this.logEntryMap[node.id]
    if (entry) {
      const idStr = taskStyle(node.id)
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
      const header = this.log.silly("Processing tasks...")
      const counter = this.log.silly({
        msg: remainingTasksToStr(this.index.length),
        status: "active",
      })
      const inProgress = this.log.silly(inProgressToStr(this.inProgress.getNodes()))
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
    const error = toGardenError(err)
    const errorMessage = error.message.trim()

    const msg = renderMessageWithDivider(errMessagePrefix, errorMessage, true)

    const entry = this.log.error({ msg, error })
    this.log.silly({ msg: renderError(entry) })
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
  index: Map<string, TaskNode> // Keys are task ids
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
    const taskId = node.id

    if (!this.index.get(taskId)) {
      this.index.set(taskId, node)
      this.length++
    }
  }

  removeNode(node: TaskNode): void {
    if (this.index.delete(node.id)) {
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
    return this.index.has(node.id)
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
  readonly key: string
  readonly id: string
  batchId: string // Set in TaskNodeBatch's constructor
  unlimitedConcurrency: boolean

  /**
   * The initial dependencies of this node, equivalent to node.task.getDependencies()
   */
  private readonly dependencies: TaskNodeMap

  /**
   * Those of this node's dependencies that are in the graph's index (i.e. are scheduled for processing).
   *
   * This field is updated in TaskGraph's rebuild method.
   */
  private remainingDependencies: TaskNodeMap

  constructor(task: BaseTask, dependencies: TaskNode[], unlimitedConcurrency: boolean) {
    this.task = task
    this.key = task.getKey()
    this.id = getIndexId(task)
    this.dependencies = new TaskNodeMap()
    this.unlimitedConcurrency = unlimitedConcurrency
    this.dependencies.setNodes(dependencies)
    this.remainingDependencies = new TaskNodeMap()
    this.dependencies.setNodes(dependencies)
  }

  getDependencies() {
    return this.dependencies.getNodes()
  }

  setRemainingDependencies(nodes: TaskNode[]) {
    for (const node of nodes) {
      this.remainingDependencies.addNode(node)
    }
  }

  getRemainingDependencies() {
    return this.remainingDependencies.getNodes()
  }

  clearRemainingDependencies() {
    this.remainingDependencies.clear()
  }

  getDescription() {
    return this.task.getDescription()
  }

  getType() {
    return this.task.type
  }

  getVersion() {
    return this.task.version.versionString
  }

  // For testing/debugging purposes
  inspect(): object {
    return {
      id: this.id,
      dependencies: this.getDependencies().map((d) => d.inspect()),
      remainingDependencies: this.getRemainingDependencies().map((d) => d.inspect()),
    }
  }

  async process(dependencyResults: GraphResults): Promise<GraphResult> {
    const output = await this.task.process(dependencyResults)

    return {
      type: this.getType(),
      key: this.key,
      name: this.task.getName(),
      description: this.getDescription(),
      completedAt: new Date(),
      batchId: this.batchId,
      output,
      dependencyResults,
      version: this.getVersion(),
    }
  }
}

interface CachedResult {
  result: GraphResult
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

  put(key: string, versionString: string, result: GraphResult): void {
    this.cache[key] = { result, versionString }
  }

  get(key: string, versionString: string): GraphResult | null {
    const r = this.cache[key]
    return r && r.versionString === versionString ? r.result : null
  }

  getNewest(key: string): GraphResult | null {
    const r = this.cache[key]
    return r ? r.result : null
  }

  // Returns newest cached results, if any, for keys
  pick(keys: string[]): GraphResults {
    const results: GraphResults = {}

    for (const key of keys) {
      const cachedResult = this.getNewest(key)
      if (cachedResult) {
        results[key] = cachedResult
      }
    }

    return results
  }
}

export class TaskNodeBatch {
  public id: string
  public nodes: TaskNode[]
  public unlimitedConcurrency: boolean
  /**
   * The keys of nodes and their dependencies, recursively.
   *
   * We want to return results for all these keys, regardless of whether there's a cached result or an
   * already pending node for a given key.
   */
  public resultKeys: string[]
  public remainingResultKeys: Set<string>
  public results: GraphResults
  public promise: Promise<GraphResults>
  private resolver: any

  /**
   * resultKeys should be the set union of the keys of nodes and those of their dependencies, recursively.
   */
  constructor(nodes: TaskNode[], resultKeys: string[], unlimitedConcurrency = false) {
    this.id = uuidv4()
    this.setBatchId(nodes)
    this.nodes = nodes
    this.unlimitedConcurrency = unlimitedConcurrency
    this.resultKeys = resultKeys
    this.remainingResultKeys = new Set(resultKeys)
    this.results = {}
    const { promise, resolver } = defer<GraphResults>()
    this.promise = promise
    this.resolver = resolver
  }

  setBatchId(nodes: TaskNode[]) {
    for (const node of nodes) {
      node.batchId = this.id
      this.setBatchId(node.getDependencies())
    }
  }

  disjoint(otherBatch: TaskNodeBatch): boolean {
    return intersection(this.resultKeys, otherBatch.resultKeys).length === 0
  }

  /**
   * Should be called when a task finishes processing and this batch is in progress.
   *
   * Returns true if this call finishes the batch.
   */
  taskFinished(result: GraphResult): boolean {
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
  taskCached(result: GraphResult, depResults: GraphResult[]): boolean {
    const key = result.key
    if (this.remainingResultKeys.has(key)) {
      this.results[key] = result
      this.remainingResultKeys.delete(key)
    }
    for (const depResult of depResults) {
      if (this.remainingResultKeys.has(depResult.key)) {
        this.results[depResult.key] = depResult
        this.remainingResultKeys.delete(depResult.key)
      }
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

function inProgressToStr(nodes: TaskNode[]) {
  return `Currently in progress [${nodes.map((n) => taskStyle(n.id)).join(", ")}]`
}

function remainingTasksToStr(num) {
  const style = num === 0 ? chalk.green : chalk.yellow
  return `Remaining tasks ${style.bold(String(num))}`
}
