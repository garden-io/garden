/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, EnvironmentOption, ParameterValues } from "../base"
import { GardenContext } from "../../context"

const options = {
  env: new EnvironmentOption({
    help: "Set the environment (and optionally namespace) to configure",
  }),
}

type Opts = ParameterValues<typeof options>

export class EnvironmentConfigureCommand extends Command<typeof options> {
  name = "configure"
  alias = "c"
  help = "Configures your environment"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)
    const { name } = ctx.getEnvironment()
    ctx.log.header({ emoji: "gear", command: `Configuring ${name} environment` })

    const result = await ctx.configureEnvironment()

    ctx.log.info({ msg: "" })
    ctx.log.header({ emoji: "heavy_check_mark", command: `Done!` })

    return result
  }
}
