/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs } from "lodash"
import { StringsParameter } from "../../cli/params"
import { joi } from "../../config/common"
import { printHeader } from "../../logger/util"
import { Command, CommandParams, CommandResult } from "../base"
import chalk from "chalk"
import { ActionFile } from "../../actions/base"

const getFilesArgs = {
  keys: new StringsParameter({
    help: "One or more action keys (e.g. deploy.api), separated by spaces. If omitted, all actions are queried.",
    spread: true,
  }),
}

type Args = typeof getFilesArgs
type Opts = {}

interface Result {
  [key: string]: ActionFile[]
}

export class GetFilesCommand extends Command<Args, Opts> {
  name = "files"
  help = "List all files from all or specified actions."

  override description = "This is useful to diagnose issues with ignores, include and exclude for a given action."

  override arguments = getFilesArgs

  // TODO: change output schema
  override outputsSchema = () => joi.object().pattern(joi.string(), joi.array().items(joi.object()).required())

  override printHeader({ log }) {
    printHeader(log, "Get Files", "🗂️")
  }

  async action({ garden, log, args }: CommandParams<Args, Opts>): Promise<CommandResult<Result>> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const actions = graph.getActions({ refs: args.keys?.length ? args.keys : undefined })

    const result = fromPairs(
      actions.map((a) => {
        const key = a.key()
        const files = a.getFullVersion().files

        log.info("")
        log.info(chalk.cyanBright(key))
        log.info(files.length ? files.map((f) => `- ${f.relativePath} (from ${f.source}; absolute path: ${f.absolutePath})`).join("\n") : "(none)")

        return [key, files]
      })
    )

    log.info("")

    return {
      result,
    }
  }
}
