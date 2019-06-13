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
  activeteAnalytics: new BooleanParameter({
    help: "Enable analitics, defaults to \"true\"",
    defaultValue: true,
  }),
}

type Args = typeof configAnalyticsEnabledArgs

export class ConfigAnalyticsEnabled extends Command {
  name = "analytics-enabled"
  help = "Update your preferences regarding analytics."

  arguments = configAnalyticsEnabledArgs

  description = dedent`
    Update your preferences regarding analytics: .
  `

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult> {

    const analyticsClient = await new Analytics(garden).init()
    await analyticsClient.setAnalyticsOptIn(args.activeteAnalytics)

    if (args.activeteAnalytics) {
      log.setSuccess(`Thanks for helping us make Garden better. The analytics are now active.`)
    } else {
      log.setSuccess(`The collection of anonymous CLI usage data is now disabled.`)
    }

    return {}
  }
}
