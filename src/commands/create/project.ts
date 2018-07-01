/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { parse, resolve, join } from "path"
import { pathExists, ensureDir, mkdir } from "fs-extra"
import Bluebird = require("bluebird")
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
import { EntryStyle } from "../../logger/types"
import {
  prepareNewModuleConfig,
  dumpConfig,
} from "./helpers"
import { prompts } from "./prompts"
import {
  projectTemplate,
  ModuleConfigOpts,
  ProjectConfigOpts,
  moduleSchema,
} from "../create/config-templates"
import { getChildDirNames } from "../../util/util"
import { validate, joiIdentifier } from "../../types/common"
import { projectSchema } from "../../types/project"

export const createProjectOptions = {
  "module-dirs": new StringParameter({
    help: "Relative path to modules directory. Use comma as a separator to specify multiple directories",
  }),
  new: new BooleanParameter({
    help: "If true, creates a new directory. Otherwise assumes current working directory is the project directory",
  }),
}

export const createProjectArguments = {
  projectName: new StringParameter({
    help: "The name of the project, (defaults to project root directory name)",
  }),
}

export type Args = ParameterValues<typeof createProjectArguments>
export type Opts = ParameterValues<typeof createProjectOptions>

const flatten = (acc, val) => acc.concat(val)

interface CreateProjectResult extends CommandResult {
  result: {
    projectConfig: ProjectConfigOpts,
    moduleConfigs: ModuleConfigOpts[],
  }
}

export class CreateProjectCommand extends Command<typeof createProjectArguments, typeof createProjectOptions> {
  name = "project"
  alias = "p"
  help = "Creates scaffolding for a new Garden project."

  description = dedent`
    The Create command walks the user through setting up a new Garden project and generates scaffolding based on user
    input.

    Examples:

        garden create project # creates a new Garden project in the current directory (project name defaults to
        directory name)
        garden create project my-project # creates a new Garden project named my-project in the current directory
        garden create project --module-dirs=services,more-services
        # creates a new Garden project and looks for modules in the services and more-services directories
        garden create project my-project --new  # creates a new Garden project in a new directory named my-project
  `

  runWithoutConfig = true
  arguments = createProjectArguments
  options = createProjectOptions

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<CreateProjectResult> {
    let { projectRoot } = ctx
    let moduleConfigs: ModuleConfigOpts[] = []
    let errors: GardenBaseError[] = []

    if (opts.new && !args.projectName) {
      throw new ParameterError("A project name is required if --new option is used", {})
    }

    const projectName = validate(
      args.projectName ? args.projectName.trim() : parse(projectRoot).base,
      joiIdentifier(),
      { context: "project name" },
    )

    // Resolve and validate dirs that contain modules
    let moduleParentDirs: string[] = []
    if (!opts.new && opts["module-dirs"]) {
      const dirs = opts["module-dirs"].split(",")
      moduleParentDirs = await Bluebird
        .map(dirs, (dir: string) => resolve(projectRoot, dir))
        .each(async (dir: string) => {
          if (!(await pathExists(dir))) {
            throw new ParameterError(`Directory ${dir} not found`, {})
          }
        })
    }

    // Project will be created in a new directory
    if (opts.new) {
      projectRoot = join(projectRoot, projectName)
      try {
        await mkdir(projectRoot)
      } catch ({ message }) {
        throw new ParameterError(`Unable to make directory at ${projectRoot}`, { message })
      }
    }

    ctx.log.header({ emoji: "house_with_garden", command: "create" })
    ctx.log.info(`Initializing new Garden project ${projectName}`)
    ctx.log.info("---------")
    // Stop logger while prompting
    ctx.log.stop()

    if (moduleParentDirs.length > 0) {
      // If module-dirs option provided we scan for modules in the parent dir(s) and add them one by one
      moduleConfigs = (await Bluebird.map(moduleParentDirs, async parentDir => {
        const moduleNames = await getChildDirNames(parentDir)

        return Bluebird.reduce(moduleNames, async (acc: ModuleConfigOpts[], moduleName: string) => {
          const { type } = await prompts.addConfigForModule(moduleName)
          if (type) {
            acc.push(prepareNewModuleConfig(moduleName, type, join(parentDir, moduleName)))
          }
          return acc
        }, [])
      }))
        .reduce(flatten, [])
        .filter(m => m)
    } else {
      // Otherwise we prompt the user for modules to add
      moduleConfigs = (await prompts.repeatAddModule())
        .map(({ name, type }) => prepareNewModuleConfig(name, type, join(projectRoot, name)))
    }

    ctx.log.info("---------")
    const task = ctx.log.info({ msg: "Setting up project", entryStyle: EntryStyle.activity })

    for (const module of moduleConfigs) {
      await ensureDir(module.path)
      try {
        await dumpConfig(module, moduleSchema, ctx.log)
      } catch (err) {
        errors.push(err)
      }
    }

    const projectConfig: ProjectConfigOpts = {
      path: projectRoot,
      name: projectName,
      config: projectTemplate(projectName, moduleConfigs.map(module => module.type)),
    }
    try {
      await dumpConfig(projectConfig, projectSchema, ctx.log)
    } catch (err) {
      errors.push(err)
    }

    if (errors.length === 0) {
      task.setSuccess()
    } else {
      task.setWarn({ msg: "Finished with errors", append: true })
    }

    ctx.log.info("Project created! Be sure to check out our docs at `https://docs.garden.io`")

    return {
      result: {
        moduleConfigs,
        projectConfig,
      },
      errors,
    }
  }
}
