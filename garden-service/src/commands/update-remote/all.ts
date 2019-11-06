/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")

import { Command, CommandResult, CommandParams } from "../base"
import { updateRemoteSources } from "./sources"
import { updateRemoteModules } from "./modules"
import { SourceConfig } from "../../config/project"
import { printHeader } from "../../logger/util"

export interface UpdateRemoteAllResult {
  projectSources: SourceConfig[]
  moduleSources: SourceConfig[]
}

export class UpdateRemoteAllCommand extends Command {
  name = "all"
  help = "Update all remote sources and modules."

  description = dedent`
    Examples:

        garden update-remote all # update all remote sources and modules in the project
  `

  async action({ garden, log, headerLog }: CommandParams): Promise<CommandResult<UpdateRemoteAllResult>> {
    printHeader(headerLog, "Update remote sources and modules", "hammer_and_wrench")

    const { result: projectSources } = await updateRemoteSources({
      garden,
      log,
      args: { sources: undefined },
    })
    const { result: moduleSources } = await updateRemoteModules({
      garden,
      log,
      args: { modules: undefined },
    })

    return {
      result: {
        projectSources: projectSources!,
        moduleSources: moduleSources!,
      },
    }
  }
}
