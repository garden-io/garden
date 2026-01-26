/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PlanCommand } from "../../../../src/commands/plan.js"
import { expect } from "chai"
import {
  withDefaultGlobalOpts,
  makeTestGarden,
  customizedTestPlugin,
  testDeploySchema,
  testTestSchema,
  getAllProcessedTaskNames,
  getDataDir,
} from "../../../helpers.js"
import type { ActionStatus } from "../../../../src/actions/types.js"
import type { DeployStatus } from "../../../../src/plugin/handlers/Deploy/get-status.js"
import { zodObjectToJoi } from "../../../../src/config/common.js"

const placeholderTimestamp = new Date()

const testProvider = () => {
  const testStatuses: { [key: string]: ActionStatus } = {
    "service-a": {
      state: "ready",
      detail: {
        state: "ready",
        detail: {},
        ingresses: [
          {
            hostname: "service-a.test-project-b.local.demo.garden",
            path: "/path-a",
            port: 80,
            protocol: "http",
          },
        ],
      },
      outputs: {},
    },
    "service-c": {
      state: "ready",
      detail: { state: "ready", detail: {} },
      outputs: {},
    },
  }

  return customizedTestPlugin({
    name: "test-plugin",
    createActionTypes: {
      Deploy: [
        {
          name: "test",
          docs: "Test Deploy action",
          schema: zodObjectToJoi(testDeploySchema),
          handlers: {
            deploy: async (params) => {
              const newStatus: DeployStatus = { state: "ready", detail: { state: "ready", detail: {} }, outputs: {} }
              testStatuses[params.action.name] = newStatus
              return newStatus
            },
            getStatus: async (params) => {
              return (
                testStatuses[params.action.name] || {
                  state: "unknown",
                  detail: { state: "unknown", detail: {} },
                  outputs: {},
                }
              )
            },
            plan: async ({ action }) => {
              return {
                state: "ready",
                outputs: {},
                planDescription: `Would deploy ${action.name}`,
                changesSummary: { create: 0, update: 0, delete: 0, unchanged: 1 },
                resourceChanges: [{ key: `Deployment/${action.name}`, operation: "unchanged" as const }],
              }
            },
          },
        },
      ],
      Run: [
        {
          name: "test",
          docs: "Test Run action",
          schema: zodObjectToJoi(testTestSchema),
          handlers: {
            run: async ({}) => {
              return {
                state: "ready",
                outputs: {},
                detail: {
                  success: true,
                  startedAt: placeholderTimestamp,
                  completedAt: placeholderTimestamp,
                  log: "OK",
                },
              }
            },
            plan: async ({ action }) => {
              return {
                state: "ready",
                outputs: {},
                planDescription: `Would run ${action.name}`,
              }
            },
          },
        },
      ],
    },
  })
}

const defaultPlanOpts = withDefaultGlobalOpts({
  force: false,
  skip: undefined,
})

describe("PlanCommand", () => {
  const projectRootB = getDataDir("test-project-b")

  const command = new PlanCommand()

  it("should plan all actions when no keys are provided", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        keys: undefined,
      },
      opts: defaultPlanOpts,
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(result).to.exist

    const keys = getAllProcessedTaskNames(result!.graphResults)

    // Should have plan tasks for deploys, runs, builds
    const planDeployKeys = keys.filter((k) => k.startsWith("plan.") && !k.startsWith("plan-"))
    const _planRunKeys = keys.filter((k) => k.startsWith("plan-run."))
    const _planBuildKeys = keys.filter((k) => k.startsWith("plan-build."))

    expect(planDeployKeys, "Expected plan.* tasks for Deploy").to.not.be.empty
  })

  it("should plan specific deploy action by key", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.service-a"],
      },
      opts: defaultPlanOpts,
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(result).to.exist

    const keys = getAllProcessedTaskNames(result!.graphResults)

    // Should have plan task for service-a
    const planDeployKeys = keys.filter((k) => k.startsWith("plan."))
    expect(planDeployKeys).to.include("plan.service-a")
  })

  it("should support wildcard patterns for action keys", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.*"],
      },
      opts: defaultPlanOpts,
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(result).to.exist

    const keys = getAllProcessedTaskNames(result!.graphResults)

    // Should have plan tasks for all deploys
    const planDeployKeys = keys.filter((k) => k.startsWith("plan.") && !k.startsWith("plan-"))
    expect(planDeployKeys.length).to.be.greaterThan(1)
  })

  it("should support --skip option with patterns", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    // Get all deploy actions first to see what we can skip
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const allDeploys = graph.getDeploys()
    const _deployNames = allDeploys.map((d) => d.name)

    // Get results with all deploys
    const { result: resultAll, errors: errorsAll } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.*"],
      },
      opts: defaultPlanOpts,
    })

    if (errorsAll?.length) {
      throw errorsAll[0]
    }

    // Get results with one deploy skipped
    const { result: resultSkipped, errors: errorsSkipped } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.*"],
      },
      opts: {
        ...defaultPlanOpts,
        skip: ["deploy.service-d"], // Skip a deploy with no dependants
      },
    })

    if (errorsSkipped?.length) {
      throw errorsSkipped[0]
    }

    const keysAll = getAllProcessedTaskNames(resultAll!.graphResults)
    const keysSkipped = getAllProcessedTaskNames(resultSkipped!.graphResults)

    // Should have plan task for service-d in the all results
    expect(keysAll).to.include("plan.service-d")
    // Should NOT have plan task for service-d in the skipped results
    expect(keysSkipped).to.not.include("plan.service-d")
  })

  it("should throw error when no actions match the provided keys", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    try {
      await command.action({
        garden,
        log,
        args: {
          keys: ["deploy.nonexistent-service"],
        },
        opts: defaultPlanOpts,
      })
      expect.fail("Should have thrown an error")
    } catch (error: any) {
      expect(error.message).to.include("No actions found matching")
    }
  })

  it("should return empty results when all actions are skipped", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.service-a"],
      },
      opts: {
        ...defaultPlanOpts,
        skip: ["deploy.*"],
      },
    })

    if (errors?.length) {
      throw errors[0]
    }

    expect(result).to.exist
    expect(result!.success).to.be.true
  })

  it("should have planDescription in results for each planned action", async () => {
    const garden = await makeTestGarden(projectRootB, { plugins: [testProvider()] })
    const log = garden.log

    const { result, errors } = await command.action({
      garden,
      log,
      args: {
        keys: ["deploy.service-a"],
      },
      opts: defaultPlanOpts,
    })

    if (errors?.length) {
      throw errors[0]
    }

    const graphResults = result!.graphResults
    const resultsMap = graphResults as Record<string, any>

    // Verify each plan task result has a planDescription
    for (const [key, taskResult] of Object.entries(resultsMap)) {
      if (!taskResult) continue

      // Skip non-plan tasks (like resolve tasks)
      const isPlanTask =
        key.startsWith("plan.") ||
        key.startsWith("plan-run.") ||
        key.startsWith("plan-test.") ||
        key.startsWith("plan-build.")
      if (!isPlanTask) continue

      const result = (taskResult as any).result
      expect(result, `Task ${key} should have a result`).to.exist
      expect(result.planDescription, `Task ${key} should have planDescription`).to.be.a("string")
    }
  })

  it("should be protected", () => {
    expect(command.protected).to.be.true
  })
})
