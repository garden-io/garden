/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import notifier from "node-notifier"
import { Command, CommandParams, CommandResult } from "../base"
import { printEmoji, printHeader, renderDivider } from "../../logger/util"
import dedent = require("dedent")
import got from "got/dist/source"
import chalk = require("chalk")
import { LogEntry } from "../../logger/log-entry"

interface ImpfCenter {
  id: string
  name: string
  open: boolean
  lastUpdate: number
  stats: any
}

interface ImpfApiResponse {
  stats: ImpfCenter[]
}

type CenterId = "arena" | "tempelhof" | "messe" | "velodrom" | "tegel" | "erika"

const linkMap: { [key in CenterId]: string } = {
  arena: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158431",
  tempelhof: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158433",
  messe: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158434",
  velodrom: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158435",
  tegel: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158436",
  erika: "https://www.doctolib.de/institut/berlin/ciz-berlin-berlin?pid=practice-158437",
}
const impstoffLinkUrl = "https://impfstoff.link/"
const intervalMs = 2000

function makeNotification(centers: ImpfCenter[]) {
  let message: string
  let open: string
  if (centers.length === 1) {
    const center = centers[0]
    message = dedent`
      We've found an opening at the ${center.name} vaccination center!

      Click this notification to book an appointment via Doctolib.

      Check out your terminal for more information.
    `
    open = linkMap[center.id]
  } else {
    message = dedent`
      We've found openings at several vaccination centers!

      Click this notification to view availability on Impstoff.Link.

      Check out your terminal for more information.
    `
    open = impstoffLinkUrl
  }
  return {
    title: "Vaccination Opening",
    message,
    sound: true,
    open,
  }
}

function printDivider(log: LogEntry) {
  log.info("")
  log.info(chalk.white.bold(renderDivider()))
  log.info("")
}

export class GetVaccineCommand extends Command {
  name = "vaccine"
  help = "Get notifications and appointments open up at the Berlin vaccination centers."
  emoji: "syringe"
  noProject = true

  description = dedent`
    Check for openings at Berlin's vaccination centers at a ${Math.floor(intervalMs / 1000)}
    second interval. If it finds one, you'll receive a notification
    with links to book an appointment.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Vaccine", "syringe")
  }

  async action({ log, footerLog }: CommandParams): Promise<CommandResult> {
    // When it comes to live saving medicine, bold and underline can go together.
    const link = chalk.underline.bold
    const heartEmoji = printEmoji("heart", log) ? ` ${printEmoji("heart", log)}` : ""
    log.info(dedent`
      Hello! This command will check for openings at Berlin's vaccination centers at a
      ${Math.floor(intervalMs / 1000)} second interval. If it finds one, you'll receive a notification
      with links to book an appointment.

      Relevant information will also be printed in the terminal.

      Bookings can be done via Doctolib so we recommend that you set up an account with
      them if you haven't already. You can do that at:

      ${link("https://www.doctolib.de/")}

      A very special thanks to ${link("https://impfstoff.link/")} for providing the APIs for this and of course to
      everyone working towards vaccinating Berliners${heartEmoji}.

      NOTE: There seem to be a quite a lot of false positives coming through at the moment. We'll update the command
      if we find a way around that.

      Good luck, and stay safe!
    `)

    printDivider(log)
    const statusLine = footerLog.placeholder()

    const handleResponse = (response: ImpfApiResponse) => {
      const openings = response.stats.filter((s) => s.open)

      if (openings.length === 0) {
        return
      }

      const date = new Date()
      const timestamp = `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`
      let logMsg: string

      if (openings.length === 1) {
        const center = openings[0]
        logMsg = dedent`
          ${timestamp}

          ${chalk.green(`We've found an opening at the ${chalk.bold(center.name)} vaccination center!`)}

          Click the link below to book directly via Doctolib:

          ${link(linkMap[center.id])}

          Click below to view the opening on Impstoff.Link:

          ${link(impstoffLinkUrl)}
        `
      } else {
        const links = openings
          .map(
            (center) => dedent`
            ${center.name} — ${link(linkMap[center.id])}
          `
          )
          .join("\n\n")

        logMsg = dedent`
          ${timestamp}

          ${chalk.green(`We've found an opening at the following vaccination centers!`)} Click the links
          below to book directly via Doctolob:

          ${links}

          Click below to view the opening on Impstoff.Link:

          ${link(impstoffLinkUrl)}
        `
      }

      log.info(logMsg)
      notifier.notify(makeNotification(openings))
      printDivider(log)
    }

    const checkOpenings = async () => {
      return new Promise(async (_res, _rej) => {
        statusLine.setState({ symbol: "info", msg: "Checking for openings..." })
        const response = await got("https://api.impfstoff.link/?v=0.3&robot=1").json<ImpfApiResponse>()
        handleResponse(response)
        statusLine.setState({ msg: "Waiting..." })
        setTimeout(async () => {
          await checkOpenings()
        }, intervalMs)
      })
    }

    await checkOpenings()

    return {}
  }
}
