/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash"
import dedent = require("dedent")
import chalk from "chalk"

import { Command, CommandResult, CommandParams } from "../base"
import { ParameterError } from "../../exceptions"
import { pruneRemoteSources, updateRemoteSharedOptions } from "./helpers"
import { SourceConfig, projectSourceSchema } from "../../config/project"
import { printHeader } from "../../logger/util"
import { Garden } from "../../garden"
import { LogEntry } from "../../logger/log-entry"
import { joiArray, joi } from "../../config/common"
import { StringsParameter, ParameterValues } from "../../cli/params"

const updateRemoteSourcesArguments = {
  sources: new StringsParameter({
    help: "The name(s) of the remote source(s) to update. Use comma as a separator to specify multiple sources.",
  }),
}

type Args = typeof updateRemoteSourcesArguments

const updateRemoteSourcesOptions = {
  ...updateRemoteSharedOptions,
}

type Opts = typeof updateRemoteSourcesOptions

interface Output {
  sources: SourceConfig[]
}

export class UpdateRemoteSourcesCommand extends Command<Args, Opts> {
  name = "sources"
  help = "Update remote sources."
  arguments = updateRemoteSourcesArguments
  options = updateRemoteSourcesOptions

  outputsSchema = () =>
    joi.object().keys({
      sources: joiArray(projectSourceSchema()).description("A list of all configured external project sources."),
    })

  description = dedent`
    Updates the remote sources declared in the project level \`garden.yml\` config file.

    Examples:

        garden update-remote sources --parallel # update all remote sources in parallel mode
        garden update-remote sources            # update all remote sources
        garden update-remote sources my-source  # update remote source my-source
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Update remote sources", "hammer_and_wrench")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<Output>> {
    return updateRemoteSources({ garden, log, args, opts })
  }
}

export async function updateRemoteSources({
  garden,
  log,
  args,
  opts,
}: {
  garden: Garden
  log: LogEntry
  args: ParameterValues<Args>
  opts: ParameterValues<Opts>
}) {
  const { sources } = args

  const projectSources = garden.getProjectSources()
  const selectedSources = projectSources.filter((src) => (sources ? sources.includes(src.name) : true))

  const names = projectSources.map((src) => src.name)

  // TODO: Make external modules a cli type to avoid validation repetition
  const diff = difference(sources, names)
  if (diff.length > 0) {
    throw new ParameterError(
      `Expected source(s) ${chalk.underline(diff.join(","))} to be specified in the project garden.yml config.`,
      {
        remoteSources: projectSources.map((s) => s.name).sort(),
        input: sources ? sources.sort() : undefined,
      }
    )
  }

  const promises: Promise<void>[] = []
  for (const { name, repositoryUrl } of selectedSources) {
    const promise = garden.vcs.updateRemoteSource({
      name,
      url: repositoryUrl,
      sourceType: "project",
      log,
      failOnPrompt: opts.parallel,
    })
    if (opts.parallel) {
      promises.push(promise)
    } else {
      await promise
    }
  }
  await Promise.all(promises)

  await pruneRemoteSources({
    gardenDirPath: garden.gardenDirPath,
    type: "project",
    sources: selectedSources,
  })

  return { result: { sources: selectedSources } }
}
