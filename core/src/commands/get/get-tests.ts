/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sortBy } from "lodash"
import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { StringsParameter } from "../../cli/params"
import { makeGetTestOrTaskLog } from "../helpers"

const getTestsArgs = {
  names: new StringsParameter({
    help: "Specify tests(s) to list. Use comma as a separator to specify multiple tests.",
  }),
}

type Args = typeof getTestsArgs

export class GetTestsCommand extends Command<Args> {
  name = "tests"
  help = "Lists the tests defined in your project."

  arguments = getTestsArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Tests", "open_book")
  }

  async action({ args, garden, log }: CommandParams<Args>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const actions = sortBy(graph.getTests({ names: args.names }), "name")

    if (actions.length > 0) {
      const logStr = makeGetTestOrTaskLog(actions)
      log.info(logStr.trim())
    } else {
      log.info(`No tests defined for project ${garden.projectName}`)
    }

    return { result: actions.map((t) => t.describe()) }
  }
}
