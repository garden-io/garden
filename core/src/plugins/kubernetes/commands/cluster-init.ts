/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginCommand } from "../../../plugin/command.js"
import { prepareEnvironment, getEnvironmentStatus } from "../init.js"
import chalk from "chalk"
import { emitNonRepeatableWarning } from "../../../warnings.js"

// TODO: remove in 0.14
export const clusterInit: PluginCommand = {
  name: "cluster-init",
  description: "[DEPRECATED] Initialize or update cluster-wide Garden services.",

  title: ({ environmentName }) => {
    return `Initializing/updating cluster-wide services for ${chalk.white(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    emitNonRepeatableWarning(log, "This command is now deprecated and will be removed in Garden 0.14.")

    const status = await getEnvironmentStatus({ ctx, log })
    let result = {}

    if (status.ready) {
      log.info("All services already initialized!")
    } else {
      result = await prepareEnvironment({
        ctx,
        log,
        force: true,
        status,
      })
    }

    log.info(chalk.green("\nDone!"))

    return { result }
  },
}
