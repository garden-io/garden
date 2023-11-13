/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printEmoji, printHeader } from "../logger/util.js"
import { dedent } from "../util/string.js"
import { styles } from "../logger/styles.js"
import { resolveWorkflowConfig } from "../config/workflow.js"

export class ValidateCommand extends Command {
  name = "validate"
  help = "Check your garden configuration for errors."
  emoji = "✔️"

  override aliases = ["scan"]

  override description = dedent`
    Throws an error and exits with code 1 if something's not right in your garden config files.
  `

  override printHeader({ log }) {
    printHeader(log, "Validate", "✔️")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    // This implicitly validates modules and actions.
    await garden.getResolvedConfigGraph({ log, emit: false })

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
