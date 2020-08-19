/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult } from "../base"
import dedent = require("dedent")
import { readFile } from "fs-extra"
import { STATIC_DIR } from "../../constants"
import { join } from "path"
import { exec } from "../../util/util"

export class GetEysiCommand extends Command {
  name = "eysi"
  help = "Meet our CTO."

  description = dedent`
    Just try it.
  `

  loggerType: "basic"

  hidden = true
  noProject = true

  async action(): Promise<CommandResult> {
    const eysi = (await readFile(join(STATIC_DIR, "eysi.txt"))).toString()
    // tslint:disable-next-line: no-console
    console.log(eysi)

    try {
      // Close enough.
      await exec("say", ["Hello", ",", "I", "am", "Aysey"])
    } catch (_) {}

    return { result: { eysi } }
  }
}
