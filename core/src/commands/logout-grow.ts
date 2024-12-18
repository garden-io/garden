/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, type CommandParams, type CommandResult } from "./base.js"
import { printHeader } from "../logger/util.js"
import { clearAuthToken, getAuthToken } from "../cloud/auth.js"
import { apiClient } from "../cloud/grow/trpc.js"
import { BooleanParameter } from "../cli/params.js"
import { dedent, deline } from "../util/string.js"
import { ConfigurationError } from "../exceptions.js"
import { findProjectConfig } from "../config/base.js"
import type { ProjectConfig } from "../config/project.js"
import { getCloudDomain } from "../cloud/util.js"

export const logoutOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you out from the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof logoutOpts

export class LogOutCommand extends Command<{}, Opts> {
  name = "logout-grow"
  help = "Log out of Grow Cloud."

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

    const cloudDomain = getCloudDomain(projectConfig?.domain)
    const globalConfigStore = garden.globalConfigStore

    const token = await getAuthToken(log, globalConfigStore, cloudDomain)
    if (!token) {
      log.info({ msg: `You're already logged out from ${cloudDomain}.` })
      return {}
    }

    await clearAuthToken(log, globalConfigStore, cloudDomain)
    try {
      await apiClient.token.revokeToken.mutate({ token })
    } catch (_error) {
      log.debug({ msg: "Failed to revoke token; it was either invalid or already expired." })
    }
    return {}
  }
}
