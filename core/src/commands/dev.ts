/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandResult, CommandParams } from "./base"
import { dedent } from "../util/string"
import { ServeCommand, ServeCommandArgs, ServeCommandOpts } from "./serve"
import chalk from "chalk"
import { printHeader } from "../logger/util"

// NOTE: This is all due to change in 0.13, just getting it to compile for now - JE

// const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

// TODO: allow limiting to certain modules and/or services
export class DevCommand extends ServeCommand {
  name = "dev"
  help = "Starts the Garden interactive development environment."
  protected = true
  hidden = true

  description = dedent`
    [UNDER CONSTRUCTION]

    This command is due to be replaced. Please use \`garden deploy --dev\` instead for now.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Dev", "keyboard")
  }

  // async prepare({ headerLog, footerLog }: PrepareParams<DevCommandArgs, DevCommandOpts>) {
  //   // print ANSI banner image
  //   if (chalk.supportsColor && chalk.supportsColor.level > 2) {
  //     const data = await readFile(ansiBannerPath)
  //     headerLog.info(data.toString())
  //   }

  //   headerLog.info(chalk.gray.italic(`Good ${getGreetingTime()}! Let's get your environment wired up...`))
  //   headerLog.info("")

  //   this.server = await startServer({ log: footerLog })
  // }

  async action(params: CommandParams<ServeCommandArgs, ServeCommandOpts>): Promise<CommandResult> {
    params.log.warn({
      msg:
        chalk.bold(dedent`
          🚧  This command is ${chalk.yellow.bold("under construction")}  🚧

          As part of broader changes in Garden 0.13, the garden dev command is being replaced with a new interactive command. For now, this command only works in conjunction with the new Garden dashboard.

          Meanwhile, you likely want to use ${chalk.underline("garden deploy --dev")} to deploy services in dev mode.
        `) + "\n",
    })

    return super.action(params)
  }
}

// function getGreetingTime() {
//   const m = moment()

//   const currentHour = parseFloat(m.format("HH"))

//   if (currentHour >= 17) {
//     return "evening"
//   } else if (currentHour >= 12) {
//     return "afternoon"
//   } else {
//     return "morning"
//   }
// }
