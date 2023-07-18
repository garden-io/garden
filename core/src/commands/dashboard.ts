/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getGardenCloudDomain } from "../cloud/api"
import { dedent } from "../util/string"
import { Command } from "./base"

export class DashboardCommand extends Command {
  name = "dashboard"

  override cliOnly = true

  help = "Open the Garden dashboard in your browser."

  override description = dedent`
    Opens the Garden dashboard in your browser.

    Note: The local dashboard process has been removed as of Garden 0.13. This will take you to the new Cloud dashboard, and thus requires you to log in.
  `

  async action({ garden, log }) {
    const cloudDomain = getGardenCloudDomain(garden.cloudDomain)

    log.info("Opening the dashboard at " + cloudDomain)
    open(cloudDomain)

    return {}
  }
}
