/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"

import { Command } from "../base"
import { EnvironmentStatusMap } from "../../types/plugin/outputs"

export class EnvironmentDestroyCommand extends Command {
  name = "destroy"
  alias = "d"
  help = "Destroy environment"

  async action(ctx: PluginContext): Promise<EnvironmentStatusMap> {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "skull_and_crossbones", command: `Destroying ${name} environment` })

    const result = await ctx.destroyEnvironment({})

    ctx.log.finish()

    return result
  }

}
