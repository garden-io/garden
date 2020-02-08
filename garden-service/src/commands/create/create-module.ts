/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent from "dedent"
import { pathExists } from "fs-extra"
import inquirer from "inquirer"
import {
  Command,
  CommandResult,
  CommandParams,
  PrepareParams,
  PathParameter,
  BooleanParameter,
  StringOption,
} from "../base"
import { printHeader } from "../../logger/util"
import { getConfigFilePath, isDirectory } from "../../util/fs"
import { loadConfig, findProjectConfig } from "../../config/base"
import { resolve, basename, relative } from "path"
import { GardenBaseError, ParameterError } from "../../exceptions"
import { getModuleTypes } from "../../plugins"
import { addConfig } from "./helpers"
import { supportedPlugins } from "../../plugins/plugins"
import { baseModuleSpecSchema } from "../../config/module"
import { renderConfigReference } from "../../docs/config"
import { DOCS_BASE_URL } from "../../constants"
import { flatten } from "lodash"
import { fixedPlugins } from "../../config/project"
import { deline, wordWrap } from "../../util/string"
import { joi } from "../../config/common"
import { LoggerType } from "../../logger/logger"

const createModuleArgs = {}
const createModuleOpts = {
  dir: new PathParameter({
    help: "Directory to place the module in (defaults to current directory).",
    defaultValue: ".",
  }),
  interactive: new BooleanParameter({
    alias: "i",
    help: "Set to false to disable interactive prompts.",
    defaultValue: true,
  }),
  name: new StringOption({
    help: "Name of the module (defaults to current directory name).",
  }),
  type: new StringOption({
    help: "The module type to create. Required if --interactive=false.",
  }),
  // TODO: add type option
}

type CreateModuleArgs = typeof createModuleArgs
type CreateModuleOpts = typeof createModuleOpts

interface CreateModuleResult {
  configPath: string
  name: string
  type: string
}

// TODO: move to common
class CreateError extends GardenBaseError {
  type: "create"
}

export class CreateModuleCommand extends Command<CreateModuleArgs, CreateModuleOpts> {
  name = "module"
  help = "Create a new Garden module."
  noProject = true
  cliOnly = true
  loggerType = <LoggerType>"basic"

  description = dedent`
    Creates a new Garden module configuration. The generated config includes some default values, as well as the
    schema of the config in the form of commentented-out fields.

    Examples:

        garden create module                      # create a Garden module config in the current directory
        garden create module --dir some-dir       # create a Garden module config in the ./some-dir directory
        garden create module --name my-module     # set the module name to my-module
        garden create module --interactive=false  # don't prompt for user inputs when creating the module
  `

  arguments = createModuleArgs
  options = createModuleOpts

  async prepare({ headerLog }: PrepareParams<CreateModuleArgs, CreateModuleOpts>) {
    printHeader(headerLog, "Create new module", "pencil2")
    return { persistent: false }
  }

  async action({
    opts,
    log,
  }: CommandParams<CreateModuleArgs, CreateModuleOpts>): Promise<CommandResult<CreateModuleResult>> {
    const configDir = resolve(process.cwd(), opts.dir)

    if (!(await isDirectory(configDir))) {
      throw new ParameterError(`${configDir} is not a directory`, { configDir })
    }

    const configPath = await getConfigFilePath(configDir)

    let name = opts.name || basename(configDir)
    let type = opts.type

    const allModuleTypes = getModuleTypes(supportedPlugins)

    // TODO: query providers to get suggestions/detected module types/configs

    if (opts.interactive && (!opts.name || !opts.type)) {
      log.root.stop()

      if (!opts.type) {
        const answer = await inquirer.prompt({
          name: "type",
          message: "Select a module type:",
          type: "list",
          choices: Object.keys(allModuleTypes),
          pageSize: 20,
        })
        type = answer.type
      }

      if (!opts.name) {
        const answer = await inquirer.prompt({
          name: "name",
          message: "Set the module name:",
          type: "input",
          default: name,
        })
        name = answer.name
      }

      log.info("")
    }

    if (!type) {
      throw new ParameterError(`Must specify --type if --interactive=false`, {})
    }

    // Throw if module with same name already exists
    if (await pathExists(configPath)) {
      const configs = await loadConfig(configDir, configDir)

      if (configs.filter((c) => c.kind === "Module" && c.name === name).length > 0) {
        throw new CreateError(
          chalk.red(
            `A Garden module named ${chalk.white.bold(name)} already exists in ${chalk.white.bold(configPath)}`
          ),
          {
            configDir,
            configPath,
          }
        )
      }
    }

    const definition = allModuleTypes[type]

    if (!definition) {
      throw new ParameterError(`Could not find module type ${chalk.white.bold(type)}`, {
        availableTypes: Object.keys(allModuleTypes),
      })
    }

    const schema = (definition.schema ? baseModuleSpecSchema.concat(definition.schema) : baseModuleSpecSchema).keys({
      // Hide this from docs until we actually use it
      apiVersion: joi.string().meta({ internal: true }),
    })

    const { yaml } = renderConfigReference(schema, {
      yamlOpts: {
        commentOutEmpty: true,
        filterMarkdown: true,
        renderBasicDescription: true,
        renderFullDescription: false,
        renderValue: "preferExample",
        // TODO: get more values from provider suggestion, if applicable
        presetValues: {
          kind: "Module",
          name,
          type,
        },
      },
    })

    await addConfig(configPath, yaml)

    log.info(chalk.green(`-> Created new module config in ${chalk.bold.white(relative(process.cwd(), configPath))}`))
    log.info("")

    // Warn if module type is defined by provider that isn't configured OR if not in a project, ask to make sure
    // it is configured in the project that will use the module.
    const projectConfig = await findProjectConfig(configDir)
    const pluginName = definition.pluginName

    if (!fixedPlugins.includes(pluginName)) {
      if (projectConfig) {
        const allProviders = flatten([
          projectConfig.providers,
          ...projectConfig.environments.map((e) => e.providers || []),
        ])

        if (!allProviders.map((p) => p.name).includes(definition.pluginName)) {
          log.warn(
            chalk.yellow(deline`
              Module type ${chalk.white.bold(type)} is defined by the ${chalk.white.bold(pluginName)} provider,
              which is not configured in your project. Please make sure it is configured before using the new module.
            `)
          )
        }
      } else {
        log.info(deline`
          Module type ${chalk.white.bold(type)} is defined by the ${chalk.white.bold(pluginName)} provider.
          Please make sure it is configured in your project before using the new module.
        `)
      }
    }

    // This is to avoid `prettier` messing with the string formatting...
    const moduleTypeUrl = chalk.cyan.underline(`${DOCS_BASE_URL}/module-types/${type}`)
    const providerUrl = chalk.cyan.underline(`${DOCS_BASE_URL}/providers/${pluginName}`)
    const configFilesUrl = chalk.cyan.underline(`${DOCS_BASE_URL}/guides/configuration-files`)
    const formattedType = chalk.bold(type)
    const formattedPluginName = chalk.bold(pluginName)

    log.info({
      symbol: "info",
      msg: wordWrap(
        dedent`
        We recommend reviewing the generated config, uncommenting fields that you'd like to configure, and cleaning up any commented fields that you don't need to use.

        For more information about ${formattedType} modules, please check out ${moduleTypeUrl}, and the ${formattedPluginName} docs at ${providerUrl}. For general information about Garden configuration files, take a look at ${configFilesUrl}.
        `,
        120
      ),
    })

    log.info("")

    return { result: { configPath, name, type } }
  }
}
