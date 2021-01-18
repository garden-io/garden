/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import dedent = require("dedent")
import chalk from "chalk"

import { ParameterError } from "../../exceptions"
import { Command, CommandResult, CommandParams } from "../base"
import { LinkedSource } from "../../config-store"
import { printHeader } from "../../logger/util"
import { addLinkedSources, hasRemoteSource } from "../../util/ext-source-util"
import { joiArray, joi } from "../../config/common"
import { linkedModuleSchema } from "../../config/project"
import { StringParameter, PathParameter } from "../../cli/params"

const linkModuleArguments = {
  module: new StringParameter({
    help: "Name of the module to link.",
    required: true,
  }),
  path: new PathParameter({
    help: "Path to the local directory that contains the module.",
    required: true,
  }),
}

type Args = typeof linkModuleArguments

interface Output {
  sources: LinkedSource[]
}

export class LinkModuleCommand extends Command<Args> {
  name = "module"
  help = "Link a module to a local directory."
  arguments = linkModuleArguments

  workflows = true

  outputsSchema = () =>
    joi.object().keys({
      sources: joiArray(linkedModuleSchema()).description("A list of all locally linked external modules."),
    })

  description = dedent`
    After linking a remote module, Garden will read the source from the module's local directory instead of from
    the remote URL. Garden can only link modules that have a remote source,
    i.e. modules that specifiy a \`repositoryUrl\` in their \`garden.yml\` config file.

    Examples:

        garden link module my-module path/to/my-module # links my-module to its local version at the given path
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Link module", "link")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult<Output>> {
    const sourceType = "module"

    const { module: moduleName, path } = args
    const graph = await garden.getConfigGraph(log)
    const moduleToLink = graph.getModule(moduleName)

    const isRemote = [moduleToLink].filter(hasRemoteSource)[0]
    if (!isRemote) {
      const modulesWithRemoteSource = graph.getModules().filter(hasRemoteSource).sort()

      throw new ParameterError(
        `Expected module(s) ${chalk.underline(moduleName)} to have a remote source.` +
          ` Did you mean to use the "link source" command?`,
        {
          modulesWithRemoteSource,
          input: module,
        }
      )
    }

    const absPath = resolve(garden.projectRoot, path)
    const linkedModuleSources = await addLinkedSources({
      garden,
      sourceType,
      sources: [{ name: moduleName, path: absPath }],
    })

    log.info(`Linked module ${moduleName}`)

    return { result: { sources: linkedModuleSources } }
  }
}
