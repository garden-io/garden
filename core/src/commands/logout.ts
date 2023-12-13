/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printHeader } from "../logger/util.js"
import { CloudApi, CloudApiNoTokenError, getGardenCloudDomain } from "../cloud/api.js"
import { getCloudDistributionName } from "../util/cloud.js"
import { dedent, deline } from "../util/string.js"
import { ConfigurationError } from "../exceptions.js"
import type { ProjectConfig } from "../config/project.js"
import { findProjectConfig } from "../config/base.js"
import { BooleanParameter } from "../cli/params.js"

export const logoutOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you out from the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof logoutOpts

export class LogOutCommand extends Command<{}, Opts> {
  name = "logout"
  help = "Log out of Garden Cloud."
  override noProject = true

  override description = dedent`
    Logs you out of Garden Cloud.
  `
  override options = logoutOpts

  override printHeader({ log }) {
    printHeader(log, "Log out", "☁️")
  }

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult> {
    // The Cloud API is missing from the Garden class for commands with noProject
    // so we initialize it with a cloud domain derived from `getGardenCloudDomain`.

    let projectConfig: ProjectConfig | undefined = undefined
    const forceProjectCheck = !opts["disable-project-check"]

    if (forceProjectCheck) {
      projectConfig = await findProjectConfig({ log, path: garden.projectRoot })

      // Fail if this is not run within a garden project
      if (!projectConfig) {
        throw new ConfigurationError({
          message: `Not a project directory (or any of the parent directories): ${garden.projectRoot}`,
        })
      }
    }

    const cloudDomain: string | undefined = getGardenCloudDomain(projectConfig?.domain)

    const distroName = getCloudDistributionName(cloudDomain)

    try {
      // The Enterprise API is missing from the Garden class for commands with noProject
      // so we initialize it here.

      const token = await garden.globalConfigStore.get("clientAuthTokens", cloudDomain)

      if (!token) {
        log.info({ msg: `You're already logged out from ${cloudDomain}.` })
        return {}
      }

      const cloudApi = await CloudApi.factory({
        log,
        cloudDomain,
        skipLogging: true,
        globalConfigStore: garden.globalConfigStore,
        projectId: undefined,
        requireLogin: undefined,
      })

      await cloudApi.post("token/logout", { headers: { Cookie: `rt=${token?.refreshToken}` } })
      cloudApi.close()
    } catch (err) {
      // This is expected if the user never logged in
      if (!(err instanceof CloudApiNoTokenError)) {
        const msg = dedent`
      The following issue occurred while logging out from ${distroName} (your session will be cleared regardless): ${err}\n
      `
        log.warn(msg)
      }
    } finally {
      await CloudApi.clearAuthToken(log, garden.globalConfigStore, cloudDomain)
      log.success(`Successfully logged out from ${cloudDomain}.`)
    }
    return {}
  }
}
