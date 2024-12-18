/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, type CommandParams, type CommandResult } from "./base.js"
import { printHeader } from "../logger/util.js"
import { GlobalConfigStore } from "../config-store/global.js"
import { clearAuthToken, getAuthToken } from "../cloud/auth.js"
import { cloudApiOrigin } from "../cloud/grow/config.js"
import { apiClient } from "../cloud/grow/trpc.js"
import { BooleanParameter } from "../cli/params.js"
import { dedent, deline } from "../util/string.js"

export const logoutOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you out from the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof logoutOpts

export class LogOutCommand extends Command<{}, Opts> {
  name = "logout-grow"
  help = "Log out from Grow Cloud."

  override noProject = true

  override description = dedent`
    Logs you out of Garden Cloud.
  `
  override options = logoutOpts

  override printHeader({ log }) {
    printHeader(log, "Log out", "☁️")
  }

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult> {
    const globalConfigStore = new GlobalConfigStore()
    const token = await getAuthToken(log, globalConfigStore, cloudApiOrigin)
    if (token) {
      await clearAuthToken(log, globalConfigStore, cloudApiOrigin)
      try {
        await apiClient.token.revokeToken.mutate({ token })
      } catch (_error) {
        log.debug({ msg: "Failed to revoke token; it was either invalid or already expired." })
      }
    }
    return {}
  }
}
