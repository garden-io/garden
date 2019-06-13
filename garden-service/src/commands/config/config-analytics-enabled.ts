/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandParams,
  CommandResult,
  BooleanParameter,
} from "../base"
import dedent = require("dedent")
import { Analytics } from "../../analytics/analytics"

const configAnalyticsEnabledArgs = {
  enableAnalytics: new BooleanParameter({
    help: "Enable analytics, defaults to \"true\"",
    defaultValue: true,
  }),
}

type Args = typeof configAnalyticsEnabledArgs

export class ConfigAnalyticsEnabled extends Command {
  name = "analytics-enabled"
  help = "Update your preferences regarding analytics."

  arguments = configAnalyticsEnabledArgs

  description = dedent`
    Update your preferences regarding analytics.

    To help us make Garden better you can opt in to the collection of CLI usage data.
    We make sure all the data collected is anonymized and stripped out of sensitive
    informations.We collect data about which commands are run, what tasks they trigger,
    the Api calls the dashboard make to your local Garden server as well as some info
    about the environment in which Garden runs.

    You will be asked if you want to opt-in when running Garden for the
    first time and you can use this command to update your preferences later.
    To do so, please run:
      $ garden config analytics-enabled <true/false> (default=true)
  `

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {

    const analyticsClient = await new Analytics(garden).init()
    await analyticsClient.setAnalyticsOptIn(args.enableAnalytics)

    if (args.enableAnalytics) {
      log.setSuccess(`Thanks for helping us make Garden better. The analytics are now enabled.`)
    } else {
      log.setSuccess(`The collection of anonymous CLI usage data is now disabled.`)
    }

    return {}
  }
}
