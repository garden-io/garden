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

const createModuleOptions = {
  name: new StringParameter({
    help: "Assigns a custom name to the module. (Defaults to name of the current directory.)",
  }),
  type: new ChoicesParameter({
    help: "Type of module.",
    choices: availableModuleTypes,
  }),
}

const createModuleArguments = {
  "module-dir": new StringParameter({
    help: "Directory of the module. (Defaults to current directory.)",
  }),
}

type Args = typeof createModuleArguments
type Opts = typeof createModuleOptions

interface CreateModuleResult extends CommandResult {
  result: {
    module?: ModuleConfigOpts,
  }
}

export class CreateModuleCommand extends Command<Args, Opts> {
  name = "module"
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

  async action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CreateModuleResult> {
    let errors: GardenBaseError[] = []

    const moduleRoot = join(garden.projectRoot, (args["module-dir"] || "").trim())
    const moduleName = validate(
      opts.name || basename(moduleRoot),
      joiIdentifier(),
      { context: "module name" },
    )

    await ensureDir(moduleRoot)

    garden.log.header({ emoji: "house_with_garden", command: "create" })
    garden.log.info(`Initializing new module ${moduleName}`)

    let type: ModuleType

    if (opts.type) {
      // Type passed as parameter
      type = <ModuleType>opts.type
      if (!availableModuleTypes.includes(type)) {
        throw new ParameterError("Module type not available", {})
      }
    } else {
      // Prompt for type
      garden.log.info("---------")
      garden.log.stop()
      type = (await prompts.addConfigForModule(moduleName)).type
      garden.log.info("---------")
      if (!type) {
        return { result: {} }
      }
    }

    const module = prepareNewModuleConfig(moduleName, type, moduleRoot)
    try {
      await dumpConfig(module, moduleSchema, garden.log)
    } catch (err) {
      errors.push(err)
    }
    return {
      result: { module },
      errors,
    }
  }
}
