/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseActionTaskParams, ActionTaskProcessParams, ActionTaskStatusParams } from "../tasks/base.js"
import { ExecuteActionTask, logAndEmitGetStatusEvents, logAndEmitProcessingEvents } from "../tasks/base.js"
import { Profile } from "../util/profiling.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import type { TestAction } from "../actions/test.js"
import type { GetTestResult } from "../plugin/handlers/Test/get-result.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { GardenError } from "../exceptions.js"
import { makeGetStatusLog } from "./helpers.js"

/**
 * Only throw this error when the test itself failed, and not when Garden failed to execute the test.
 *
 * Unexpected errors should just bubble up; When the test ran successfully, but it reported a failure (e.g. linter found issues).
 *
 * TODO: This probably should not be handled with an exception and instead just be an object that represents a run failure or success.
 *   For now however, we use the error and should be careful with how we use it.
 */
class TestFailedError extends GardenError {
  override type = "test-failed"
}

export interface TestTaskParams extends BaseActionTaskParams<TestAction> {
  silent?: boolean
  interactive?: boolean
}

@Profile()
export class TestTask extends ExecuteActionTask<TestAction, GetTestResult> {
  readonly type = "test" as const

  silent: boolean

  constructor(params: TestTaskParams) {
    super(params)

    const { silent = true, interactive = false } = params

    this.silent = silent
    this.interactive = interactive
  }

  protected override getDependencyParams(): TestTaskParams {
    return { ...super.getDependencyParams(), silent: this.silent, interactive: this.interactive }
  }

  getDescription() {
    return this.action.longDescription()
  }

  @OtelTraced({
    name: "getTestStatus",
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(logAndEmitGetStatusEvents<TestAction>)
  async getStatus({ dependencyResults }: ActionTaskStatusParams<TestAction>) {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()
    const log = makeGetStatusLog(this.log, this.force)

    const { result: status } = await router.test.getResult({
      log,
      graph: this.graph,
      action,
    })

    const testResult = status?.detail

    const version = action.versionString()
    const executedAction = resolvedActionToExecuted(action, { status })

    if (testResult && testResult.success) {
      return {
        ...status,
        version,
        executedAction,
      }
    } else {
      return {
        ...status,
        state: "not-ready" as const,
        version,
        executedAction,
      }
    }
  }

  @OtelTraced({
    name: "test",
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  @(logAndEmitProcessingEvents<TestAction>)
  async process({ dependencyResults }: ActionTaskProcessParams<TestAction, GetTestResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    const router = await this.garden.getActionRouter()

    let status: GetTestResult<TestAction>
    try {
      const output = await router.test.run({
        log: this.log,
        action,
        graph: this.graph,
        silent: this.silent,
        interactive: this.interactive,
      })
      status = output.result
    } catch (err) {
      throw err
    }
    if (status.detail?.success) {
    } else {
      const exitCode = status.detail?.exitCode
      const failedMsg = !!exitCode ? `Failed with code ${exitCode}!` : `Failed!`
      this.log.error(failedMsg)
      if (status.detail?.diagnosticErrorMsg) {
        this.log.debug(`Additional context for the error:\n\n${status.detail.diagnosticErrorMsg}`)
      }
      throw new TestFailedError({ message: status.detail?.log || "The test failed, but it did not output anything." })
    }

    return { ...status, version: action.versionString(), executedAction: resolvedActionToExecuted(action, { status }) }
  }
}

export function createTestTask(params: TestTaskParams) {
  return new TestTask(params)
}
