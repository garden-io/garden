/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PluginCommand } from "../../../plugin/command"

export const cleanupClusterRegistry: PluginCommand = {
  name: "cleanup-cluster-registry",
  description: "[NO LONGER USED]",

  title: "Cleaning up caches and unused images from the in-cluster registry",

  handler: async ({ log }) => {
    const result = {}

    log.warn({
      symbol: "warning",
      msg: chalk.yellow(
        "This command no longer has any effect as of version 0.13! You probably want to remove this from any pipelines running it :)"
      ),
    })

    return { result }
  },
}
