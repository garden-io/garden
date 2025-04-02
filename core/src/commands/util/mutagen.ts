/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams } from "../base.js"
import { Command } from "../base.js"
import { RuntimeError } from "../../exceptions.js"
import dedent from "dedent"
import { findProjectConfig } from "../../config/base.js"
import { exec } from "../../util/util.js"
import { getMutagenDataDir, mutagenCli } from "../../mutagen.js"
import fsExtra from "fs-extra"

const { mkdirp } = fsExtra

export class MutagenCommand extends Command<{}, {}> {
  name = "mutagen"
  help = "Run any Mutagen CLI command in the context of the current project."
  override cliOnly = true

  override noProject = true
  override ignoreOptions = true

  override description = dedent`
    The Mutagen tool is used for various functions in Garden, most notably syncs (formerly "dev mode") to containers. When experiencing issues with synchronization, it may be helpful to use the Mutagen CLI directly to troubleshoot or gather more information.

    This command simply runs the Mutagen CLI with environment variables appropriately set to interact with the syncs created in the context of this project. All arguments and flags are passed directly to Mutagen.

    Examples:

        garden util mutagen sync list     # list all active syncs
        garden util mutagen sync monitor  # continuously monitor all syncs
  `

  override printHeader() {}

  async action({ garden, log, args }: CommandParams<{}, {}>) {
    const projectConfig = await findProjectConfig({ log, path: garden.projectRoot })

    if (!projectConfig) {
      throw new RuntimeError({
        message: dedent`
          Could not find project config in the current directory, or anywhere above.
          Please run this command within a Garden project directory.
        `,
      })
    }

    const mutagenDir = getMutagenDataDir({ ctx: garden, log })
    const mutagenPath = await mutagenCli.ensurePath(log)

    await mkdirp(mutagenDir)

    const result = await exec(mutagenPath, args["$all"]?.slice(2) || [], {
      cwd: mutagenDir,
      stdio: "inherit",
      environment: {
        MUTAGEN_DATA_DIRECTORY: mutagenDir,
      },
      reject: false,
    })

    return { exitCode: result.exitCode }
  }
}
