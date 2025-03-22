/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginCommand } from "../../../plugin/command.js"
import { prepareEnvironment, getEnvironmentStatus } from "../init.js"
import { styles } from "../../../logger/styles.js"
import { reportDeprecatedFeatureUsage } from "../../../util/deprecations.js"

// TODO: remove in 0.14
const commandName = "cluster-init"

export const clusterInit: PluginCommand = {
  name: commandName,
  description: "[DEPRECATED] Initialize or update cluster-wide Garden services.",

  title: ({ environmentName }) => {
    return `Initializing/updating cluster-wide services for ${styles.highlight(environmentName)} environment`
  },

  handler: async ({ ctx, log }) => {
    reportDeprecatedFeatureUsage({
      log,
      deprecation: "kubernetesClusterInitCommand",
    })

    const status = await getEnvironmentStatus({ ctx, log })
    let result = {}

    if (status.ready) {
      log.info("All services already initialized!")
    } else {
      result = await prepareEnvironment({
        ctx,
        log,
        force: true,
      })
    }

    log.success({ msg: "\nDone!", showDuration: false })

    return { result }
  },
}
