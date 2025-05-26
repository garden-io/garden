/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult } from "../base.js"
import { Command } from "../base.js"
import dedent from "dedent"
import fsExtra from "fs-extra"
const { readFile } = fsExtra
import { STATIC_DIR } from "../../constants.js"
import { join } from "path"
import { exec } from "../../util/util.js"

export class GetEysiCommand extends Command {
  name = "eysi"
  help = "Meet our CTO."

  override description = dedent`
    Just try it.
  `

  override hidden = true
  override noProject = true

  override printHeader() {}

  async action(): Promise<CommandResult> {
    const eysi = (await readFile(join(STATIC_DIR, "eysi.txt"))).toString()
    // eslint-disable-next-line no-console
    console.log(eysi)

    try {
      // Close enough.
      await exec("say", ["Hello", ",", "I", "am", "Aysey"])
    } catch (_) {}

    return { result: { eysi } }
  }
}
