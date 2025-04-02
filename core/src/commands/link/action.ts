/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import dedent from "dedent"

import { ParameterError } from "../../exceptions.js"
import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import type { LinkedSource } from "../../config-store/local.js"
import { printHeader } from "../../logger/util.js"
import { addLinkedSources } from "../../util/ext-source-util.js"
import { joiArray, joi } from "../../config/common.js"
import { StringParameter, PathParameter } from "../../cli/params.js"
import { linkedActionSchema } from "../../config/project.js"
import { actionKinds } from "../../actions/types.js"
import { styles } from "../../logger/styles.js"

const linkActionArguments = {
  action: new StringParameter({
    help: "The full key of the action (e.g. deploy.api).",
    required: true,
    getSuggestions: ({ configDump }) => {
      return actionKinds.flatMap((kind) => Object.keys(configDump.actionConfigs[kind]).map((name) => `${kind}.${name}`))
    },
  }),
  path: new PathParameter({
    help: "Path to the local directory that contains the action.",
    required: true,
  }),
}

type Args = typeof linkActionArguments

interface Output {
  sources: LinkedSource[]
}

export class LinkActionCommand extends Command<Args> {
  name = "action"
  help = "Link a remote action to a local directory."
  override arguments = linkActionArguments

  override outputsSchema = () =>
    joi.object().keys({
      sources: joiArray(linkedActionSchema()).description("A list of all locally linked remote actions."),
    })

  override description = dedent`
    After linking a remote action, Garden will read the source from the linked local directory instead of the remote repository. Garden can only link actions that have a remote source, i.e. actions that specify a \`source.repository.url\` in their configuration.

    Examples:

        garden link action build.my-build path/to/my-build # links Build my-build to its local version at the given path
  `

  override printHeader({ log }) {
    printHeader(log, "Link action", "🔗")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult<Output>> {
    const sourceType = "action"
    const path = args.path

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getActionByRef(args.action, { includeDisabled: true })
    const key = action.key()

    if (!action.hasRemoteSource()) {
      throw new ParameterError({
        message: dedent`
          Expected action ${styles.underline(key)} to have a remote source.
          Did you mean to use the "link source" command?
        `,
      })
    }

    const absPath = resolve(garden.projectRoot, path)
    const linkedActionSources = await addLinkedSources({
      garden,
      sourceType,
      sources: [{ name: key, path: absPath }],
    })

    log.info(`Linked action ${key} to path ${path}`)

    return { result: { sources: linkedActionSources } }
  }
}
