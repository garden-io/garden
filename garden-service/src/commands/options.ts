/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult, Parameter } from "./base"
import stringWidth = require("string-width")
import { maxBy, zip } from "lodash"
import CliTable from "cli-table3"
import { GLOBAL_OPTIONS, HIDDEN_OPTIONS } from "../cli/cli"
import { helpTextMaxWidth } from "../cli/helpers"
import chalk from "chalk"

const tableConfig: CliTable.TableConstructorOptions = {
  chars: {
    "top": "",
    "top-mid": "",
    "top-left": "",
    "top-right": "",
    "bottom": "",
    "bottom-mid": "",
    "bottom-left": "",
    "bottom-right": "",
    "left": "",
    "left-mid": "",
    "mid": " ",
    "mid-mid": "",
    "right": "",
    "right-mid": "",
    "middle": "",
  },
  wordWrap: true,
  truncate: " ", // We need this to prevent ellipsis (empty string does not work)
}

export class OptionsCommand extends Command {
  name = "options"
  help = "Print global options."
  noProject = true

  description = "Prints all global options (options that can be applied to any command)."

  async action({ log }: CommandParams): Promise<CommandResult> {
    // Show both global options and hidden commands (version and help) in the output
    const allOpts = { ...GLOBAL_OPTIONS, ...HIDDEN_OPTIONS }
    const sortedOpts = Object.keys(allOpts).sort()
    const optNames = sortedOpts.map((optName) => {
      const option = <Parameter<any>>allOpts[optName]
      const alias = option.alias ? `-${option.alias}, ` : ""
      return chalk.green(`  ${alias}--${optName}  `)
    })

    const helpTexts = sortedOpts.map((optName) => {
      const option = <Parameter<any>>allOpts[optName]
      let out = option.help
      let hints = ""
      if (option.hints) {
        hints = option.hints
      } else {
        hints = `\n[${option.type}]`
        if (option.defaultValue) {
          hints += ` [default: ${option.defaultValue}]`
        }
      }
      return out + chalk.gray(hints)
    })

    const nameColWidth = stringWidth(maxBy(optNames, (n) => stringWidth(n)) || "") + 1
    const textColWidth = helpTextMaxWidth() - nameColWidth
    const table = new CliTable({
      ...tableConfig,
      colWidths: [nameColWidth, textColWidth],
    }) as CliTable.HorizontalTable

    table.push(...zip(optNames, helpTexts))

    log.info("")
    log.info(chalk.white.bold("GLOBAL OPTIONS"))
    log.info(table.toString())

    return {}
  }
}
