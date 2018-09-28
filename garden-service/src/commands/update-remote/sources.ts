/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash"
import dedent = require("dedent")
import chalk from "chalk"

import {
  Command,
  StringsParameter,
  CommandResult,
  CommandParams,
} from "../base"
import { ParameterError } from "../../exceptions"
import { pruneRemoteSources } from "./helpers"
import { SourceConfig } from "../../config/project"

const updateRemoteSourcesArguments = {
  source: new StringsParameter({
    help: "Name of the remote source(s) to update. Use comma separator to specify multiple sources.",
  }),
}

type Args = typeof updateRemoteSourcesArguments

export class UpdateRemoteSourcesCommand extends Command<Args> {
  name = "sources"
  help = "Update remote sources."
  arguments = updateRemoteSourcesArguments

  description = dedent`
    Update the remote sources declared in the project config.

    Examples:

        garden update-remote sources            # update all remote sources in the project config
        garden update-remote sources my-source  # update remote source my-source
  `

  async action(
    { garden, args }: CommandParams<Args>,
  ): Promise<CommandResult<SourceConfig[]>> {
    garden.log.header({ emoji: "hammer_and_wrench", command: "update-remote sources" })

    const { source } = args

    const projectSources = garden.projectSources
      .filter(src => source ? source.includes(src.name) : true)

    const names = projectSources.map(src => src.name)

    // TODO: Make external modules a cli type to avoid validation repetition
    const diff = difference(source, names)
    if (diff.length > 0) {
      throw new ParameterError(
        `Expected source(s) ${chalk.underline(diff.join(","))} to be specified in the project garden.yml config.`,
        {
          remoteSources: garden.projectSources.map(s => s.name).sort(),
          input: source ? source.sort() : undefined,
        },
      )
    }

    // TODO Update remotes in parallel. Currently not possible since updating might
    // trigger a username and password prompt from git.
    for (const { name, repositoryUrl } of projectSources) {
      await garden.vcs.updateRemoteSource({ name, url: repositoryUrl, sourceType: "project", logEntry: garden.log })
    }

    await pruneRemoteSources({ projectRoot: garden.projectRoot, type: "project", sources: projectSources })

    return { result: projectSources }
  }
}
