/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { flatten, fromPairs } from "lodash"
import { deepFilter } from "../../util/util"
import {
  Command,
  CommandResult,
  CommandParams,
} from "../base"
import { EnvironmentStatus } from "../../actions"
import { Garden } from "../../garden"
import { ConfigGraph } from "../../config-graph"
import { getTaskVersion } from "../../tasks/task"
import { LogEntry } from "../../logger/log-entry"
import { getTestVersion } from "../../tasks/test"

type RunStatus = "not-completed" | "completed"

interface TestStatuses { [testKey: string]: RunStatus }
interface TaskStatuses { [taskKey: string]: RunStatus }

// Value is "completed" if the test/task has been run for the current version.
export interface StatusCommandResult extends EnvironmentStatus {
  testStatuses: TestStatuses
  taskStatuses: TaskStatuses
}

export class GetStatusCommand extends Command {
  name = "status"
  help = "Outputs the status of your environment."

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult<EnvironmentStatus>> {
    const status = await garden.actions.getStatus({ log })

    let result
    if (opts.output) {
      const graph = await garden.getConfigGraph()
      result = await Bluebird.props({
        ...status,
        testStatuses: getTestStatuses(garden, graph, log),
        taskStatuses: getTaskStatuses(garden, graph, log),
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
  return fromPairs(flatten(await Bluebird.map(modules, async (module) => {
    return Bluebird.map(module.testConfigs, async (testConfig) => {
      const testVersion = await getTestVersion(garden, configGraph, module, testConfig)
      const done = !!(await garden.actions.getTestResult({
        module, log, testVersion, testName: testConfig.name,
      }))
      return [`${module.name}.${testConfig.name}`, done ? "completed" : "not-completed"]
    })
  })))
}

async function getTaskStatuses(garden: Garden, configGraph: ConfigGraph, log: LogEntry): Promise<TaskStatuses> {
  const tasks = await configGraph.getTasks()
  return fromPairs(await Bluebird.map(tasks, async (task) => {
    const taskVersion = await getTaskVersion(garden, configGraph, task)
    const done = !!(await garden.actions.getTaskResult({ task, taskVersion, log }))
    return [task.name, done ? "completed" : "not-completed"]
  }))
}
