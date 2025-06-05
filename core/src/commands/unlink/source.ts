/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"

import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import { removeLinkedSources } from "../../util/ext-source-util.js"
import { printHeader } from "../../logger/util.js"
import type { LinkedSource } from "../../config-store/local.js"
import { StringsParameter, BooleanParameter } from "../../cli/params.js"

const unlinkSourceArguments = {
  sources: new StringsParameter({
    help: "The name(s) of the source(s) to unlink. You may specify multiple sources, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return configDump.sources.map((s) => s.name)
    },
  }),
}

const unlinkSourceOptions = {
  all: new BooleanParameter({
    help: "Unlink all sources.",
  }),
}

type Args = typeof unlinkSourceArguments
type Opts = typeof unlinkSourceOptions

export class UnlinkSourceCommand extends Command<Args, Opts> {
  name = "source"
  help = "Unlink a previously linked remote source from its local directory."
  override arguments = unlinkSourceArguments
  override options = unlinkSourceOptions

  override description = dedent`
    After unlinking a remote source, Garden will go back to reading it from its remote URL instead
    of its local directory.

    Examples:

        garden unlink source my-source  # unlinks my-source
        garden unlink source --all      # unlinks all sources
  `

  override printHeader({ log }) {
    printHeader(log, "Unlink source", "⛓️")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<LinkedSource[]>> {
    const sourceType = "project"

    const { sources = [] } = args

    if (opts.all) {
      await garden.localConfigStore.set("linkedProjectSources", {})
      log.info("Unlinked all sources")
      return { result: [] }
    }

    const linkedProjectSources = await removeLinkedSources({
      garden,
      sourceType,
      names: sources,
    })

    log.info(`Unlinked source(s) ${sources.join(" ")}`)

    return { result: linkedProjectSources }
  }
}
