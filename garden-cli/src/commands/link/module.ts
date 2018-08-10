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
import { PluginContext } from "../../plugin-context"
import {
  Command,
  CommandResult,
  ParameterValues,
  StringParameter,
  PathParameter,
} from "../base"
import {
  LinkedSource,
} from "../../config-store"
import {
  addLinkedSources,
  hasRemoteSource,
} from "../../util/ext-source-util"

export const linkModuleArguments = {
  module: new StringParameter({
    help: "Name of the module to link.",
    required: true,
  }),
  path: new PathParameter({
    help: "Path to the local directory that containes the module.",
    required: true,
  }),
}

export type LinkModuleArguments = ParameterValues<typeof linkModuleArguments>

export class LinkModuleCommand extends Command<typeof linkModuleArguments> {
  name = "module"
  help = "Link a module to a local directory."
  arguments = linkModuleArguments

  description = dedent`
    After linking a remote module, Garden will read the source from the module's local directory instead of from
    the remote URL. Garden can only link modules that have a remote source,
    i.e. modules that specifiy a repositoryUrl in their garden.yml config file.

    Examples:

        garden link module my-module path/to/my-module # links my-module to its local version at the given path
  `

  async action(ctx: PluginContext, args: LinkModuleArguments): Promise<CommandResult<LinkedSource[]>> {

    ctx.log.header({ emoji: "link", command: "link module" })

    const sourceType = "module"

    const { module: moduleName, path } = args
    const moduleToLink = await ctx.getModule(moduleName)

    const isRemote = [moduleToLink].filter(hasRemoteSource)[0]
    if (!isRemote) {
      const modulesWithRemoteSource = (await ctx.getModules()).filter(hasRemoteSource).sort()

      throw new ParameterError(
        `Expected module(s) ${chalk.underline(moduleName)} to have a remote source.` +
        ` Did you mean to use the "link source" command?`,
        {
          modulesWithRemoteSource,
          input: module,
        },
      )
    }

    const absPath = resolve(ctx.projectRoot, path)
    const linkedModuleSources = await addLinkedSources({
      ctx,
      sourceType,
      sources: [{ name: moduleName, path: absPath }],
    })

    ctx.log.info(`Linked module ${moduleName}`)

    return { result: linkedModuleSources }

  }
}
