/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { fromPairs } from "lodash"
import { deepFilter } from "../../util/util"
import { Command, CommandResult, CommandParams } from "../base"
import { Garden } from "../../garden"
import { ConfigGraph } from "../../graph/config-graph"
import { LogEntry } from "../../logger/log-entry"
import { runStatus, RunStatus } from "../../plugin/base"
import chalk from "chalk"
import { deline } from "../../util/string"
import { EnvironmentStatusMap } from "../../plugin/handlers/provider/getEnvironmentStatus"
import { ServiceStatus, serviceStatusSchema } from "../../types/service"
import { joi, joiIdentifierMap, joiStringMap } from "../../config/common"
import { environmentStatusSchema } from "../../config/status"
import { printHeader } from "../../logger/util"

export interface TestStatuses {
  [key: string]: RunStatus
}
export interface RunStatuses {
  [key: string]: RunStatus
}

const runStatusSchema = () =>
  joi.object().keys({
    state: joi.string().allow("outdated", "succeeded", "failed", "not-implemented").required(),
    startedAt: joi.date().description("When the last run was started (if applicable)."),
    completedAt: joi.date().description("When the last run completed (if applicable)."),
  })

// Value is "completed" if the test/task has been run for the current version.
export interface StatusCommandResult {
  providers: EnvironmentStatusMap
  actions: {
    // build: { [key: string]: BuildStatus } // TODO
    deploy: { [name: string]: ServiceStatus }
    run: RunStatuses
    test: TestStatuses
  }
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the full status of your project/environment."

  streamEvents = true

  outputsSchema = () =>
    joi.object().keys({
      providers: joiIdentifierMap(environmentStatusSchema()).description(
        "A map of statuses for each configured provider."
      ),
      services: joiIdentifierMap(serviceStatusSchema()).description("A map of statuses for each configured service."),
      tasks: joiStringMap(runStatusSchema()).description("A map of statuses for each configured task."),
      tests: joiStringMap(runStatusSchema()).description("A map of statuses for each configured test."),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get status", "pager")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult<StatusCommandResult>> {
    const actions = await garden.getActionRouter()
    const graph = await garden.getConfigGraph({ log, emit: true })

    const envStatus = await garden.getEnvironmentStatus(log)
    const serviceStatuses = await actions.getDeployStatuses({ log, graph })

    let result: StatusCommandResult = {
      providers: envStatus,
      actions: await Bluebird.props({
        deploy: actions.getDeployStatuses({ log, graph }),
        test: getTestStatuses(garden, graph, log),
        run: getTaskStatuses(garden, graph, log),
      }),
    }

    for (const [name, serviceStatus] of Object.entries(serviceStatuses)) {
      if (serviceStatus.state === "unknown") {
        log.warn(
          chalk.yellow(
            deline`
            Unable to resolve status for service ${chalk.white(name)}. It is likely missing or outdated.
            This can come up if the service has runtime dependencies that are not resolvable, i.e. not deployed or
            invalid.
            `
          )
        )
      }
    }

    // TODO: we should change the status format because this will remove services called "detail"
    const withoutDetail = deepFilter(result, (_, key) => key !== "detail")

    // TODO: do a nicer print of this by default
    log.info({ data: withoutDetail })

    return { result }
  }
}

async function getTestStatuses(garden: Garden, configGraph: ConfigGraph, log: LogEntry): Promise<RunStatuses> {
  const actions = configGraph.getTests()
  const router = await garden.getActionRouter()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const { detail } = await router.test.getResult({ action, log, graph: configGraph })
      return [action.name, runStatus(detail)]
    })
  )
}

async function getTaskStatuses(garden: Garden, configGraph: ConfigGraph, log: LogEntry): Promise<RunStatuses> {
  const actions = configGraph.getRuns()
  const router = await garden.getActionRouter()

  return fromPairs(
    await Bluebird.map(actions, async (action) => {
      const { detail } = await router.run.getResult({ action, log, graph: configGraph })
      return [action.name, runStatus(detail)]
    })
  )
}
