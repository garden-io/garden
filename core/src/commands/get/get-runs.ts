/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { StringsParameter } from "../../cli/params"
import { makeGetTestOrTaskLog } from "../helpers"
import { ActionDescriptionMap } from "../../actions/base"
import { keyBy } from "lodash"

const getRunsArgs = {
  names: new StringsParameter({
    help: "Specify run(s)/task(s) to list. You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Run)
    },
  }),
}

type Args = typeof getRunsArgs

export class GetRunsCommand extends Command<Args, {}, ActionDescriptionMap> {
  name = "runs"
  help = "Lists the Runs (or tasks, if using modules) defined in your project."
  aliases = ["tasks"]

  // TODO-0.13.0: add output schema

  arguments = getRunsArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Runs", "📖")
  }

  async action({ args, garden, log }: CommandParams<Args>): Promise<CommandResult<ActionDescriptionMap>> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const actions = graph.getRuns({ names: args.names })

    if (actions.length > 0) {
      const logStr = makeGetTestOrTaskLog(actions)
      log.info(logStr.trim())
    } else {
      log.info(`No Run actions defined for project ${garden.projectName}`)
    }

    return {
      result: keyBy(
        actions.map((t) => t.describe()),
        "key"
      ),
    }
  }
}
