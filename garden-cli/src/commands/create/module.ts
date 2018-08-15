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
  Command,
  CommandResult,
  StringParameter,
  ParameterValues,
  BooleanParameter,
  ChoicesParameter,
  CommandParams,
} from "../base"
import { ParameterError, GardenBaseError } from "../../exceptions"
import { availableModuleTypes, ModuleType, moduleSchema, ModuleConfigOpts } from "./config-templates"
import {
  prepareNewModuleConfig,
  dumpConfig,
} from "./helpers"
import { prompts } from "./prompts"
import { validate, joiIdentifier } from "../../config/common"
import { ensureDir } from "fs-extra"

export const createModuleOptions = {
  name: new BooleanParameter({
    help: "Assigns a custom name to the module. (Defaults to name of the current directory.)",
  }),
  type: new ChoicesParameter({
    help: "Type of module.",
    choices: availableModuleTypes,
  }),
}

export const createModuleArguments = {
  "module-dir": new StringParameter({
    help: "Directory of the module. (Defaults to current directory.)",
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
  help = "Creates a new Garden module."

  description = dedent`
    Creates a new Garden module of the given type

    Examples:

        garden create module # creates a new module in the current directory (module name defaults to directory name)
        garden create module my-module # creates a new module in my-module directory
        garden create module --type=container # creates a new container module
        garden create module --name=my-module # creates a new module in current directory and names it my-module
  `

  noProject = true
  arguments = createModuleArguments
  options = createModuleOptions

  async action({ ctx, args, opts }: CommandParams<Args, Opts>): Promise<CreateModuleResult> {
    let errors: GardenBaseError[] = []

    const moduleRoot = join(ctx.projectRoot, (args["module-dir"] || "").trim())
    const moduleName = validate(
      opts.name || basename(moduleRoot),
      joiIdentifier(),
      { context: "module name" },
    )

    await ensureDir(moduleRoot)

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

    const module = prepareNewModuleConfig(moduleName, type, moduleRoot)
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
