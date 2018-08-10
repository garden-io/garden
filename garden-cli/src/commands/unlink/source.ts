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

export const unlinkSourceArguments = {
  source: new StringsParameter({
    help: "Name of the source(s) to unlink. Use comma separator to specify multiple sources.",
  }),
}

export const unlinkSourceOptions = {
  all: new BooleanParameter({
    help: "Unlink all sources.",
    alias: "a",
  }),
}

export type UnlinkSourceArguments = ParameterValues<typeof unlinkSourceArguments>
export type UnlinkSourceOptions = ParameterValues<typeof unlinkSourceOptions>

export class UnlinkSourceCommand extends Command<typeof unlinkSourceArguments, typeof unlinkSourceOptions> {
  name = "source"
  help = "Unlink a previously linked remote source from its local directory."
  arguments = unlinkSourceArguments
  options = unlinkSourceOptions

  description = dedent`
    After unlinking a remote source, Garden will go back to reading it from its remote URL instead
    of its local directory.

    Examples:

        garden unlink source my-source # unlinks my-source
        garden unlink source --all # unlinks all sources
  `

  async action(
    ctx: PluginContext,
    args: UnlinkSourceArguments,
    opts: UnlinkSourceOptions,
  ): Promise<CommandResult<LinkedSource[]>> {

    ctx.log.header({ emoji: "chains", command: "unlink source" })

    const sourceType = "project"

    const { source = [] } = args

    if (opts.all) {
      await ctx.localConfigStore.set([localConfigKeys.linkedProjectSources], [])
      ctx.log.info("Unlinked all sources")
      return { result: [] }
    }

    const linkedProjectSources = await removeLinkedSources({ ctx, sourceType, names: source })

    ctx.log.info(`Unlinked source(s) ${source}`)

    return { result: linkedProjectSources }
  }
}
