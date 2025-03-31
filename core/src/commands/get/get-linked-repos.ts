/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sortBy } from "lodash-es"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import type { LinkedSource } from "../../config-store/local.js"
import { printHeader } from "../../logger/util.js"
import { getLinkedSources } from "../../util/ext-source-util.js"
import { renderTable } from "../../util/string.js"
import { styles } from "../../logger/styles.js"

const getLinkedReposArguments = {}

type Args = typeof getLinkedReposArguments

export class GetLinkedReposCommand extends Command {
  name = "linked-repos"
  help = "Outputs a list of all linked remote sources, actions and modules for this project."

  override printHeader({ log }) {
    printHeader(log, "List linked actions, modules and project sources", "📖")
  }

  async action({ garden, log }: CommandParams<Args>): Promise<CommandResult<LinkedSource[]>> {
    const linkedProjectSources = sortBy(await getLinkedSources(garden, "project"), (s) => s.name)
    const linkedActionSources = sortBy(await getLinkedSources(garden, "action"), (s) => s.name)
    const linkedModuleSources = sortBy(await getLinkedSources(garden, "module"), (s) => s.name)

    const linkedSources = [...linkedProjectSources, ...linkedActionSources, ...linkedModuleSources]

    log.info("")

    if (linkedSources.length === 0) {
      log.info("No linked sources, actions or modules found for this project.")
    } else {
      const linkedSourcesWithType = [
        ...linkedProjectSources.map((s) => ({ ...s, type: "source" })),
        ...linkedActionSources.map((s) => ({ ...s, type: "action" })),
        ...linkedModuleSources.map((s) => ({ ...s, type: "module" })),
      ]

      const rows = [
        [styles.bold("Name:"), styles.bold("Type:"), styles.bold("Path:")],
        ...linkedSourcesWithType.map((s) => [
          styles.highlight.bold(s.name),
          styles.highlight.bold(s.type),
          s.path.trim(),
        ]),
      ]

      log.info(renderTable(rows))
    }

    return { result: linkedSources }
  }
}
