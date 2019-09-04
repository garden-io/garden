/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flatten, fromPairs } from "lodash"
import { deepFilter } from "../../util/util"
import { Command, CommandResult, CommandParams } from "../base"
import { AllEnvironmentStatus } from "../../actions"
import { Garden } from "../../garden"
import { ConfigGraph } from "../../config-graph"
import { getTaskVersion } from "../../tasks/task"
import { LogEntry } from "../../logger/log-entry"
import { getTestVersion } from "../../tasks/test"
import { RunResult } from "../../types/plugin/base"

export type RunState = "outdated" | "succeeded" | "failed"

export interface RunStatus {
  state: RunState
  startedAt?: Date
  completedAt?: Date
}

export interface TestStatuses {
  [testKey: string]: RunStatus
}
export interface TaskStatuses {
  [taskKey: string]: RunStatus
}

// Value is "completed" if the test/task has been run for the current version.
export interface StatusCommandResult extends AllEnvironmentStatus {
  tests: TestStatuses
  tasks: TaskStatuses
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the status of your environment."

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult<AllEnvironmentStatus>> {
    const actions = await garden.getActionRouter()
    const status = await actions.getStatus({ log })

    let result: AllEnvironmentStatus

    if (opts.output) {
      const graph = await garden.getConfigGraph()
      result = await Bluebird.props({
        ...status,
        tests: getTestStatuses(garden, graph, log),
        tasks: getTaskStatuses(garden, graph, log),
      })
    } else {
      result = status
    }

    // TODO: we should change the status format because this will remove services called "detail"
    const withoutDetail = deepFilter(status, (_, key) => key !== "detail")

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

function runStatus<R extends RunResult>(result: R | null): RunStatus {
  if (result) {
    const { startedAt, completedAt } = result
    return {
      startedAt,
      completedAt,
      state: result.success ? "succeeded" : "failed",
    }
  } else {
    return { state: "outdated" }
  }
}
