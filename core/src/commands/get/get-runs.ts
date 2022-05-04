/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { StringsParameter } from "../../cli/params"
import { makeGetTestOrTaskLog } from "../helpers"

const getRunsArgs = {
  names: new StringsParameter({
    help: "Specify run(s)/task(s) to list. Use comma as a separator to specify multiple names.",
  }),
}

type Args = typeof getRunsArgs

export class GetRunsCommand extends Command<Args> {
  name = "runs"
  help = "Lists the Runs (or tasks, if using modules) defined in your project."
  aliases = ["tasks"]

  arguments = getRunsArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Runs", "open_book")
  }

  async action({ args, garden, log }: CommandParams<Args>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const actions = graph.getRuns({ names: args.names })

    if (actions.length > 0) {
      const logStr = makeGetTestOrTaskLog(actions)
      log.info(logStr.trim())
    } else {
      log.info(`No tests defined for project ${garden.projectName}`)
    }

    return { result: actions.map((t) => t.describe()) }
  }
}
