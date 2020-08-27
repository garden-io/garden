/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flatten, fromPairs } from "lodash"
import { deepFilter } from "../../util/util"
import { Command, CommandResult, CommandParams } from "../base"
import { Garden } from "../../garden"
import { ConfigGraph } from "../../config-graph"
import { getTaskVersion } from "../../tasks/task"
import { LogEntry } from "../../logger/log-entry"
import { getTestVersion } from "../../tasks/test"
import { runStatus, RunStatus } from "../../types/plugin/base"
import chalk from "chalk"
import { deline } from "../../util/string"
import { EnvironmentStatusMap } from "../../types/plugin/provider/getEnvironmentStatus"
import { ServiceStatus, serviceStatusSchema } from "../../types/service"
import { joi, joiIdentifierMap, joiStringMap } from "../../config/common"
import { environmentStatusSchema } from "../../config/status"

export interface TestStatuses {
  [testKey: string]: RunStatus
}
export interface TaskStatuses {
  [taskKey: string]: RunStatus
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
  services: { [name: string]: ServiceStatus }
  tests: TestStatuses
  tasks: TaskStatuses
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the full status of your environment."

  workflows = true

  outputsSchema = () =>
    joi.object().keys({
      providers: joiIdentifierMap(environmentStatusSchema()).description(
        "A map of statuses for each configured provider."
      ),
      services: joiIdentifierMap(serviceStatusSchema()).description("A map of statuses for each configured service."),
      tasks: joiStringMap(runStatusSchema()).description("A map of statuses for each configured task."),
      tests: joiStringMap(runStatusSchema()).description("A map of statuses for each configured test."),
    })

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult<StatusCommandResult>> {
    const actions = await garden.getActionRouter()

    const envStatus = await garden.getEnvironmentStatus(log)
    const serviceStatuses = await actions.getServiceStatuses({ log })

    let result: StatusCommandResult = {
      providers: envStatus,
      services: serviceStatuses,
      tests: {},
      tasks: {},
    }

    if (opts.output) {
      const graph = await garden.getConfigGraph(log)
      result = {
        ...result,
        ...(await Bluebird.props({
          tests: getTestStatuses(garden, graph, log),
          tasks: getTaskStatuses(garden, graph, log),
        })),
      }
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

async function getTestStatuses(garden: Garden, configGraph: ConfigGraph, log: LogEntry) {
  const modules = await configGraph.getModules()
  const actions = await garden.getActionRouter()

  return fromPairs(
    flatten(
      await Bluebird.map(modules, async (module) => {
        return Bluebird.map(module.testConfigs, async (testConfig) => {
          const testVersion = await getTestVersion(garden, configGraph, module, testConfig)
          const result = await actions.getTestResult({
            module,
            log,
            testVersion,
            testName: testConfig.name,
          })
          return [`${module.name}.${testConfig.name}`, runStatus(result)]
        })
      })
    )
  )
}

async function getTaskStatuses(garden: Garden, configGraph: ConfigGraph, log: LogEntry): Promise<TaskStatuses> {
  const tasks = await configGraph.getTasks()
  const actions = await garden.getActionRouter()

  return fromPairs(
    await Bluebird.map(tasks, async (task) => {
      const taskVersion = await getTaskVersion(garden, configGraph, task)
      const result = await actions.getTaskResult({ task, taskVersion, log })
      return [task.name, runStatus(result)]
    })
  )
}
