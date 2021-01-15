/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams } from "../base"
import { StringsParameter, BooleanParameter } from "../../cli/params"
import { moduleSchema, GardenModule } from "../../types/module"
import { keyBy, omit, sortBy } from "lodash"
import { joiIdentifierMap, joi } from "../../config/common"
import { printHeader } from "../../logger/util"
import chalk from "chalk"
import { renderTable, dedent } from "../../util/string"
import { relative, sep } from "path"

const getModulesArgs = {
  modules: new StringsParameter({
    help:
      "Specify module(s) to list. Use comma as a separator to specify multiple modules. Skip to return all modules.",
  }),
}

const getModulesOptions = {
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled modules from output.",
  }),
}

type Args = typeof getModulesArgs
type Opts = typeof getModulesOptions

type OutputModule = Omit<GardenModule, "_config">

export class GetModulesCommand extends Command {
  name = "modules"
  alias = "module"
  help = "Outputs all or specified modules."
  description = dedent`
    Outputs all or specified modules. Use with --output=json and jq to extract specific fields.

    Examples:

        garden get modules                                                # list all modules in the project
        garden get modules --exclude-disabled=true                        # skip disabled modules
        garden get modules -o=json | jq '.modules["my-module"].version'   # get version of my-module
  `

  arguments = getModulesArgs
  options = getModulesOptions

  outputsSchema = () => joi.object().keys({ modules: joiIdentifierMap(moduleSchema()) })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get Modules", "open_book")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>) {
    const graph = await garden.getConfigGraph(log)

    const modules: OutputModule[] = sortBy(
      graph
        .getModules({ names: args.modules, includeDisabled: !opts["exclude-disabled"] })
        .map((m) => omit(m, "_config")),
      "name"
    )

    const modulesByName = keyBy(modules, "name")

    const heading = ["Name", "Version", "Type", "Path"].map((s) => chalk.bold(s))
    const rows: string[][] = modules.map((m: OutputModule) => {
      const relPath = relative(garden.projectRoot, m.path)

      return [
        chalk.cyan.bold(m.name),
        m.version.versionString,
        m.type,
        relPath.startsWith("..") ? relPath : "." + sep + relPath,
      ]
    })

    log.info("")
    log.info(renderTable([heading].concat(rows)))

    return { result: { modules: modulesByName } }
  }
}
