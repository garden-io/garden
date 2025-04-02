/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import dedent from "dedent"
import { BooleanParameter } from "../../cli/params.js"

const configAnalyticsEnabledArgs = {
  enable: new BooleanParameter({
    help: 'Enable analytics. Defaults to "true"',
    defaultValue: true,
  }),
}

type Args = typeof configAnalyticsEnabledArgs

export class ConfigAnalyticsEnabled extends Command {
  name = "analytics-enabled"
  override noProject = true
  help = "Update your preferences regarding analytics."

  override arguments = configAnalyticsEnabledArgs

  override description = dedent`
    To help us make Garden better, we collect some analytics data about its usage.
    We make sure all the data collected is anonymized and stripped of sensitive
    information. We collect data about which commands are run, what tasks they trigger,
    which API calls are made to your local Garden server, as well as some info
    about the environment in which Garden runs.

    You will be asked if you want to opt out when running Garden for the
    first time and you can use this command to update your preferences later.

    Examples:

        garden config analytics-enabled true   # enable analytics
        garden config analytics-enabled false  # disable analytics
  `

  // Skip printing header
  override printHeader() {}

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {
    const analyticsClient = await garden.getAnalyticsHandler()
    await analyticsClient.setAnalyticsOptOut(!args.enable)

    if (args.enable) {
      log.success(`Thanks for helping us make Garden better! Anonymized analytics collection is now active.`)
    } else {
      log.success(`The collection of anonymous CLI usage data is now disabled.`)
    }

    return {}
  }
}
