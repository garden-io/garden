/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams } from "../base.js"
import { Command } from "../base.js"
import { StringsParameter, BooleanParameter } from "../../cli/params.js"
import type { GardenModule } from "../../types/module.js"
import { moduleSchema } from "../../types/module.js"
import { keyBy, omit, sortBy } from "lodash-es"
import type { StringMap } from "../../config/common.js"
import { joiIdentifierMap, createSchema } from "../../config/common.js"
import { printEmoji, printHeader, renderDivider } from "../../logger/util.js"
import { withoutInternalFields } from "../../util/logging.js"
import { renderTable, dedent, deline } from "../../util/string.js"
import { relative, sep } from "path"
import type { Garden } from "../../index.js"
import type { Log } from "../../logger/log-entry.js"
import { safeDumpYaml } from "../../util/serialization.js"
import { deepMap } from "../../util/objects.js"
import { styles } from "../../logger/styles.js"

const getModulesArgs = {
  modules: new StringsParameter({
    help: "Specify module(s) to list. You may specify multiple modules, separated by spaces. Skip to return all modules.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.moduleConfigs)
    },
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

const outputsSchema = createSchema({
  name: "GetModulesCommand:outputs",
  keys: () => ({ modules: joiIdentifierMap(moduleSchema()) }),
})

export class GetModulesCommand extends Command {
  name = "modules"
  override aliases = ["module"]
  help = "Outputs all or specified modules."
  override description = dedent`
    Outputs all or specified modules. Use with --output=json and jq to extract specific fields.

    Examples:

        garden get modules                                                # list all modules in the project
        garden get modules --exclude-disabled=true                        # skip disabled modules
        garden get modules --full                                         # show resolved config for each module
        garden get modules -o=json | jq '.modules["my-module"].version'   # get version of my-module
  `

  override arguments = getModulesArgs
  override options = getModulesOptions

  override outputsSchema = outputsSchema

  override printHeader({ log }) {
    printHeader(log, "Get Modules", "📖")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>) {
    let actionsFilter: string[] | undefined = undefined

    if (args.modules) {
      actionsFilter = args.modules.map((name) => `build.${name}`)
    }

    const graph = await garden.getConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })

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

function logFull(garden: Garden, modules: GardenModule[], log: Log) {
  const divider = styles.primary(renderDivider())
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
      ${printEmoji("🌱", log)}  Module: ${styles.success(module.name)}
      ${divider}\n
    `)
    log.info(yaml)
  }
}

function logAsTable(garden: Garden, modules: GardenModule[], log: Log) {
  const heading = ["Name", "Version", "Type", "Path"].map((s) => styles.bold(s))
  const rows: string[][] = modules.map((m) => [
    styles.highlight.bold(m.name),
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
    if (typeof value === "string" && secretValues.has(value)) {
      const name = secretNames.find((n) => secrets[n] === value)!
      return `[filtered secret: ${name}]`
    } else {
      return value
    }
  })
  return sanitized
}
