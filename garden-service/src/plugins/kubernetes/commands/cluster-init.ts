/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginCommand } from "../../../types/plugin/command"
import { prepareSystem, getEnvironmentStatus } from "../init"
import chalk from "chalk"

export const clusterInit: PluginCommand = {
  name: "cluster-init",
  description: "Initialize or update cluster-wide Garden services.",

  title: ({ environmentName }) => {
    return `Initializing/updating cluster-wide services for ${chalk.white(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    const status = await getEnvironmentStatus({ ctx, log })
    let result = {}

    if (status.ready) {
      log.info("All services already initialized!")
    } else {
      result = await prepareSystem({
        ctx,
        log,
        force: true,
        status,
        clusterInit: true,
      })
    }

    log.info(chalk.green("\nDone!"))

    return { result }
  },
}
