/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { EnvironmentStatusMap } from "../../types/plugin/outputs"
import { Command } from "../base"

export class EnvironmentConfigureCommand extends Command {
  name = "configure"
  alias = "config"
  help = "Configures your environment"

  async action(ctx: PluginContext): Promise<EnvironmentStatusMap> {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "gear", command: `Configuring ${name} environment` })

    const result = await ctx.configureEnvironment({})

    ctx.log.info("")
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })

    return result
  }
}
