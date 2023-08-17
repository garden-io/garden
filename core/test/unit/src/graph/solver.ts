/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expect } from "chai"
import { BaseTask, CommonTaskParams, TaskProcessParams, ValidResultType } from "../../../../src/tasks/base"
import {
  freezeTime,
  TestGarden,
  expectError,
  customizedTestPlugin,
  makeTempDir,
  makeGarden,
  makeBuild,
  makeDeploy,
  makeTest,
} from "../../../helpers"
import { MakeOptional } from "../../../../src/util/util"
import { SolveOpts } from "../../../../src/graph/solver"
import { ActionState, ActionStatus, BaseActionConfig } from "../../../../src/actions/types"
import { GardenError, GenericGardenError } from "../../../../src/exceptions"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { joi } from "../../../../src/config/common"
import { BaseAction } from "../../../../src/actions/base"
import { TestTask } from "../../../../src/tasks/test"
import { Log } from "../../../../src/logger/log-entry"
import { GetRunResult } from "../../../../src/plugin/handlers/Run/get-result"

const placeholderTimestamp = new Date()

//
// Utilities for solver tests where action-based tasks are not necessary to reproduce the semantics for testing
//
export type TestTaskCallback = (params: { task: BaseTask; params: TaskProcessParams }) => Promise<any>

interface TestTaskParams extends CommonTaskParams {
  name?: string
  state?: ActionState
  callback?: TestTaskCallback
  statusCallback?: TestTaskCallback
  dependencies?: BaseTask[]
  statusDependencies?: BaseTask[]
}

interface TestTaskResult extends ValidResultType {
  outputs: {
    id: string
    processed: boolean
    callbackResult: any
  }
}

// TODO-G2: Implement equivalent test cases for the new graph

export class SolverTestTask extends BaseTask<TestTaskResult> {
  type = "test"

  name: string
  state: ActionState
  callback: TestTaskCallback | null
  statusCallback?: TestTaskCallback | null
  dependencies: BaseTask[]
  statusDependencies: BaseTask[]

  constructor(params: TestTaskParams) {
    super(params)
    this.name = params.name || "task-a"
    this.state = params.state || "not-ready"
    this.callback = params.callback || null
    this.dependencies = params.dependencies || []
    this.statusDependencies = params.statusDependencies || []
  }

  resolveStatusDependencies() {
    return this.statusDependencies
  }

  resolveProcessDependencies() {
    return this.dependencies
  }

  getName() {
    return this.name
  }

  override getId(): string {
    return this.uid ? `${this.name}.${this.uid}` : this.name
  }

  getDescription() {
    return this.getId()
  }

  getInputVersion() {
    return "v-" + this.uid.slice(0, 6)
  }

  async getStatus(params: TaskProcessParams) {
    let callbackResult: any = undefined

    if (this.statusCallback) {
      callbackResult = await this.statusCallback({ task: this, params })
    }

    return {
      state: this.state,
      outputs: {
        id: this.getId(),
        processed: false,
        callbackResult,
      },
      version: this.getInputVersion(),
    }
  }

  async process(params: TaskProcessParams) {
    let callbackResult: any = undefined

    if (this.callback) {
      callbackResult = await this.callback({ task: this, params })
    }

    return {
      state: "ready" as const,
      outputs: {
        id: this.getId(),
        processed: true,
        callbackResult,
      },
      version: this.getInputVersion(),
    }
  }
}

//
// Utilities for solver tests where action-based tasks are necessary to reproduce the semantics for testing
//

// Useful to test caching behavior of tasks
let resultCache: { [actionKey: string]: ActionStatus }
// Tracks which tasks were actually run, rather than cached.
const processedKeys = new Set<string>()

// Build & Deploy
const makeReadyStatus = (): ActionStatus => {
  return { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
}
const getStatusHandler = async (params: { action: BaseAction }) => {
  return (
    resultCache[params.action.key()] || {
      state: "unknown",
      detail: { state: "unknown", detail: {} },
      outputs: {},
    }
  )
}
const processHandler = async (params: { action: BaseAction }) => {
  const status = makeReadyStatus()
  const key = params.action.key()
  processedKeys.add(key)
  resultCache[key] = status
  return status
}

// Run & Test
const makeSuccessfulResult = (): GetRunResult => {
  const status: GetRunResult = {
    state: "ready",
    detail: {
      success: true,
      startedAt: placeholderTimestamp,
      completedAt: placeholderTimestamp,
      log: "OK",
    },
    outputs: {},
  }
  return status
}

const getResultHandler = async (params: { action: BaseAction }) => {
  return (
    resultCache[params.action.key()] || {
      state: "unknown",
      detail: null,
      outputs: {},
    }
  )
}
const runHandler = async (params: { action: BaseAction }) => {
  const status = makeSuccessfulResult()
  const key = params.action.key()
  processedKeys.add(key)
  resultCache[key] = status
  return status
}

const solverTestPlugin = customizedTestPlugin({
  name: "test",
  createActionTypes: {
    Build: [
      {
        name: "test",
        docs: "Test Build action",
        schema: joi.object(),
        handlers: {
          build: processHandler,
          getStatus: getStatusHandler,
        },
      },
    ],
    Deploy: [
      {
        name: "test",
        docs: "Test Deploy action",
        schema: joi.object(),
        handlers: {
          deploy: processHandler,
          getStatus: getStatusHandler,
        },
      },
    ],
    Run: [
      {
        name: "test",
        docs: "Test Run action",
        schema: joi.object(),
        handlers: {
          run: runHandler,
          getResult: getResultHandler,
        },
      },
    ],
    Test: [
      {
        name: "test",
        docs: "Test Test action",
        schema: joi.object(),
        handlers: {
          run: runHandler,
          getResult: getResultHandler,
        },
      },
    ],
  },
})

describe("GraphSolver", () => {
  let tmpDir: tmp.DirectoryResult
  let now: Date
  let garden: TestGarden
  let graph: ConfigGraph
  let log: Log

  beforeEach(async () => {
    now = freezeTime()
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
    garden = await makeGarden(tmpDir, solverTestPlugin)
    log = garden.log
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    resultCache = {}
    processedKeys.clear()
  })

  function makeTask(params: MakeOptional<TestTaskParams, "garden" | "log" | "force">) {
    const _garden = params.garden || garden
    return new SolverTestTask({
      ...params,
      garden: _garden,
      log: params.log || _garden.log,
      force: params.force || false,
    })
  }

  async function processTask(task: BaseTask, opts: SolveOpts = {}) {
    return garden.processTask(task, garden.log, opts)
  }

  it("processes a single task without dependencies", async () => {
    const task = makeTask({})
    const result = await processTask(task, { throwOnError: true })

    expect(result).to.exist
    expect(result!.type).to.equal("test")
    expect(result!.name).to.equal("task-a")
    expect(result!.startedAt).to.eql(now)
    expect(result!.completedAt).to.eql(now)
    expect(result!.inputVersion).to.equal(task.getInputVersion())
    expect(result!.result?.state).to.equal("ready")
    expect(result!.outputs["processed"]).to.equal(true)
  })

  it("returns status for task without processing if it's status is ready and force=false", async () => {
    const task = makeTask({ state: "ready" })
    const result = await processTask(task, { throwOnError: true })

    expect(result).to.exist
    expect(result!.result?.state).to.equal("ready")
    expect(result!.outputs["processed"]).to.equal(false)
  })

  it("does not process dependencies for a task with a ready status and force=false", async () => {
    const dependencyStatusCheckedNames: string[] = []
    const dependencyProcessedNames: string[] = []
    const taskA = makeTask({ name: "task-a" })
    const taskB1 = makeTask({
      name: "task-b1",
      dependencies: [taskA],
      statusCallback: async () => dependencyStatusCheckedNames.push("task-b1"),
      callback: async () => dependencyProcessedNames.push("task-b1"),
    })
    const taskB2 = makeTask({
      name: "task-b2",
      dependencies: [],
      statusCallback: async () => dependencyStatusCheckedNames.push("task-b2"),
      callback: async () => dependencyProcessedNames.push("task-b2"),
    })
    const taskC = makeTask({
      name: "task-c",
      state: "ready", // <------
      dependencies: [taskB1, taskB2],
      statusCallback: async () => dependencyStatusCheckedNames.push("task-c"),
      callback: async () => dependencyProcessedNames.push("task-c"),
    })
    const result = await processTask(taskC, { throwOnError: true })

    expect(result).to.exist
    expect(result!.result?.state).to.equal("ready")
    expect(result!.outputs["processed"]).to.equal(false)
    expect(dependencyProcessedNames.length).to.eql(0)
    expect(dependencyStatusCheckedNames.length).to.eql(0)
  })

  it("processs dependencies for a task with a ready status if skipRuntimeDependencies=never", async () => {
    const actionConfigs: BaseActionConfig[] = [
      makeBuild("a", tmpDir.path),
      makeDeploy("a", tmpDir.path, { dependencies: ["build.a"] }),
      makeDeploy("b", tmpDir.path, { dependencies: ["deploy.a"] }),
      makeDeploy("c", tmpDir.path, { dependencies: ["deploy.b"] }),
      makeTest("c", tmpDir.path, { dependencies: ["deploy.c"] }),
    ]
    garden.setActionConfigs([...actionConfigs])
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })

    resultCache["deploy.b"] = makeReadyStatus()

    const testAction = graph.getTest("c")
    // By default, test tasks set `skipRuntimeDependencies = never` on their dependencies.
    const testTask = new TestTask({
      garden,
      log,
      graph,
      action: testAction,
      force: true,
      forceBuild: false,
    })

    await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const resultKeys = Object.keys(resultCache)
    expect(resultKeys.sort()).to.eql(["build.a", "deploy.a", "deploy.b", "deploy.c", "test.c"])
    expect([...processedKeys].sort()).to.eql(["build.a", "deploy.a", "deploy.c", "test.c"])
  })

  it("processes task if its status is ready and force=true", async () => {
    const task = makeTask({ state: "ready", force: true })
    const result = await processTask(task, { throwOnError: true })

    expect(result).to.exist
    expect(result!.result?.state).to.equal("ready")
    expect(result!.outputs["processed"]).to.equal(true)
  })

  it("processes two tasks in dependency order", async () => {
    const taskA = makeTask({ name: "a" })
    const taskB = makeTask({
      name: "b",
      dependencies: [taskA],
      callback: async ({ params }) => {
        return params.dependencyResults.getResult(taskA)?.outputs.id
      },
    })
    const { error, results } = await garden.processTasks({ tasks: [taskA, taskB], throwOnError: true })

    expect(error).to.not.exist
    expect(results).to.exist

    // const resultA = results.getResult(taskA)
    const resultB = results.getResult(taskB)

    expect(resultB?.outputs.callbackResult).to.equal(taskA.getId())
  })

  it("returns an error when task processing fails due a crash (Non-garden error)", async () => {
    const task = makeTask({})

    task.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const result = await processTask(task)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("Throwing error in process method")
    expect(result!.error).to.be.instanceOf(GardenError)
    const error = result!.error as GardenError
    expect(error.type).to.eql("graph")
    expect(error.wrappedErrors?.length).to.eql(1)
    const rootCause = error.wrappedErrors![0]!
    expect(rootCause.type).to.eql("crash")
  })

  it("returns an error when task processing fails due a GardenError", async () => {
    const task = makeTask({})

    task.process = async () => {
      throw new GenericGardenError({
        message: "non-crash error scenario",
        type: "test",
      })
    }

    const result = await processTask(task)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("non-crash error scenario")
    expect(result!.error).to.be.instanceOf(GardenError)
    const error = result!.error as GardenError
    expect(error.type).to.eql("graph")
    expect(error.wrappedErrors?.length).to.eql(1)
    const rootCause = error.wrappedErrors![0]!
    expect(rootCause.type).to.eql("test")
  })

  it("throws an error when task processing fails and throwOnError=true", async () => {
    const task = makeTask({})

    task.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    await expectError(
      () => processTask(task, { throwOnError: true }),
      (err) => expect(err.message).to.include("Throwing error in process method")
    )
  })

  it("returns an error when task status fails", async () => {
    const task = makeTask({})

    task.getStatus = async () => {
      throw new Error(`Throwing error in status method`)
    }

    const result = await processTask(task)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("Throwing error in status method")
  })

  it("cascades an error from dependency to dependant and fails the execution", async () => {
    const taskA = makeTask({ name: "task-a" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })

    taskA.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const result = await processTask(taskB)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("Throwing error in process method")
  })

  it("cascades an error recursively from dependency and fails the execution", async () => {
    const taskA = makeTask({ name: "task-a" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })
    const taskC = makeTask({ name: "task-c", dependencies: [taskB] })

    taskA.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const result = await processTask(taskC)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("Throwing error in process method")
    // We expect taskB and taskC to have been cancelled.
    expect(Object.keys(garden["solver"]["inProgress"]).length).to.eql(0)
  })

  it("returns status directly and skips processing if state is ready", async () => {
    const taskA = makeTask({ state: "ready" })

    const result = await processTask(taskA)

    expect(result!.outputs["processed"]).to.equal(false)
  })

  it("returns status of dependency directly and skips processing it if its state is ready", async () => {
    const taskA = makeTask({ name: "task-a", state: "ready" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })

    const result = await processTask(taskB)

    const depResults = result!.dependencyResults?.["test.task-b"]

    expect(depResults).to.exist
    expect(depResults!.dependencyResults?.["test.task-a"]?.outputs["processed"]).to.equal(false)
  })

  // TODO-G2: update these once we're decided on the event formats

  // it("should emit a taskPending event when adding a task", async () => {
  //   const now = freezeTime()

  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)
  //   const task = new TestTask(garden, "a", false)

  //   const result = await graph.process([task])
  //   const generatedBatchId = result?.a?.batchId || uuidv4()

  //   expect(garden.events.eventLog).to.eql([
  //     { name: "taskGraphProcessing", payload: { startedAt: now } },
  //     {
  //       name: "taskPending",
  //       payload: {
  //         addedAt: now,
  //         batchId: generatedBatchId,
  //         key: task.getBaseKey(),
  //         name: task.name,
  //         type: task.type,
  //       },
  //     },
  //     {
  //       name: "taskProcessing",
  //       payload: {
  //         startedAt: now,
  //         batchId: generatedBatchId,
  //         key: task.getBaseKey(),
  //         name: task.name,
  //         type: task.type,
  //         versionString: task.version,
  //       },
  //     },
  //     { name: "taskComplete", payload: toGraphResultEventPayload(result["a"]!) },
  //     { name: "taskGraphComplete", payload: { completedAt: now } },
  //   ])
  // })

  // it("should throw if tasks have circular dependencies", async () => {
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)
  //   const taskA = new TestTask(garden, "a", false)
  //   const taskB = new TestTask(garden, "b", false, { dependencies: [taskA] })
  //   const taskC = new TestTask(garden, "c", false, { dependencies: [taskB] })
  //   taskA["dependencies"] = [taskC]
  //   const errorMsg = "Circular task dependencies detected:\n\nb <- a <- c <- b\n"

  //   await expectError(
  //     () => graph.process([taskB]),
  //     (err) => expect(err.message).to.eql(errorMsg)
  //   )
  // })

  // it("should process multiple tasks in dependency order", async () => {
  //   const now = freezeTime()
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)

  //   const callbackResults = {}
  //   const resultOrder: string[] = []

  //   const callback = async (key: string, result: any) => {
  //     resultOrder.push(key)
  //     callbackResults[key] = result
  //   }

  //   const opts = { callback }

  //   const taskA = new TestTask(garden, "a", false, { ...opts, dependencies: [], uid: "a1" })
  //   const taskB = new TestTask(garden, "b", false, { ...opts, dependencies: [taskA], uid: "b1" })
  //   const taskC = new TestTask(garden, "c", false, { ...opts, dependencies: [taskB], uid: "c1" })
  //   const taskD = new TestTask(garden, "d", false, { ...opts, dependencies: [taskB, taskC], uid: "d1" })

  //   // we should be able to add tasks multiple times and in any order
  //   const results = await graph.process([taskA, taskB, taskC, taskC, taskD, taskA, taskD, taskB, taskD, taskA])
  //   const generatedBatchId = results?.a?.batchId || uuidv4()

  //   // repeat

  //   const repeatCallbackResults = {}
  //   const repeatResultOrder: string[] = []

  //   const repeatCallback = async (key: string, result: any) => {
  //     repeatResultOrder.push(key)
  //     repeatCallbackResults[key] = result
  //   }

  //   const repeatOpts = { callback: repeatCallback }

  //   const repeatTaskA = new TestTask(garden, "a", false, { ...repeatOpts, dependencies: [], uid: "a2" })
  //   const repeatTaskB = new TestTask(garden, "b", false, { ...repeatOpts, dependencies: [repeatTaskA], uid: "b2" })
  //   const repeatTaskC = new TestTask(garden, "c", true, { ...repeatOpts, dependencies: [repeatTaskB], uid: "c2" })

  //   const repeatTaskAforced = new TestTask(garden, "a", true, { ...repeatOpts, dependencies: [], uid: "a2f" })
  //   const repeatTaskBforced = new TestTask(garden, "b", true, {
  //     ...repeatOpts,
  //     dependencies: [repeatTaskA],
  //     uid: "b2f",
  //   })

  //   await graph.process([repeatTaskBforced, repeatTaskAforced, repeatTaskC])

  //   const resultA: GraphResult = {
  //     type: "test",
  //     description: "a.a1",
  //     key: "a",
  //     name: "a",
  //     startedAt: now,
  //     completedAt: now,
  //     batchId: generatedBatchId,
  //     result: {
  //       result: "result-a.a1",
  //       dependencyResults: {},
  //     },
  //     dependencyResults: {},
  //     version: taskA.version,
  //   }
  //   const resultB: GraphResult = {
  //     type: "test",
  //     key: "b",
  //     name: "b",
  //     description: "b.b1",
  //     startedAt: now,
  //     completedAt: now,
  //     batchId: generatedBatchId,
  //     result: {
  //       result: "result-b.b1",
  //       dependencyResults: { a: resultA },
  //     },
  //     dependencyResults: { a: resultA },
  //     version: taskB.version,
  //   }
  //   const resultC: GraphResult = {
  //     type: "test",
  //     description: "c.c1",
  //     key: "c",
  //     name: "c",
  //     startedAt: now,
  //     completedAt: now,
  //     batchId: generatedBatchId,
  //     result: {
  //       result: "result-c.c1",
  //       dependencyResults: { b: resultB },
  //     },
  //     dependencyResults: { b: resultB },
  //     version: taskC.version,
  //   }

  //   const expected: GraphResults = {
  //     a: resultA,
  //     b: resultB,
  //     c: resultC,
  //     d: {
  //       type: "test",
  //       description: "d.d1",
  //       key: "d",
  //       name: "d",
  //       startedAt: now,
  //       completedAt: now,
  //       batchId: generatedBatchId,
  //       result: {
  //         result: "result-d.d1",
  //         dependencyResults: {
  //           b: resultB,
  //           c: resultC,
  //         },
  //       },
  //       dependencyResults: {
  //         b: resultB,
  //         c: resultC,
  //       },
  //       version: taskD.version,
  //     },
  //   }

  //   expect(results).to.eql(expected, "Wrong results after initial add and process")
  //   expect(resultOrder).to.eql(["a.a1", "b.b1", "c.c1", "d.d1"], "Wrong result order after initial add and process")

  //   expect(callbackResults).to.eql(
  //     {
  //       "a.a1": "result-a.a1",
  //       "b.b1": "result-b.b1",
  //       "c.c1": "result-c.c1",
  //       "d.d1": "result-d.d1",
  //     },
  //     "Wrong callbackResults after initial add and process"
  //   )

  //   expect(repeatResultOrder).to.eql(["a.a2f", "b.b2f", "c.c2"], "Wrong result order after repeat add & process")

  //   expect(repeatCallbackResults).to.eql(
  //     {
  //       "a.a2f": "result-a.a2f",
  //       "b.b2f": "result-b.b2f",
  //       "c.c2": "result-c.c2",
  //     },
  //     "Wrong callbackResults after repeat add & process"
  //   )
  // })

  // it("should add at most one pending task for a given key", async () => {
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)

  //   const processedVersions: string[] = []

  //   const { promise: t1StartedPromise, resolver: t1StartedResolver } = defer()
  //   const { promise: t1DonePromise, resolver: t1DoneResolver } = defer()

  //   const t1 = new TestTask(garden, "a", false, {
  //     versionString: "1",
  //     uid: "1",
  //     callback: async () => {
  //       t1StartedResolver()
  //       processedVersions.push("1")
  //       await t1DonePromise
  //     },
  //   })

  //   const repeatedCallback = (version: string) => {
  //     return async () => {
  //       processedVersions.push(version)
  //     }
  //   }
  //   const t2 = new TestTask(garden, "a", false, { uid: "2", versionString: "2", callback: repeatedCallback("2") })
  //   const t3 = new TestTask(garden, "a", false, { uid: "3", versionString: "3", callback: repeatedCallback("3") })

  //   const firstProcess = graph.process([t1])

  //   // We make sure t1 is being processed before adding t2 and t3. Since t3 is added after t2,
  //   // only t1 and t3 should be processed (since t2 and t3 have the same key, "a").
  //   await t1StartedPromise
  //   const secondProcess = graph.process([t2])
  //   const thirdProcess = graph.process([t3])
  //   await sleep(200) // TODO: Get rid of this?
  //   t1DoneResolver()
  //   await Promise.all([firstProcess, secondProcess, thirdProcess])
  //   expect(processedVersions).to.eql(["1", "3"])
  // })

  // TODO-G2: not implemented
  // it("should process requests with unrelated tasks concurrently", async () => {
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)

  //   const resultOrder: string[] = []

  //   const callback = async (key: string) => {
  //     resultOrder.push(key)
  //   }

  //   const { resolver: aStartedResolver } = defer()
  //   const { promise: aDonePromise, resolver: aDoneResolver } = defer()

  //   const opts = { callback }
  //   const taskADep1 = new TestTask(garden, "a-dep1", false, { ...opts })
  //   const taskADep2 = new TestTask(garden, "a-dep2", false, { ...opts })

  //   const taskA = new TestTask(garden, "a", false, {
  //     dependencies: [taskADep1, taskADep2],
  //     callback: async () => {
  //       aStartedResolver()
  //       resultOrder.push("a")
  //       await aDonePromise
  //     },
  //   })

  //   const taskBDep = new TestTask(garden, "b-dep", false, { ...opts })
  //   const taskB = new TestTask(garden, "b", false, { ...opts, dependencies: [taskBDep] })
  //   const taskC = new TestTask(garden, "c", false, { ...opts })

  //   const firstProcess = graph.process([taskA, taskADep1, taskADep2])
  //   const secondProcess = graph.process([taskB, taskBDep])
  //   const thirdProcess = graph.process([taskC])
  //   aDoneResolver()
  //   await Promise.all([firstProcess, secondProcess, thirdProcess])
  //   expect(resultOrder).to.eql(["c", "a-dep1", "a-dep2", "b-dep", "a", "b"])
  // })

  // it("should process two requests with related tasks sequentially", async () => {
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)

  //   const resultOrder: string[] = []

  //   const callback = async (key: string) => {
  //     resultOrder.push(key)
  //   }

  //   const { resolver: aStartedResolver } = defer()
  //   const { promise: aDonePromise, resolver: aDoneResolver } = defer()

  //   const opts = { callback }
  //   const taskADep = new TestTask(garden, "a-dep1", true, { ...opts })

  //   const taskA = new TestTask(garden, "a", true, {
  //     dependencies: [taskADep],
  //     callback: async () => {
  //       aStartedResolver()
  //       resultOrder.push("a")
  //       await aDonePromise
  //     },
  //   })

  //   const repeatTaskBDep = new TestTask(garden, "b-dep", true, { ...opts })

  //   const firstProcess = graph.process([taskA, taskADep])
  //   const secondProcess = graph.process([repeatTaskBDep])
  //   aDoneResolver()
  //   await Promise.all([firstProcess, secondProcess])
  //   expect(resultOrder).to.eql(["b-dep", "a-dep1", "a"])
  // })

  // it("should enforce a hard concurrency limit on task processing", async () => {
  //   const garden = await getGarden()
  //   const tasks = range(0, 10).map((n) => new TestTask(garden, "task-" + n, false))
  //   const limit = 3
  //   const graph = new TaskGraph(garden, garden.log, limit)
  //   let gotEvents = false

  //   graph.on("process", (event) => {
  //     gotEvents = true
  //     // Ensure we never go over the hard limit
  //     expect(event.keys.length + event.inProgress.length).to.lte(limit)
  //   })

  //   await graph.process(tasks)

  //   expect(gotEvents).to.be.true
  // })

  // it("should enforce a concurrency limit per task type", async () => {
  //   const garden = await getGarden()
  //   const limit = 2

  //   class TaskTypeA extends TestTask {
  //     type = "a"
  //     concurrencyLimit = limit
  //   }

  //   class TaskTypeB extends TestTask {
  //     type = "b"
  //     concurrencyLimit = limit
  //   }

  //   const tasks = [
  //     ...range(0, 10).map((n) => new TaskTypeA(garden, "a-" + n, false)),
  //     ...range(0, 10).map((n) => new TaskTypeB(garden, "b-" + n, false)),
  //   ]

  //   const graph = new TaskGraph(garden, garden.log)

  //   let gotEvents = false

  //   graph.on("process", (event) => {
  //     gotEvents = true
  //     // Ensure not more than two of each task type run concurrently
  //     for (const type of ["a", "b"]) {
  //       const keys = [...event.keys, ...event.inProgress].filter((key) => key.startsWith(type))
  //       expect(keys.length).to.lte(limit)
  //     }
  //   })

  //   await graph.process(tasks)

  //   expect(gotEvents).to.be.true
  // })

  // it("should recursively cancel a task's dependants when it throws an error", async () => {
  //   const now = freezeTime()
  //   const garden = await getGarden()
  //   const graph = new TaskGraph(garden, garden.log)

  //   const resultOrder: string[] = []

  //   const callback = async (key: string) => {
  //     resultOrder.push(key)
  //   }

  //   const opts = { callback }

  //   const taskA = new TestTask(garden, "a", true, { ...opts })
  //   const taskB = new TestTask(garden, "b", true, { callback, throwError: true, dependencies: [taskA] })
  //   const taskC = new TestTask(garden, "c", true, { ...opts, dependencies: [taskB] })
  //   const taskD = new TestTask(garden, "d", true, { ...opts, dependencies: [taskB, taskC] })

  //   const results = await graph.process([taskA, taskB, taskC, taskD])

  //   const generatedBatchId = results?.a?.batchId || uuidv4()

  //   const resultA: GraphResult = {
  //     type: "test",
  //     description: "a",
  //     key: "a",
  //     name: "a",
  //     startedAt: now,
  //     completedAt: now,
  //     batchId: generatedBatchId,
  //     result: {
  //       result: "result-a",
  //       dependencyResults: {},
  //     },
  //     dependencyResults: {},
  //     version: taskA.version,
  //   }

  //   const filteredKeys: Set<string | number> = new Set([
  //     "version",
  //     "versionString",
  //     "error",
  //     "addedAt",
  //     "startedAt",
  //     "cancelledAt",
  //     "completedAt",
  //   ])

  //   const filteredEventLog = garden.events.eventLog.map((e) => {
  //     return deepFilter(e, (_, key) => !filteredKeys.has(key))
  //   })

  //   expect(results.a).to.eql(resultA)
  //   expect(results.b).to.have.property("error")
  //   expect(resultOrder).to.eql(["a", "b"])
  //   expect(filteredEventLog).to.eql([
  //     { name: "taskGraphProcessing", payload: {} },
  //     { name: "taskPending", payload: { key: "a", name: "a", type: "test", batchId: generatedBatchId } },
  //     { name: "taskPending", payload: { key: "b", name: "b", type: "test", batchId: generatedBatchId } },
  //     { name: "taskPending", payload: { key: "c", name: "c", type: "test", batchId: generatedBatchId } },
  //     { name: "taskPending", payload: { key: "d", name: "d", type: "test", batchId: generatedBatchId } },
  //     { name: "taskProcessing", payload: { key: "a", name: "a", type: "test", batchId: generatedBatchId } },
  //     {
  //       name: "taskComplete",
  //       payload: {
  //         description: "a",
  //         key: "a",
  //         name: "a",
  //         type: "test",
  //         batchId: generatedBatchId,
  //         output: { result: "result-a" },
  //       },
  //     },
  //     { name: "taskProcessing", payload: { key: "b", name: "b", type: "test", batchId: generatedBatchId } },
  //     {
  //       name: "taskError",
  //       payload: { description: "b", key: "b", name: "b", type: "test", batchId: generatedBatchId },
  //     },
  //     { name: "taskCancelled", payload: { key: "c", name: "c", type: "test", batchId: generatedBatchId } },
  //     { name: "taskCancelled", payload: { key: "d", name: "d", type: "test", batchId: generatedBatchId } },
  //     { name: "taskCancelled", payload: { key: "d", name: "d", type: "test", batchId: generatedBatchId } },
  //     { name: "taskGraphComplete", payload: {} },
  //   ])
  // })
})
