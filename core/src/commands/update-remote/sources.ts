/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { difference } from "lodash-es"
import dedent from "dedent"

import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import { ParameterError } from "../../exceptions.js"
import { pruneRemoteSources, updateRemoteSharedOptions } from "./helpers.js"
import type { SourceConfig } from "../../config/project.js"
import { projectSourceSchema } from "../../config/project.js"
import { printHeader } from "../../logger/util.js"
import type { Garden } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import { joiArray, joi } from "../../config/common.js"
import type { ParameterValues } from "../../cli/params.js"
import { StringsParameter } from "../../cli/params.js"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"

const updateRemoteSourcesArguments = {
  sources: new StringsParameter({
    help: "The name(s) of the remote source(s) to update. You may specify multiple sources, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return configDump.sources.map((s) => s.name)
    },
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
  override arguments = updateRemoteSourcesArguments
  override options = updateRemoteSourcesOptions

  override outputsSchema = () =>
    joi.object().keys({
      sources: joiArray(projectSourceSchema()).description("A list of all configured external project sources."),
    })

  override description = dedent`
    Updates the remote sources declared in the project level \`garden.yml\` config file.

    Examples:

        garden update-remote sources --parallel # update all remote sources in parallel mode
        garden update-remote sources            # update all remote sources
        garden update-remote sources my-source  # update remote source my-source
  `

  override printHeader({ log }) {
    printHeader(log, "Update remote sources", "🛠️")
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
  log: Log
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
    throw new ParameterError({
      message: dedent`
        Expected source(s) ${styles.underline(diff.join(","))} to be specified in the project garden.yml config.
        Configured remote sources: ${naturalList(projectSources.map((s) => s.name).sort())}
      `,
    })
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
