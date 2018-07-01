/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { basename, join } from "path"
import dedent = require("dedent")

import {
  PluginContext,
} from "../../plugin-context"
import {
  Command,
  CommandResult,
  StringParameter,
  ParameterValues,
  BooleanParameter,
} from "../base"
import { ParameterError, GardenBaseError } from "../../exceptions"
import { availableModuleTypes, ModuleType, moduleSchema, ModuleConfigOpts } from "./config-templates"
import {
  prepareNewModuleConfig,
  dumpConfig,
} from "./helpers"
import { prompts } from "./prompts"
import { validate, joiIdentifier } from "../../types/common"
import { mkdir } from "fs-extra"

export const createModuleOptions = {
  new: new BooleanParameter({
    help: "If true, creates a new directory. Otherwise assumes current working directory is the module directory",
  }),
  type: new StringParameter({
    help: "Type of module. Check out 'https://docs.garden.io' for available types",
  }),
}

export const createModuleArguments = {
  moduleName: new StringParameter({
    help: "The name of the module, (defaults to current directory name)",
  }),
}

export type Args = ParameterValues<typeof createModuleArguments>
export type Opts = ParameterValues<typeof createModuleOptions>

interface CreateModuleResult extends CommandResult {
  result: {
    module?: ModuleConfigOpts,
  }
}

export class CreateModuleCommand extends Command<typeof createModuleArguments, typeof createModuleOptions> {
  name = "module"
  alias = "m"
  help = "Creates scaffolding for a new Garden project."

  description = dedent`
    The Create command walks the user through setting up a new Garden project and generates scaffolding based on user
    input.

    Examples:

        garden create module # scaffolds a new module in the current directory (module name defaults to directory name)
        garden create module my-module # scaffolds a new module named my-module in the current directory
  `

  runWithoutConfig = true
  arguments = createModuleArguments
  options = createModuleOptions

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CreateModuleResult> {
    let errors: GardenBaseError[] = []
    const { projectRoot } = ctx

    if (opts.new && !args.moduleName) {
      throw new ParameterError("A module name is required if --new option is used", {})
    }

    const moduleName = validate(
      args.moduleName ? args.moduleName.trim() : basename((projectRoot)),
      joiIdentifier(),
      { context: "module name" },
    )

    ctx.log.header({ emoji: "house_with_garden", command: "create" })
    ctx.log.info(`Initializing new module ${moduleName}`)

    let type: ModuleType

    if (opts.type) {
      // Type passed as parameter
      type = opts.type
      if (!availableModuleTypes.includes(type)) {
        throw new ParameterError("Module type not available", {})
      }
    } else {
      // Prompt for type
      ctx.log.info("---------")
      ctx.log.stop()
      type = (await prompts.addConfigForModule(moduleName)).type
      ctx.log.info("---------")
      if (!type) {
        return { result: {} }
      }
    }

    let path = projectRoot
    if (opts.new) {
      path = join(projectRoot, moduleName)
      try {
        await mkdir(path)
      } catch ({ message }) {
        throw new ParameterError(`Unable to make directory at ${path}`, { message })
      }
    }
    const module = prepareNewModuleConfig(moduleName, type, path)
    try {
      await dumpConfig(module, moduleSchema, ctx.log)
    } catch (err) {
      errors.push(err)
    }
    return {
      result: { module },
      errors,
    }
  }
}
