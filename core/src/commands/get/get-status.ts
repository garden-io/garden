/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs, omit } from "lodash-es"
import { deepFilter } from "../../util/objects.js"
import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import type { ResolvedConfigGraph } from "../../graph/config-graph.js"
import type { Log } from "../../logger/log-entry.js"
import { createActionLog } from "../../logger/log-entry.js"
import { deline } from "../../util/string.js"
import type { EnvironmentStatusMap } from "../../plugin/handlers/Provider/getEnvironmentStatus.js"
import { joi, joiIdentifierMap, joiStringMap } from "../../config/common.js"
import { environmentStatusSchema } from "../../config/status.js"
import { printHeader } from "../../logger/util.js"
import type { BuildStatusMap } from "../../plugin/handlers/Build/get-status.js"
import { getBuildStatusSchema } from "../../plugin/handlers/Build/get-status.js"
import type { TestStatusMap } from "../../plugin/handlers/Test/get-result.js"
import { getTestResultSchema } from "../../plugin/handlers/Test/get-result.js"
import type { RunStatusMap } from "../../plugin/handlers/Run/get-result.js"
import { getRunResultSchema } from "../../plugin/handlers/Run/get-result.js"
import type { DeployStatusMap } from "../../plugin/handlers/Deploy/get-status.js"
import { getDeployStatusSchema } from "../../plugin/handlers/Deploy/get-status.js"
import type { ActionRouter } from "../../router/router.js"
import { sanitizeValue } from "../../util/logging.js"
import { BooleanParameter } from "../../cli/params.js"
import { styles } from "../../logger/styles.js"

// Value is "completed" if the test/task has been run for the current version.
export interface StatusCommandResult {
  providers: EnvironmentStatusMap
  actions: {
    Build: BuildStatusMap
    Deploy: DeployStatusMap
    Run: RunStatusMap
    Test: TestStatusMap
  }
}

const getStatusOpts = {
  "skip-detail": new BooleanParameter({
    help: deline`
      Skip plugin specific details. Only applicable when using the --output=json|yaml option.
      Useful for trimming down the output.
    `,
  }),
  "only-deploys": new BooleanParameter({
    hidden: true,
    help: deline`
      [INTERNAL]: Only return statuses of deploy actions. Currently only used by Cloud and Desktop apps.
      Will be replaced by a new, top level \`garden status\` command.
    `,
  }),
}

type Opts = typeof getStatusOpts

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the full status of your project/environment and all actions."

  override streamEvents = false
  override options = getStatusOpts

  override outputsSchema = () =>
    joi.object().keys({
      providers: joiIdentifierMap(environmentStatusSchema()).description(
        "A map of statuses for each configured provider."
      ),
      actions: joi.object().keys({
        Build: joiIdentifierMap(getBuildStatusSchema()).description("A map of statuses for each configured Build."),
        Deploy: joiIdentifierMap(getDeployStatusSchema()).description("A map of statuses for each configured Deploy."),
        Run: joiStringMap(getRunResultSchema()).description("A map of statuses for each configured Run."),
        Test: joiStringMap(getTestResultSchema()).description("A map of statuses for each configured Test."),
      }),
    })

  override printHeader({ log }) {
    printHeader(log, "Get status", "📟")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<StatusCommandResult>> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })

    let result: StatusCommandResult
    if (opts["only-deploys"]) {
      result = {
        providers: {},
        actions: {
          Build: {},
          Deploy: await getDeployStatuses(router, graph, log),
          Test: {},
          Run: {},
        },
      }
    } else {
      const envStatus = await garden.getEnvironmentStatus(log)
      const [buildStatuses, deployStatuses, testStatuses, runStatuses] = await Promise.all([
        getBuildStatuses(router, graph, log),
        getDeployStatuses(router, graph, log),
        getTestStatuses(router, graph, log),
        getRunStatuses(router, graph, log),
      ])
      result = {
        providers: envStatus,
        actions: {
          Build: buildStatuses,
          Deploy: deployStatuses,
          Test: testStatuses,
          Run: runStatuses,
        },
      }
    }

    const finalDeployStatuses = result.actions.Deploy

    for (const [name, status] of Object.entries(finalDeployStatuses)) {
      if (status.state === "unknown") {
        log.warn(
          deline`
            Unable to resolve status for Deploy ${styles.highlight(name)}. It is likely missing or outdated.
            This can come up if the deployment has runtime dependencies that are not resolvable, i.e. not deployed or
            invalid.
            `
        )
      }
    }

    // We only skip detail for Deploy actions. Note that this is mostly used internally and that this command
    // will be replaced by a top-level "garden status" command. For that one we'll probably wan to pass the
    // --skip-detail flag to the plugin handlers.
    if (opts["skip-detail"]) {
      const deployActions = Object.entries(result.actions["Deploy"]).reduce(
        (acc, val) => {
          const [name, status] = val
          const statusWithOutDetail = omit(status, "detail.detail")
          acc[name] = statusWithOutDetail

          return acc
        },
        {} as StatusCommandResult["actions"]["Deploy"]
      )
      result["actions"]["Deploy"] = deployActions
    }

    // TODO: we should change the status format because this will remove services called "detail"
    const sanitized = sanitizeValue(deepFilter(result, (_, key) => key !== "executedAction"))

    // TODO: do a nicer print of this by default
    log.info({ data: sanitized })

    return { result: sanitized }
  }
}

export async function getDeployStatuses(
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
): Promise<DeployStatusMap> {
  const actions = graph.getDeploys()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, action })
        const { result } = await router.deploy.getStatus({ action, log: actionLog, graph })
        return [action.name, result]
      })
    )
  )
}
async function getBuildStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log) {
  const actions = graph.getBuilds()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, action })
        const { result } = await router.build.getStatus({ action, log: actionLog, graph })
        return [action.name, result]
      })
    )
  )
}

async function getTestStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log): Promise<TestStatusMap> {
  const actions = graph.getTests()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, action })
        const { result } = await router.test.getResult({ action, log: actionLog, graph })
        return [action.name, result]
      })
    )
  )
}

async function getRunStatuses(router: ActionRouter, graph: ResolvedConfigGraph, log: Log): Promise<RunStatusMap> {
  const actions = graph.getRuns()

  return fromPairs(
    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, action })
        const { result } = await router.run.getResult({ action, log: actionLog, graph })
        return [action.name, result]
      })
    )
  )
}
