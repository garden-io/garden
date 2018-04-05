/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, EnvironmentOption, ParameterValues, StringParameter } from "../base"
import { GardenContext } from "../../context"
import { NotFoundError } from "../../exceptions"

const configDeleteArgs = {
  key: new StringParameter({
    help: "The key of the configuration variable",
    required: true,
  }),
}

const configDeleteOpts = {
  env: new EnvironmentOption({
    help: "Set the environment (and optionally namespace) to delete the config variable from",
  }),
}

type DeleteArgs = ParameterValues<typeof configDeleteArgs>
type DeleteOpts = ParameterValues<typeof configDeleteOpts>

// TODO: add --all option to remove all configs

export class ConfigDeleteCommand extends Command<typeof configDeleteArgs, typeof configDeleteOpts> {
  name = "delete"
  alias = "del"
  help = "Delete a configuration variable"

  arguments = configDeleteArgs
  options = configDeleteOpts

  async action(ctx: GardenContext, args: DeleteArgs, opts: DeleteOpts) {
    opts.env && ctx.setEnvironment(opts.env)
    const res = await ctx.deleteConfig(args.key.split("."))

    if (res.found) {
      ctx.log.info({ msg: `Deleted config key ${args.key}` })
    } else {
      throw new NotFoundError(`Could not find config key ${args.key}`, { key: args.key })
    }

    return { ok: true }
  }
}
