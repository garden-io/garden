/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printEmoji, printHeader } from "../logger/util.js"
import { dedent, deline } from "../util/string.js"
import { styles } from "../logger/styles.js"
import { resolveWorkflowConfig } from "../config/workflow.js"
import { StringsParameter } from "../cli/params.js"
import type { ConfigGraph } from "../graph/config-graph.js"

const validateOpts = {
  resolve: new StringsParameter({
    help: deline`
      Fully resolve a specific action, including references to runtime outputs from other actions. Actions should be specified as \`<kind>.<name>\` (e.g. \`deploy.my-service\` or \`build.my-image\`). This option can be specified multiple times to fully resolve multiple actions. Use * to fully resolve all actions. Note that this may result in actions being executed during validation (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, we recommend not using this option.
    `,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs)
    },
  }),
}

type Opts = typeof validateOpts

export class ValidateCommand extends Command<{}, Opts> {
  name = "validate"
  help = "Check your garden configuration for errors."
  emoji = "✔️"

  override aliases = ["scan"]

  override description = dedent`
    Throws an error and exits with code 1 if something's not right in your garden config files.

    Examples:

        garden validate                              # validate all configs, but don't fully resolve any actions
        garden validate --resolve build.my-image     # same as above, but fully resolve the build.my-image action
        garden validate --resolve deploy.my-service
        garden validate --resolve '*'                # fully resolve all actions
        garden validate --resolve                    # fully resolve all actions
  `

  override options = validateOpts

  override printHeader({ log }) {
    printHeader(log, "Validate", "✔️")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult> {
    // This implicitly validates modules and actions.
    const { resolve } = opts
    const graph = await garden.getConfigGraph({ log, emit: false, statusOnly: true })
    if (resolve) {
      const actionsToResolve = getActionsToResolve(resolve, graph)
      await garden.resolveActions({ actions: actionsToResolve, graph, log })
    }

    /*
     * Normally, workflow configs are only resolved when they're run via the `workflow` command (and only the
     * workflow being run).
     *
     * Here, we want to validate all workflow configs (so we try resolving them all).
     */
    const rawWorkflowConfigs = await garden.getRawWorkflowConfigs()
    for (const config of rawWorkflowConfigs) {
      resolveWorkflowConfig(garden, config)
    }

    log.info("")
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return {}
  }
}

export function getActionsToResolve(toResolve: string[] | undefined, graph: ConfigGraph) {
  return !toResolve || toResolve.length === 0 || toResolve?.[0] === "*"
    ? graph.getActions()
    : graph.getActions({ refs: toResolve })
}
