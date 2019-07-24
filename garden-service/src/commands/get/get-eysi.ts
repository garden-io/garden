/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandResult,
} from "../base"
import dedent = require("dedent")
import { readFile } from "fs-extra"
import { STATIC_DIR } from "../../constants"
import { join } from "path"
import execa = require("execa")

export class GetEysiCommand extends Command {
  name = "eysi"
  help = "Meet our CTO."

  description = dedent`
    Just try it.
  `

  loggerType: "basic"

  async action(): Promise<CommandResult> {
    const eysi = (await readFile(join(STATIC_DIR, "eysi.txt"))).toString()
    console.log(eysi)

    try {
      // Close enough.
      await execa("say", ["Hello", ",", "I", "am", "Aysey", "--channels=2"])
    } catch (_) { }

    return { result: { eysi } }
  }
}
