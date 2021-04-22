/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { resolveWorkflowConfig } from "../config/workflow"

export class ValidateCommand extends Command {
  name = "validate"
  help = "Check your garden configuration for errors."
  emoji: "heavy_check_mark"

  description = dedent`
    Throws an error and exits with code 1 if something's not right in your garden.yml files.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Validate", "heavy_check_mark")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    await garden.getConfigGraph(log)

    /*
     * Normally, workflow configs are only resolved when they're run via the `run workflow` command (and only the
     * workflow being run).
     *
     * Here, we want to validate all workflow configs (so we try resolving them all).
     */
    const rawWorkflowConfigs = await garden.getRawWorkflowConfigs()
    for (const config of rawWorkflowConfigs) {
      resolveWorkflowConfig(garden, config)
    }

    return {}
  }
}
