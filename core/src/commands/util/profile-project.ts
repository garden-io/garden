/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { printEmoji, printHeader, renderDivider } from "../../logger/util.js"
import { dedent } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import type { ConfigGraph } from "../../graph/config-graph.js"
import indentString from "indent-string"
import type { BaseActionConfig } from "../../actions/types.js"

export class ProfileProjectCommand extends Command {
  name = "profile-project"
  help = "Renders a high-level summary of actions and modules in your project."
  emoji = "📊"

  override description = dedent`
    Useful for diagnosing slow init performance for projects with lots of actions and modules and/or lots of files.
  `

  override printHeader({ log }) {
    printHeader(log, "Profile Project", "️📊")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    const graph = await garden.getConfigGraph({ log, emit: false, statusOnly: true })
    summarizeGraph(log, garden, graph)

    log.info(renderDivider())
    log.info("Summary")
    log.info("")
    log.info("Module config count: " + styles.highlight(Object.keys(graph.moduleGraph.getModules()).length))
    const actionConfigCount = Object.values(graph.getActions()).filter(
      (a) => a.getInternal().moduleName === undefined
    ).length
    log.info("Action config count (excluding those converted from modules): " + styles.highlight(actionConfigCount))
    const trackedFilesInProjectRoot = await garden.vcs.getFiles({
      log,
      path: garden.projectRoot,
      pathDescription: `project root`,
      scanRoot: garden.projectRoot,
    })
    log.info("Total tracked files in project root:" + styles.highlight(trackedFilesInProjectRoot.length))
    log.info("")
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return {}
  }
}

function summarizeGraph(log: CommandParams["log"], garden: CommandParams["garden"], graph: ConfigGraph) {
  if (Object.keys(graph.moduleGraph).length > 0) {
    summarizeModuleGraph(log, graph.moduleGraph)
  }
  summarizeActionGraph(log, graph)
}

const indent = 2

function summarizeModuleGraph(log: CommandParams["log"], moduleGraph: ConfigGraph["moduleGraph"]) {
  const sortedModules = Object.values(moduleGraph.getModules()).sort(
    // We sort the modules by path and then name, so that modules at the same path appear together.
    (m1, m2) => m1.path.localeCompare(m2.path) || m1.name.localeCompare(m2.name)
  )
  for (const module of sortedModules) {
    log.info("Module: " + styles.highlight(module.name) + styles.primary(" (at " + module.path + ")"))
    if (module.include && module.include.length > 0) {
      log.info(indentString(styles.primary("Include: " + JSON.stringify(module.include, null, 2)), indent))
    }
    if (module.exclude && module.exclude.length > 0) {
      log.info(indentString(styles.primary("  Exclude: " + module.exclude), indent))
    }

    log.info(indentString(styles.primary("Tracked file count: ") + module.version.files.length, indent))
    log.info("")
  }
}

function summarizeActionGraph(log: CommandParams["log"], graph: ConfigGraph) {
  const sortedActions = Object.values(graph.getActions())
    // We sort the actions by path and then name, so that actions at the same path appear together.
    .sort((a1, a2) => a1.sourcePath().localeCompare(a2.sourcePath()) || a1.name.localeCompare(a2.name))
    // We only want to show actions that are not converted from modules (since the file scanning cost for converted
    // actions was incurred when scanning files for their parent module).
    .filter((a) => a.getInternal().moduleName === undefined)
  for (const action of sortedActions) {
    const { include, exclude } = action._config as BaseActionConfig
    log.info("Action: " + styles.highlight(action.name) + styles.primary(" (at " + action.sourcePath() + ")"))
    if (action.getInternal().moduleName) {
      log.info(indentString(styles.primary("From module: " + action.getInternal().moduleName), indent))
    }
    if (include && include.length > 0) {
      log.info(indentString(styles.primary("Include: " + JSON.stringify(include, null, 2)), indent))
    }
    if (exclude && exclude.length > 0) {
      log.info(indentString(styles.primary("  Exclude: " + exclude), indent))
    }
    log.info(indentString(styles.primary("Tracked file count: ") + action.getFullVersion().files.length, indent))
    log.info("")
  }
}
