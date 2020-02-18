/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { sortBy } from "lodash"
import { Command, CommandParams, CommandResult } from "../base"
import { LinkedSource } from "../../config-store"
import { printHeader } from "../../logger/util"
import { getLinkedSources } from "../../util/ext-source-util"
import { renderTable } from "../../util/string"

const getRemoteSourcesArguments = {}

type Args = typeof getRemoteSourcesArguments

export class GetRemoteSourcesCommand extends Command {
  name = "remote-sources"
  help = "Outputs a list of all linked remote sources and modules for this project."

  async action({ garden, log, headerLog }: CommandParams<Args>): Promise<CommandResult<LinkedSource[]>> {
    printHeader(headerLog, "List linked modules and sources", "open_book")

    const linkedProjectSources = sortBy(await getLinkedSources(garden, "project"), (s) => s.name)
    const linkedModuleSources = sortBy(await getLinkedSources(garden, "module"), (s) => s.name)

    const linkedSources = [...linkedProjectSources, ...linkedModuleSources]

    log.info("")

    if (linkedSources.length === 0) {
      log.info(chalk.white("No linked sources or modules found for this project."))
    } else {
      const linkedSourcesWithType = [
        ...linkedProjectSources.map((s) => ({ ...s, type: "source" })),
        ...linkedModuleSources.map((s) => ({ ...s, type: "module" })),
      ]

      const rows = [
        [chalk.bold("Name:"), chalk.bold("Type:"), chalk.bold("Path:")],
        ...linkedSourcesWithType.map((s) => [chalk.cyan.bold(s.name), chalk.cyan.bold(s.type), s.path.trim()]),
      ]

      log.info(renderTable(rows))
    }

    return { result: linkedSources }
  }
}
