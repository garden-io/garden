/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenError } from "../exceptions.js"
import { dedent } from "../util/string.js"
import { styles } from "../logger/styles.js"
import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import { getCloudDistributionName, getCloudLogSectionName } from "./util.js"

class LoginRequiredWhenConnected extends GardenError {
  override type = "login-required"

  constructor() {
    super({
      message: dedent`
        ${styles.primary(
          `Login required: This project is connected to Garden Cloud. Please run ${styles.command("garden login")} to authenticate or set the ${styles.highlight("GARDEN_AUTH_TOKEN")} environment variable.`
        )}

        ${styles.secondary(
          `NOTE: If you cannot log in right now, use the option ${styles.command("--offline")} or the environment variable ${styles.command("GARDEN_OFFLINE=true")} to enable offline mode. Team Cache and Container Builder won't be available in offline mode.`
        )}
      `,
    })
  }
}

export function enforceLogin({
  garden,
  log,
  isOfflineModeEnabled,
}: {
  garden: Garden
  log: Log
  isOfflineModeEnabled: boolean
}) {
  const { id: projectId, organizationId } = garden.getProjectConfig()
  const isConnectedToCloud = !!projectId || !!organizationId

  const isLoggedIn = garden.isLoggedIn()

  const distroName = getCloudDistributionName(garden.cloudDomain)

  if (isConnectedToCloud && !isLoggedIn && !isOfflineModeEnabled) {
    throw new LoginRequiredWhenConnected()
  }

  if (!isConnectedToCloud && !isOfflineModeEnabled) {
    // TODO(0.14): Also print this at the end of the command output to increase visibility.
    const cloudLog = log.createLog({ name: getCloudLogSectionName(distroName) })
    cloudLog.info({
      msg: `Did you know that ${styles.highlight("Team Cache")} and ${styles.highlight("Container Builder")} can accelerate your container builds and skip repeated execution of tests?`,
    })
    cloudLog.warn({
      msg: `Run ${styles.command("garden login")} to connect your project to ${distroName}.`,
    })
  }
}
