/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BaseActionTaskParams,
  ActionTaskProcessParams,
  ExecuteActionTask,
  ActionTaskStatusParams,
  emitGetStatusEvents,
  emitProcessingEvents,
} from "../tasks/base"
import { Profile } from "../util/profiling"
import { resolvedActionToExecuted } from "../actions/helpers"
import type { TestAction } from "../actions/test"
import { GetTestResult } from "../plugin/handlers/Test/get-result"
import { OtelTraced } from "../util/open-telemetry/decorators"
import { GardenError } from "../exceptions"
import { isGardenEnterprise } from "../util/enterprise"

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
  type = "test" as const

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
  @(emitGetStatusEvents<TestAction>)
  async getStatus({ dependencyResults }: ActionTaskStatusParams<TestAction>) {
    this.log.verbose("Checking status...")
    const resolvedAction = this.getResolvedAction(this.action, dependencyResults)
    const router = await this.garden.getActionRouter()
    const cloudApi = this.garden.cloudApi

    // todo cache strategies
    // todo check cloud for availability of feature instead of
    // domain check. session level obj
    const cacheStrategy: string = "template-changes"

    // enterprise
    if (cloudApi && this.garden.projectId && isGardenEnterprise(this.garden)) {
      // cache strategy: never
      // if (cacheStrategy === 'never') {

      // }

      if (cacheStrategy === "code-changes") {
        // cache strategy: code-changes (use unresolved action version)
        const res = await cloudApi.checkCacheStatus({
          projectId: this.garden.projectId,
          actionKind: this.action.kind,
          actionName: this.action.name,
          unresolvedActionVersion: this.action.versionString(),
        })
        this.log.verbose("Status check complete")
        if (res.status === "success") {
          // success
          if (!this.force) {
            this.log.success("Already passed")
          }
          return {
            state: "ready" as const,
            detail: null,
            outputs: {},
            version: this.action.versionString(),
            executedAction: resolvedActionToExecuted(resolvedAction, {
              status: { state: "ready", detail: null, outputs: {} },
            }),
          }
        }
      }

      if (cacheStrategy === "template-changes") {
        // cache strategy: template-changes (use resolved action version)
        const res = await cloudApi.checkCacheStatus({
          projectId: this.garden.projectId,
          actionKind: resolvedAction.kind,
          actionName: resolvedAction.name,
          resolvedActionVersion: resolvedAction.versionString(),
        })
        this.log.verbose("Status check complete")
        if (res.status === "success") {
          // success
          if (!this.force) {
            this.log.success("Already passed")
          }
          return {
            state: "ready" as const,
            detail: null,
            outputs: {},
            version: this.action.versionString(),
            executedAction: resolvedActionToExecuted(resolvedAction, {
              status: { state: "ready", detail: null, outputs: {} },
            }),
          }
        }
      }

      // error
      return {
        state: "not-ready" as const,
        version: this.action.versionString(),
        executedAction: resolvedActionToExecuted(resolvedAction, {
          status: { state: "not-ready", detail: {}, outputs: {} },
        }),
        detail: null,
        outputs: {},
      }
    }

    const { result: status } = await router.test.getResult({
      log: this.log,
      graph: this.graph,
      action: resolvedAction,
    })

    this.log.verbose("Status check complete")

    const testResult = status?.detail

    const version = resolvedAction.versionString()
    const executedAction = resolvedActionToExecuted(resolvedAction, { status })

    if (testResult && testResult.success) {
      if (!this.force) {
        this.log.success("Already passed")
      }
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
  @(emitProcessingEvents<TestAction>)
  async process({ dependencyResults }: ActionTaskProcessParams<TestAction, GetTestResult>) {
    const action = this.getResolvedAction(this.action, dependencyResults)

    this.log.info(`Running...`)

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
      this.log.error(`Failed running test`)

      throw err
    }
    if (status.detail?.success) {
      this.log.success(`Success`)
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
