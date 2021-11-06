/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash"
import chalk from "chalk"
import { StringParameter } from "../../cli/params"
import { StringMap } from "../../config/common"
import { printHeader } from "../../logger/util"
import { GardenModule } from "../../types/module"
import { dedent } from "../../util/string"
import { deepMap, highlightYaml, safeDumpYaml } from "../../util/util"
import { Command, CommandGroup, CommandParams, CommandResult } from "../base"

export class RenderCommand extends CommandGroup {
  name = "render"
  help = "Render and output Garden configuration."

  subCommands = [RenderModuleCommand]
}

const renderModuleArgs = {
  module: new StringParameter({
    help: "The name of the module to render.",
    required: true,
  }),
}

type RenderModuleArgs = typeof renderModuleArgs
type RenderModuleOpts = {}

export class RenderModuleCommand extends Command<RenderModuleArgs, RenderModuleOpts> {
  name = "module"
  help = "Outputs a fully resolved configuration for the requested module."
  description = dedent`
    Outputs the fully resolved module configuration. Resolves all template strings and includes the module's current
    version. This is useful for debugging template strings.

    Examples:
      garden render module my-module          # Renders my-module as YAML
      garden render module my-module -o json  # Renders my-module as JSON
  `

  arguments = renderModuleArgs

  printHeader({ headerLog, args }) {
    printHeader(headerLog, `Rendering module ${chalk.white(args.module)}`, "spiral_note_pad")
  }

  async action({
    garden,
    log,
    args,
  }: CommandParams<RenderModuleArgs, RenderModuleOpts>): Promise<CommandResult<RenderedModule>> {
    const graph = await garden.getConfigGraph({ log, emit: false })
    const module = graph.getModule(args.module)
    const rendered = renderModule(module, garden.secrets)
    const yaml = safeDumpYaml(rendered, { noRefs: true, sortKeys: true })
    log.info("")
    log.info(highlightYaml(yaml))
    return { result: rendered }
  }
}

type RenderedModule = Omit<
  GardenModule,
  | "_config"
  | "variables"
  | "path"
  | "plugin"
  | "version"
  | "buildDependencies"
  | "serviceConfigs"
  | "testConfigs"
  | "taskConfigs"
> & {
  version: string
  buildDependencies: string[]
}

export function renderModule(module: GardenModule, secrets: StringMap): RenderedModule {
  const version = module.version.versionString
  const buildDependencies = Object.keys(module.buildDependencies)
  const filtered = omit(
    module,
    "_config",
    "variables",
    "path",
    "plugin",
    "serviceConfigs",
    "testConfigs",
    "taskConfigs"
  )
  return filterSecrets(
    {
      ...filtered,
      version,
      buildDependencies,
    },
    secrets
  )
}

/**
 * Replaces any string value in `object` that matches one of the values in `secrets` with a placeholder.
 *
 * Used for sanitizing output that may contain secret values.
 */
export function filterSecrets<T extends object>(object: T, secrets: StringMap): T {
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
