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
import {
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
  PathParameter,
} from "../base"
import { addLinkedSources } from "../../util/ext-source-util"
import { LinkedSource } from "../../config-store"
import { CommandParams } from "../base"

export const linkSourceArguments = {
  source: new StringParameter({
    help: "Name of the source to link as declared in the project config.",
    required: true,
  }),
  path: new PathParameter({
    help: "Path to the local directory that containes the source.",
    required: true,
  }),
}

export type LinkSourceArguments = ParameterValues<typeof linkSourceArguments>

export class LinkSourceCommand extends Command<typeof linkSourceArguments> {
  name = "source"
  help = "Link a remote source to a local directory."
  arguments = linkSourceArguments

  description = dedent`
    After linking a remote source, Garden will read it from its local directory instead of
    from the remote URL. Garden can only link remote sources that have been declared in the project
    level garden.yml config.

    Examples:

        garden link source my-source path/to/my-source # links my-source to its local version at the given path
  `

  async action({ ctx, args }: CommandParams<LinkSourceArguments>): Promise<CommandResult<LinkedSource[]>> {

    ctx.log.header({ emoji: "link", command: "link source" })

    const sourceType = "project"

    const { source: sourceName, path } = args
    const projectSourceToLink = ctx.projectSources.find(src => src.name === sourceName)

    if (!projectSourceToLink) {
      const availableRemoteSources = ctx.projectSources.map(s => s.name).sort()

      throw new ParameterError(
        `Remote source ${chalk.underline(sourceName)} not found in project config.` +
        ` Did you mean to use the "link module" command?`,
        {
          availableRemoteSources,
          input: sourceName,
        },
      )
    }

    const absPath = resolve(ctx.projectRoot, path)

    const linkedProjectSources = await addLinkedSources({
      ctx,
      sourceType,
      sources: [{ name: sourceName, path: absPath }],
    })

    ctx.log.info(`Linked source ${sourceName}`)

    return { result: linkedProjectSources }
  }
}
