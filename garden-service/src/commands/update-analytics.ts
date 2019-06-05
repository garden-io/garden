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
} from "./base"
import dedent = require("dedent")
import { Analytics } from "../analytics/analytics"

export class UpdateAnalyticsCommand extends Command {
  name = "update-analytics"
  help = "Update your preferences regarding analytics."

  description = dedent`
    Update your preferences regarding analytics: opt-in, opt-out.
  `

  async action({ garden }: CommandParams): Promise<CommandResult> {
    const { analytics } = await garden.globalConfigStore.get()
    const optedIn = analytics && analytics.optedIn
    const message = dedent`
      Thanks for using garden. You opted-${optedIn ? "in" : "out"} our analytics collection.
      Are you ${optedIn ? "still" : "now"} ok with us collecting anonymized cli usage data?
    `
    const analyticsClient = await new Analytics(garden).init()
    await analyticsClient.toggleAnalytics(message)
    return {}
  }
}
