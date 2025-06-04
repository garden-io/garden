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
import type { SourceConfig } from "../../config/project.js"
import { actionSourceSchema } from "../../config/project.js"
import { ParameterError } from "../../exceptions.js"
import { pruneRemoteSources, updateRemoteSharedOptions } from "./helpers.js"
import { printHeader } from "../../logger/util.js"
import type { Garden } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import { joiArray, joi } from "../../config/common.js"
import type { ParameterValues } from "../../cli/params.js"
import { StringsParameter } from "../../cli/params.js"
import pMap from "p-map"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"

const updateRemoteActionsArguments = {
  actions: new StringsParameter({
    help: "The name(s) of the remote action(s) to update. You may specify multiple actions, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs)
    },
  }),
}

type Args = typeof updateRemoteActionsArguments

const updateRemoteActionsOptions = {
  ...updateRemoteSharedOptions,
}

type Opts = typeof updateRemoteActionsOptions

interface Output {
  sources: SourceConfig[]
}

export class UpdateRemoteActionsCommand extends Command<Args, Opts> {
  name = "actions"
  override aliases = ["action"]

  help = "Update remote actions."
  override arguments = updateRemoteActionsArguments
  override options = updateRemoteActionsOptions

  override outputsSchema = () =>
    joi.object().keys({
      sources: joiArray(actionSourceSchema()).description("A list of all external action sources in the project."),
    })

  override description = dedent`
    Updates remote actions, i.e. actions that have a \`source.repository.url\` field set in their config that points to a remote repository.

    Examples:

        garden update-remote actions --parallel      # update all remote actions in parallel mode
        garden update-remote actions                 # update all remote actions in the project
        garden update-remote action build.my-build   # update remote Build my-build
  `

  override printHeader({ log }) {
    printHeader(log, "Update remote actions", "🛠️")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<Output>> {
    return updateRemoteActions({ garden, log, args, opts })
  }
}

export async function updateRemoteActions({
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
  const { actions: keys } = args
  const graph = await garden.getConfigGraph({ log, emit: false, statusOnly: true })
  const actions = graph.getActions({ refs: keys })

  const actionSources = <SourceConfig[]>actions
    .filter((a) => a.hasRemoteSource())
    .filter((a) => (keys ? keys.includes(a.key()) : true))
    .map((a) => ({ name: a.key(), repositoryUrl: a.getConfig().source.repository.url }))

  const names = actionSources.map((src) => src.name)
  const diff = difference(keys, names)

  if (diff.length > 0) {
    const actionsWithRemoteSource = graph
      .getActions()
      .filter((a) => a.hasRemoteSource())
      .sort()

    throw new ParameterError({
      message: dedent`
        Expected action(s) ${styles.underline(diff.join(","))} to have a remote source.
        Actions with remote source: ${naturalList(actionsWithRemoteSource.map((a) => a.name))}
      `,
    })
  }

  if (actionSources.length > 0) {
    await pMap(
      actionSources,
      ({ name, repositoryUrl }) => {
        return garden.vcs.updateRemoteSource({
          name,
          url: repositoryUrl,
          sourceType: "action",
          log,
          failOnPrompt: opts.parallel,
        })
      },
      { concurrency: opts.parallel ? actionSources.length : 1 }
    )
  }

  await pruneRemoteSources({
    gardenDirPath: garden.gardenDirPath,
    type: "action",
    sources: actionSources,
  })

  return { result: { sources: actionSources } }
}
