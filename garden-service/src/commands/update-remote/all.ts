/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")

import {
  Command,
  CommandResult,
  CommandParams,
} from "../base"
import { UpdateRemoteSourcesCommand } from "./sources"
import { UpdateRemoteModulesCommand } from "./modules"
import { SourceConfig } from "../../config/project"
import { logHeader } from "../../logger/util"

export interface UpdateRemoteAllResult {
  projectSources: SourceConfig[],
  moduleSources: SourceConfig[],
}

export class UpdateRemoteAllCommand extends Command {
  name = "all"
  help = "Update all remote sources and modules."

  description = dedent`
    Examples:

        garden update-remote all # update all remote sources and modules in the project
  `

  async action({ garden, log, logFooter }: CommandParams): Promise<CommandResult<UpdateRemoteAllResult>> {
    logHeader({ log, emoji: "hammer_and_wrench", command: "update-remote all" })

    const sourcesCmd = new UpdateRemoteSourcesCommand()
    const modulesCmd = new UpdateRemoteModulesCommand()

    const { result: projectSources } = await sourcesCmd.action({
      garden,
      log,
      logFooter,
      args: { sources: undefined },
      opts: {},
    })
    const { result: moduleSources } = await modulesCmd.action({
      garden,
      log,
      logFooter,
      args: { modules: undefined },
      opts: {},
    })

    return { result: { projectSources: projectSources!, moduleSources: moduleSources! } }
  }
}
