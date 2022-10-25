/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { emoji as nodeEmoji } from "node-emoji"
import { Command, CommandParams } from "../base"
import { StringsParameter, BooleanParameter } from "../../cli/params"
import { moduleSchema, GardenModule } from "../../types/module"
import { keyBy, omit, sortBy } from "lodash"
import { joiIdentifierMap, joi, StringMap } from "../../config/common"
import { printHeader, renderDivider } from "../../logger/util"
import chalk from "chalk"
import { renderTable, dedent, deline } from "../../util/string"
import { relative, sep } from "path"
import { Garden } from "../.."
import { LogEntry } from "../../logger/log-entry"
import { deepMap, highlightYaml, safeDumpYaml } from "../../util/util"
import { withoutInternalFields } from "../../logger/logger"

const getModulesArgs = {
  modules: new StringsParameter({
    help:
      "Specify module(s) to list. Use comma as a separator to specify multiple modules. Skip to return all modules.",
  }),
}

const getModulesOptions = {
  "full": new BooleanParameter({
    help: deline`
      Show the full config for each module, with template strings resolved. Has no effect when the --output option is used.
    `,
  }),
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled modules from output.",
  }),
}

type Args = typeof getModulesArgs
type Opts = typeof getModulesOptions

type OutputModule = Omit<GardenModule, "_config" | "buildDependencies">

export class GetModulesCommand extends Command {
  name = "modules"
  aliases = ["module"]
  help = "Outputs all or specified modules."
  description = dedent`
    Outputs all or specified modules. Use with --output=json and jq to extract specific fields.

    Examples:

        garden get modules                                                # list all modules in the project
        garden get modules --exclude-disabled=true                        # skip disabled modules
        garden get modules --full                                         # show resolved config for each module
        garden get modules -o=json | jq '.modules["my-module"].version'   # get version of my-module
  `

  arguments = getModulesArgs
  options = getModulesOptions

  outputsSchema = () => joi.object().keys({ modules: joiIdentifierMap(moduleSchema()) })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Get Modules", "open_book")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>) {
    const graph = await garden.getConfigGraph({ log, emit: false })

    const modules = sortBy(
      graph.getModules({ names: args.modules, includeDisabled: !opts["exclude-disabled"] }),
      "name"
    )

    const modulesByName: { [name: string]: OutputModule } = keyBy(modules.map(withoutInternalFields), "name")

    if (opts["full"]) {
      logFull(garden, modules, log)
    } else {
      logAsTable(garden, modules, log)
    }
    return { result: { modules: modulesByName } }
  }
}

function logFull(garden: Garden, modules: GardenModule[], log: LogEntry) {
  const divider = chalk.gray(renderDivider())
  log.info("")
  for (const module of modules) {
    const version = module.version.versionString
    let rendered: any = {
      version,
      path: getRelativeModulePath(garden.projectRoot, module.path),
      ...omit(
        withoutInternalFields(module),
        "version",
        "path",
        "_config",
        "variables",
        "buildPath",
        "configPath",
        "plugin",
        "serviceConfigs",
        "testConfigs",
        "taskConfigs",
        "serviceDependencyNames",
        "serviceNames",
        "taskDependencyNames",
        "taskNames"
      ),
    }
    rendered = filterSecrets(rendered, garden.secrets)
    const yaml = safeDumpYaml(rendered, { noRefs: true, sortKeys: true })
    log.info(dedent`
      ${divider}
      ${nodeEmoji.seedling}  Module: ${chalk.green(module.name)}
      ${divider}\n
    `)
    log.info(highlightYaml(yaml))
  }
}

function logAsTable(garden: Garden, modules: GardenModule[], log: LogEntry) {
  const heading = ["Name", "Version", "Type", "Path"].map((s) => chalk.bold(s))
  const rows: string[][] = modules.map((m) => [
    chalk.cyan.bold(m.name),
    m.version.versionString,
    m.type,
    getRelativeModulePath(garden.projectRoot, m.path),
  ])

  log.info("")
  log.info(renderTable([heading].concat(rows)))
}

function getRelativeModulePath(projectRoot: string, modulePath: string): string {
  const relPath = relative(projectRoot, modulePath)
  return relPath.startsWith("..") ? relPath : "." + sep + relPath
}

/**
 * Replaces any string value in `object` that matches one of the values in `secrets` with a placeholder.
 *
 * Used for sanitizing output that may contain secret values.
 */
function filterSecrets<T extends object>(object: T, secrets: StringMap): T {
  const secretValues = new Set(Object.values(secrets))
  const secretNames = Object.keys(secrets)
  const sanitized = <T>deepMap(object, (value) => {
    if (secretValues.has(value)) {
      const name = secretNames.find((n) => secrets[n] === value)!
      return `[filtered secret: ${name}]`
    } else {
      return value
    }
  })
  return sanitized
}
