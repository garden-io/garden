/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { CommonTaskParams, TaskProcessParams, ValidResultType } from "../../../../src/tasks/base.js"
import { BaseTask } from "../../../../src/tasks/base.js"
import type { TestGarden } from "../../../helpers.js"
import { makeTestGarden, freezeTime, getDataDir, expectError } from "../../../helpers.js"
import type { MakeOptional } from "../../../../src/util/util.js"
import type { SolveOpts } from "../../../../src/graph/solver.js"
import type { ActionState } from "../../../../src/actions/types.js"
import { GardenError, GenericGardenError } from "../../../../src/exceptions.js"
import { range } from "lodash-es"

const projectRoot = getDataDir("test-project-empty")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestTaskCallback = (params: { task: BaseTask; params: TaskProcessParams }) => Promise<any>

interface TestTaskParams extends CommonTaskParams {
  name?: string
  state?: ActionState
  callback?: TestTaskCallback
  statusCallback?: TestTaskCallback
  dependencies?: BaseTask[]
  statusDependencies?: BaseTask[]
  statusConcurrencyLimit?: number
  executeConcurrencyLimit?: number
}

interface TestTaskResult extends ValidResultType {
  outputs: {
    id: string
    processed: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callbackResult: any
  }
}

// TODO-G2: Implement equivalent test cases for the new graph

const defaultStatusConcurrencyLimit = 10
const defaultExecuteConcurrencyLimit = 10

export class TestTask extends BaseTask<TestTaskResult> {
  override statusConcurrencyLimit = defaultStatusConcurrencyLimit
  override executeConcurrencyLimit = defaultExecuteConcurrencyLimit

  readonly type = "test"

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
    this.statusConcurrencyLimit = params.statusConcurrencyLimit || defaultStatusConcurrencyLimit
    this.executeConcurrencyLimit = params.executeConcurrencyLimit || defaultExecuteConcurrencyLimit
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

describe("GraphSolver", () => {
  let now: Date
  let garden: TestGarden

  beforeEach(async () => {
    now = freezeTime()
    garden = await makeTestGarden(projectRoot)
  })

  function makeTask(params: MakeOptional<TestTaskParams, "garden" | "log" | "force">) {
    const _garden = params.garden || garden
    return new TestTask({
      ...params,
      garden: _garden,
      log: params.log || _garden.log,
      force: params.force || false,
    })
  }

  async function processTask(task: BaseTask, opts: SolveOpts = {}) {
    return garden.processTask(task, opts)
  }

  it("processes a single task without dependencies", async () => {
    const task = makeTask({})
    const { result } = await processTask(task, { throwOnError: true })

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
    const { result } = await processTask(task, { throwOnError: true })

    expect(result).to.exist
    expect(result!.result?.state).to.equal("ready")
    expect(result!.outputs["processed"]).to.equal(false)
  })

  it("processes task if it's status is ready and force=true", async () => {
    const task = makeTask({ state: "ready", force: true })
    const { result } = await processTask(task, { throwOnError: true })

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

    const { result } = await processTask(task)

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

    const { result } = await processTask(task)

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

    const { result } = await processTask(task)

    expect(result).to.exist
    expect(result!.error).to.exist
    expect(result!.error?.message).to.include("Throwing error in status method")
  })

  it("cascades an error from dependency to dependant and fails the execution (2 tasks)", async () => {
    const taskA = makeTask({ name: "task-a" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })

    taskA.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const { error, result } = await processTask(taskB)

    expect(result).to.exist
    expect(result!.aborted).to.be.true
    expect(result!.success).to.be.false
    expect(error).to.exist
  })

  it("cascades an error recursively from dependency and fails the execution (3 tasks)", async () => {
    const taskA = makeTask({ name: "task-a" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })
    const taskC = makeTask({ name: "task-c", dependencies: [taskB] })

    taskA.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const { error, result } = await processTask(taskC)

    expect(result).to.exist
    expect(result!.aborted).to.be.true
    expect(result!.success).to.be.false
    expect(error).to.exist
  })

  it("cascades an error from dependency to dependant and fails the execution with throwOnError=true", async () => {
    const taskA = makeTask({ name: "task-a" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })

    taskA.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    let error: unknown
    try {
      await processTask(taskB, { throwOnError: true })
    } catch (e) {
      error = e
    }

    expect(error).to.exist
    expect(error).to.be.instanceOf(GardenError)
    expect((error as GardenError).type).to.eql("graph")
  })

  it("recursively aborts unprocessed task requests when a dependency fails", async () => {
    const failTask = makeTask({ name: "fail-task" })
    const failTask2 = makeTask({ name: "fail-task-2" })
    const taskB1 = makeTask({ name: "task-b1", dependencies: [failTask] })
    const taskB2 = makeTask({ name: "task-b2", dependencies: [failTask2] })
    const taskC = makeTask({ name: "task-c", dependencies: [taskB1] })

    failTask.process = async () => {
      throw new Error(`Throwing error in process method`)
    }
    failTask2.process = async () => {
      throw new Error(`Throwing error in process method`)
    }

    const result = await garden.processTasks({ tasks: [taskC, taskB2, failTask2], throwOnError: false })
    const exported = result.results.export()
    const failTask2Result = exported[failTask2.getKey()]
    const taskB2Result = exported[taskB2.getKey()]
    const taskCResult = exported[taskC.getKey()]

    expect(exported[failTask.getKey()]).to.be.undefined

    expect(failTask2Result?.aborted).to.eql(false)
    expect(failTask2Result?.error).to.exist

    expect(taskB2Result?.aborted).to.eql(true)
    expect(taskB2Result?.error).to.not.exist

    expect(taskCResult?.aborted).to.eql(true)
    expect(taskCResult?.error).to.not.exist
  })

  it("returns status directly and skips processing if state is ready", async () => {
    const taskA = makeTask({ state: "ready" })

    const { result } = await processTask(taskA)

    expect(result!.outputs["processed"]).to.equal(false)
  })

  it("returns status of dependency directly and skips processing it if its state is ready", async () => {
    const taskA = makeTask({ name: "task-a", state: "ready" })
    const taskB = makeTask({ name: "task-b", dependencies: [taskA] })

    const { result } = await processTask(taskB)

    const depResults = result!.dependencyResults?.["test.task-b"]

    expect(depResults).to.exist
    expect(depResults!.dependencyResults?.["test.task-a"]?.outputs["processed"]).to.equal(false)
  })

  it("respects the concurrency limit specified by each node", async () => {
    // We use different status & execute limits for the two groups of tasks here.
    const statusLimitA = 2
    const executeLimitA = 1
    const statusLimitB = 3
    const executeLimitB = 2
    const groupATasks = range(0, 3).map((n) =>
      makeTask({ name: `task-a-${n}`, statusConcurrencyLimit: statusLimitA, executeConcurrencyLimit: executeLimitA })
    )
    const groupBTasks = range(0, 3).map((n) =>
      makeTask({ name: `task-b-${n}`, statusConcurrencyLimit: statusLimitB, executeConcurrencyLimit: executeLimitB })
    )

    const processedBatches: string[][] = []
    garden["solver"].on("process", (event) => {
      processedBatches.push(event.keys)
    })

    await garden.processTasks({ tasks: [...groupATasks, ...groupBTasks], throwOnError: false })

    expect(processedBatches[0].sort()).to.eql(
      [
        "test.task-a-0:status",
        "test.task-a-1:status",
        "test.task-b-0:status",
        "test.task-b-1:status",
        "test.task-b-2:status",
      ].sort()
    )

    expect(processedBatches[1].sort()).to.eql(
      ["test.task-a-2:status", "test.task-a-0:process", "test.task-b-0:process", "test.task-b-1:process"].sort()
    )

    expect(processedBatches[2].sort()).to.eql(["test.task-a-1:process", "test.task-b-2:process"])

    expect(processedBatches[3].sort()).to.eql(["test.task-a-2:process"])
  })
})
