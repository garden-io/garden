/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")

import { PluginContext } from "../../plugin-context"
import {
  Command,
  CommandResult,
  StringsParameter,
  ParameterValues,
  BooleanParameter,
} from "../base"
import { removeLinkedSources } from "../../util/ext-source-util"
import {
  localConfigKeys,
  LinkedSource,
} from "../../config-store"

export const unlinkModuleArguments = {
  module: new StringsParameter({
    help: "Name of the module(s) to unlink. Use comma separator to specify multiple modules.",
  }),
}

export const unlinkModuleOptions = {
  all: new BooleanParameter({
    help: "Unlink all modules.",
    alias: "a",
  }),
}

export type UnlinkModuleArguments = ParameterValues<typeof unlinkModuleArguments>
export type UnlinkModuleOptions = ParameterValues<typeof unlinkModuleOptions>

export class UnlinkModuleCommand extends Command<typeof unlinkModuleArguments, typeof unlinkModuleOptions> {
  name = "module"
  help = "Unlink a previously linked remote module from its local directory."
  arguments = unlinkModuleArguments
  options = unlinkModuleOptions

  description = dedent`
    After unlinking a remote module, Garden will go back to reading the module's source from
    its remote URL instead of its local directory.

    Examples:

        garden unlink module my-module # unlinks my-module
        garden unlink module --all # unlink all modules
  `

  async action(
    ctx: PluginContext,
    args: UnlinkModuleArguments,
    opts: UnlinkModuleOptions,
  ): Promise<CommandResult<LinkedSource[]>> {

    ctx.log.header({ emoji: "chains", command: "unlink module" })

    const sourceType = "module"

    const { module = [] } = args

    if (opts.all) {
      await ctx.localConfigStore.set([localConfigKeys.linkedModuleSources], [])
      ctx.log.info("Unlinked all modules")
      return { result: [] }
    }

    const linkedModuleSources = await removeLinkedSources({ ctx, sourceType, names: module })

    ctx.log.info(`Unlinked module(s) ${module}`)

    return { result: linkedModuleSources }
  }
}
