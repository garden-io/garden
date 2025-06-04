/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { ConfigAnalyticsEnabled } from "./config-analytics-enabled.js"

export class ConfigCommand extends CommandGroup {
  name = "config"
  help = "Configure user and project settings."

  subCommands = [ConfigAnalyticsEnabled]
}
