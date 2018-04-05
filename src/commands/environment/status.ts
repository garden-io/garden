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
    help: "The environment (and optionally namespace) to check",
  }),
}

type Opts = ParameterValues<typeof options>

export class EnvironmentStatusCommand extends Command<typeof options> {
  name = "status"
  alias = "s"
  help = "Outputs the status of your environment"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)
    const result = await ctx.getEnvironmentStatus()
    console.log(JSON.stringify(result, null, 4))
    return result
  }
}
