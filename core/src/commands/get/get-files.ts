/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs } from "lodash-es"
import { StringsParameter } from "../../cli/params.js"
import { joi } from "../../config/common.js"
import { printHeader } from "../../logger/util.js"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { styles } from "../../logger/styles.js"

const getFilesArgs = {
  keys: new StringsParameter({
    help: "One or more action keys (e.g. deploy.api), separated by spaces. If omitted, all actions are queried.",
    spread: true,
  }),
}

type Args = typeof getFilesArgs
type Opts = {}

interface Result {
  [key: string]: string[]
}

export class GetFilesCommand extends Command<Args, Opts> {
  name = "files"
  help = "List all files from all or specified actions."

  override description = "This is useful to diagnose issues with ignores, include and exclude for a given action."

  override arguments = getFilesArgs

  override outputsSchema = () => joi.object().pattern(joi.string(), joi.array().items(joi.string()).required())

  override printHeader({ log }) {
    printHeader(log, "Get Files", "🗂️")
  }

  async action({ garden, log, args }: CommandParams<Args, Opts>): Promise<CommandResult<Result>> {
    const graph = await garden.getConfigGraph({ log, emit: false, statusOnly: true })
    const actions = graph.getActions({ refs: args.keys?.length ? args.keys : undefined })

    const result = fromPairs(
      actions.map((a) => {
        const key = a.key()
        const files = a.getFullVersion().files

        log.info("")
        log.info(styles.highlight(key))
        log.info(files.length ? files.map((f) => "- " + f).join("\n") : "(none)")

        return [key, files]
      })
    )

    log.info("")

    return {
      result,
    }
  }
}
