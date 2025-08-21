/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printHeader } from "../logger/util.js"
import { dedent } from "../util/string.js"
import { clearAuthToken, getStoredAuthToken } from "../cloud/legacy/auth.js"
import { getCloudDomain, useLegacyCloud } from "../cloud/util.js"
import { findProjectConfigOrPrintInstructions } from "./helpers.js"
import { GardenCloudApi } from "../cloud/legacy/api.js"
import { GrowCloudApi } from "../cloud/grow/api.js"

type Opts = {}

export class LogOutCommand extends Command<{}, Opts> {
  name = "logout"
  help = "Log out of Garden Cloud."

  override noProject = true

  override description = dedent`
    Logs you out of Garden Cloud.
  `

  override printHeader({ log }) {
    printHeader(log, "Log out", "☁️")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    const projectConfig = await findProjectConfigOrPrintInstructions(log, garden.projectRoot)
    const { id: projectId, organizationId } = projectConfig

    const cloudDomain = getCloudDomain(projectConfig)
    const globalConfigStore = garden.globalConfigStore

    let cloudApi: GardenCloudApi | GrowCloudApi | undefined
    if (useLegacyCloud(projectConfig) && projectId) {
      cloudApi = await GardenCloudApi.factory({
        log,
        cloudDomain,
        skipLogging: true,
        globalConfigStore,
        projectId,
      })
    } else if (organizationId) {
      cloudApi = await GrowCloudApi.factory({
        log,
        cloudDomain,
        skipLogging: true,
        globalConfigStore,
        organizationId,
      })
    }

    if (!cloudApi) {
      log.info({ msg: `You're already logged out from ${cloudDomain}.` })
      return {}
    }

    try {
      const clientAuthToken = await getStoredAuthToken(log, globalConfigStore, cloudDomain)
      // Shouldn't really happen if the cloudApi instance was initialised
      if (!clientAuthToken) {
        log.info({ msg: `You're already logged out from ${cloudDomain}.` })
        return {}
      }

      await cloudApi.revokeToken(clientAuthToken, log)

      log.success(`Successfully logged out from ${cloudDomain}.`)
    } catch (err) {
      const msg = dedent`
      The following issue occurred while logging out from ${cloudDomain} (your session will be cleared regardless): ${err}\n
      `
      log.warn(msg)
    } finally {
      await clearAuthToken(log, globalConfigStore, cloudDomain)
    }

    return {}
  }
}
