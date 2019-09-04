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

import { Command, StringsParameter, CommandResult, CommandParams, ParameterValues } from "../base"
import { ParameterError } from "../../exceptions"
import { pruneRemoteSources } from "./helpers"
import { SourceConfig } from "../../config/project"
import { printHeader } from "../../logger/util"
import { Garden } from "../../garden"
import { LogEntry } from "../../logger/log-entry"

const updateRemoteSourcesArguments = {
  sources: new StringsParameter({
    help: "The name(s) of the remote source(s) to update. Use comma as a separator to specify multiple sources.",
  }),
}

type Args = typeof updateRemoteSourcesArguments

export class UpdateRemoteSourcesCommand extends Command<Args> {
  name = "sources"
  help = "Update remote sources."
  arguments = updateRemoteSourcesArguments

  description = dedent`
    Updates the remote sources declared in the project level \`garden.yml\` config file.

    Examples:

        garden update-remote sources            # update all remote sources
        garden update-remote sources my-source  # update remote source my-source
  `

  async action({ garden, log, headerLog, args }: CommandParams<Args>): Promise<CommandResult<SourceConfig[]>> {
    printHeader(headerLog, "Update remote sources", "hammer_and_wrench")
    return updateRemoteSources({ garden, log, args })
  }
}

export async function updateRemoteSources({
  garden,
  log,
  args,
}: {
  garden: Garden
  log: LogEntry
  args: ParameterValues<Args>
}): Promise<CommandResult<SourceConfig[]>> {
  const { sources } = args

  const projectSources = garden.projectSources.filter((src) => (sources ? sources.includes(src.name) : true))

  const names = projectSources.map((src) => src.name)

  // TODO: Make external modules a cli type to avoid validation repetition
  const diff = difference(sources, names)
  if (diff.length > 0) {
    throw new ParameterError(
      `Expected source(s) ${chalk.underline(diff.join(","))} to be specified in the project garden.yml config.`,
      {
        remoteSources: garden.projectSources.map((s) => s.name).sort(),
        input: sources ? sources.sort() : undefined,
      }
    )
  }

  // TODO Update remotes in parallel. Currently not possible since updating might
  // trigger a username and password prompt from git.
  for (const { name, repositoryUrl } of projectSources) {
    await garden.vcs.updateRemoteSource({
      name,
      url: repositoryUrl,
      sourceType: "project",
      log,
    })
  }

  await pruneRemoteSources({
    gardenDirPath: garden.gardenDirPath,
    type: "project",
    sources: projectSources,
  })

  return { result: projectSources }
}
