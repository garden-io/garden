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

const getTestsArgs = {
  tests: new StringsParameter({
    help: "Specify tests(s) to list. Use comma as a separator to specify multiple tests.",
  }),
}

type Args = typeof getTestsArgs

export class GetTestsCommand extends Command<Args> {
  name = "tests"
  help = "Lists the tests defined in your project's modules."

  arguments = getTestsArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Tests", "open_book")
  }

  async action({ args, garden, log }: CommandParams<Args>): Promise<CommandResult> {
    const graph = await garden.getConfigGraph(log)
    const tests = graph.getTests({ names: args.tests })
    const testModuleNames = uniq(tests.map((t) => t.module.name))
    const modules = sortBy(graph.getModules({ names: testModuleNames }), (m) => m.name)

    const testListing = makeGetTestOrTaskResult(modules, tests)

    if (testListing.length > 0) {
      const logStr = makeGetTestOrTaskLog(modules, tests, "tests")
      log.info(logStr.trim())
    } else {
      log.info(`No tests defined for project ${garden.projectName}`)
    }

    return { result: testListing }
  }
}
