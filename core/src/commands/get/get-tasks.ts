/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sortBy, uniq } from "lodash"
import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { StringsParameter } from "../../cli/params"
import { makeGetTestOrTaskLog, makeGetTestOrTaskResult } from "../helpers"

const getTasksArgs = {
  tasks: new StringsParameter({
    help: "Specify task(s) to list. Use comma as a separator to specify multiple tasks.",
  }),
}

type Args = typeof getTasksArgs

export class GetTasksCommand extends Command<Args> {
  name = "tasks"
  help = "Lists the tasks defined in your project's modules."

  arguments = getTasksArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Tasks", "open_book")
  }

  async action({ args, garden, log }: CommandParams<Args>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph(log)
    const tasks = graph.getTasks({ names: args.tasks })
    const taskModuleNames = uniq(tasks.map((t) => t.module.name))
    const modules = sortBy(graph.getModules({ names: taskModuleNames }), (m) => m.name)

    const taskListing = makeGetTestOrTaskResult(modules, tasks)

    if (taskListing.length > 0) {
      const logStr = makeGetTestOrTaskLog(modules, tasks, "tasks")
      log.info(logStr.trim())
    } else {
      log.info(`No tasks defined for project ${garden.projectName}`)
    }

    return { result: taskListing }
  }
}
