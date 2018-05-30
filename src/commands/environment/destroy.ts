/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"

import {
  Command,
  CommandResult,
} from "../base"
import { EnvironmentStatusMap } from "../../types/plugin/outputs"
import dedent = require("dedent")

export class EnvironmentDestroyCommand extends Command {
  name = "destroy"
  alias = "d"
  help = "Destroy an environment."

  description = dedent`
    Generally not as dramatic as it sounds :) This will trigger providers clear up any deployments in a
    Garden environment and reset it. When you then run \`garden env configure\` or any deployment command,
    the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `

  async action(ctx: PluginContext): Promise<CommandResult<EnvironmentStatusMap>> {
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "skull_and_crossbones", command: `Destroying ${name} environment` })

    const result = await ctx.destroyEnvironment({})

    ctx.log.finish()

    return { result }
  }

}
