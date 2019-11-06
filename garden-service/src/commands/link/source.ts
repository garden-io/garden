/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import dedent = require("dedent")
import chalk from "chalk"

import { ParameterError } from "../../exceptions"
import { Command, CommandResult, StringParameter, PathParameter } from "../base"
import { addLinkedSources } from "../../util/ext-source-util"
import { LinkedSource } from "../../config-store"
import { CommandParams } from "../base"
import { printHeader } from "../../logger/util"

const linkSourceArguments = {
  source: new StringParameter({
    help: "Name of the source to link as declared in the project config.",
    required: true,
  }),
  path: new PathParameter({
    help: "Path to the local directory that containes the source.",
    required: true,
  }),
}

type Args = typeof linkSourceArguments

export class LinkSourceCommand extends Command<Args> {
  name = "source"
  help = "Link a remote source to a local directory."
  arguments = linkSourceArguments

  description = dedent`
    After linking a remote source, Garden will read it from its local directory instead of
    from the remote URL. Garden can only link remote sources that have been declared in the project
    level \`garden.yml\` config.

    Examples:

        garden link source my-source path/to/my-source # links my-source to its local version at the given path
  `

  async action({ garden, log, headerLog, args }: CommandParams<Args>): Promise<CommandResult<LinkedSource[]>> {
    printHeader(headerLog, "Link source", "link")

    const sourceType = "project"

    const { source: sourceName, path } = args
    const projectSourceToLink = garden.projectSources.find((src) => src.name === sourceName)

    if (!projectSourceToLink) {
      const availableRemoteSources = garden.projectSources.map((s) => s.name).sort()

      throw new ParameterError(
        `Remote source ${chalk.underline(sourceName)} not found in project config.` +
          ` Did you mean to use the "link module" command?`,
        {
          availableRemoteSources,
          input: sourceName,
        }
      )
    }

    const absPath = resolve(garden.projectRoot, path)

    const linkedProjectSources = await addLinkedSources({
      garden,
      sourceType,
      sources: [{ name: sourceName, path: absPath }],
    })

    log.info(`Linked source ${sourceName}`)

    return { result: linkedProjectSources }
  }
}
