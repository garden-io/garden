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

export class GetDoddiCommand extends Command {
  name = "doddi"
  help = "Meet our VP of Engineering."

  override description = dedent`
    He's nice. We promise. Don't be afraid.
  `

  override hidden = true
  override noProject = true

  override printHeader() {}

  async action(): Promise<CommandResult> {
    const image = (await readFile(join(STATIC_DIR, "doddi.txt"))).toString()
    // eslint-disable-next-line no-console
    console.log(image)

    try {
      // Close enough.
      await exec("say", ["-v", "Daniel", "Hello. My name is dawddeeh."])
    } catch (_) {}

    return { result: { image } }
  }
}
