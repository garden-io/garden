/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent from "dedent"
import { pathExists } from "fs-extra"
import { Command, CommandResult, CommandParams } from "../base"
import { printHeader } from "../../logger/util"
import { isDirectory, defaultConfigFilename } from "../../util/fs"
import { loadConfigResources, findProjectConfig } from "../../config/base"
import { resolve, basename, relative, join } from "path"
import { GardenBaseError, ParameterError } from "../../exceptions"
import { getActionTypes, getPluginBaseNames } from "../../plugins"
import { addConfig } from "./helpers"
import { getSupportedPlugins } from "../../plugins/plugins"
import { renderConfigReference } from "../../docs/config"
import { DOCS_BASE_URL } from "../../constants"
import { flatten, keyBy } from "lodash"
import { fixedPlugins } from "../../config/project"
import { deline, wordWrap } from "../../util/string"
import { joi } from "../../config/common"
import { getProviderUrl, getModuleTypeUrl } from "../../docs/common"
import { PathParameter, StringParameter, BooleanParameter, StringOption } from "../../cli/params"
import { userPrompt } from "../../util/util"
import { ActionKind, actionKinds } from "../../actions/types"
import { baseActionConfigSchema } from "../../actions/base"

const createActionArgs = {}
const createActionOpts = {
  dir: new PathParameter({
    help: "Directory to place the actions in (defaults to current directory).",
    defaultValue: ".",
  }),
  filename: new StringParameter({
    help: "Filename to place the actions config in (defaults to garden.yml).",
    defaultValue: defaultConfigFilename,
  }),
  interactive: new BooleanParameter({
    aliases: ["i"],
    help: "Set to false to disable interactive prompts.",
    defaultValue: true,
  }),
  kind: new StringOption({
    help: "Kind of the action. Required if --interactive=false.",
  }),
  name: new StringOption({
    help: "Name of the action (defaults to current directory name).",
  }),
  type: new StringOption({
    help: "The action type to create. Required if --interactive=false.",
  }),
}

type CreateActionsArgs = typeof createActionArgs
type CreateActionsOpts = typeof createActionOpts

interface CreateActionsResult {
  configPath: string
  name: string
  type: string
}

// TODO: move to common
class CreateError extends GardenBaseError {
  type: "create"
}

export class CreateActionsCommand extends Command<CreateActionsArgs, CreateActionsOpts> {
  name = "actions"
  help = "Create a new Garden actions configuration."
  noProject = true
  cliOnly = true

  description = dedent`
    Creates a new Garden module configuration. The generated config includes some default values, as well as the
    schema of the config in the form of commented-out fields.

    Examples:

        garden create actions                      # create a Garden actions configuration in the current directory
        garden create actions --dir some-dir       # create a Garden actions configuration in the ./some-dir directory
        garden create actions --name my-actions    # set the actions configuration file name to my-actions
        garden create actions --interactive=false --kind=build --type=container # don't prompt for user inputs when creating the actions configuration
  `

  arguments = createActionArgs
  options = createActionOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Create new actions configuration", "✏️")
  }

  allowInDevCommand() {
    return false
  }

  async action({
    opts,
    log,
  }: CommandParams<CreateActionsArgs, CreateActionsOpts>): Promise<CommandResult<CreateActionsResult>> {
    const configDir = resolve(process.cwd(), opts.dir)

    if (!(await isDirectory(configDir))) {
      throw new ParameterError(`${configDir} is not a directory`, { configDir })
    }

    const configPath = join(configDir, opts.filename)

    let kind: ActionKind = opts.kind as ActionKind
    let name = opts.name || basename(configDir)
    let type = opts.type
    let presetValues = {
      kind: "",
      name,
      type,
    }

    const allActionTypes = getActionTypes(getSupportedPlugins().map((p) => p.callback()))

    if (opts.interactive && (!opts.kind || !opts.name || !opts.type)) {
      if (!opts.kind) {
        const choices = [...actionKinds]

        const answer = await userPrompt({
          name: "suggestion",
          message: "Select an action kind:",
          type: "list",
          choices,
        })
        presetValues.kind = answer.suggestion
        kind = presetValues.kind as ActionKind
      }

      if (!opts.type) {
        const choices = Object.keys(allActionTypes[kind])

        const answer = await userPrompt({
          name: "suggestion",
          message: "Select an action type:",
          type: "list",
          choices,
          pageSize: 20,
        })
        presetValues.type = answer.suggestion
        type = presetValues.type
      }

      if (!opts.name) {
        const answer = await userPrompt({
          name: "name",
          message: "Set the module name:",
          type: "input",
          default: name,
        })
        name = presetValues.name = answer.name
      }

      log.info("")
    }

    if (!kind) {
      throw new ParameterError(`Must specify --kind if --interactive=false`, {})
    }

    if (!type) {
      throw new ParameterError(`Must specify --type if --interactive=false`, {})
    }

    presetValues.name = name

    // Throw if module with same name already exists
    if (await pathExists(configPath)) {
      const configs = await loadConfigResources(log, configDir, configPath)

      if (configs.filter((c) => c.kind === kind && c.name === name).length > 0) {
        throw new CreateError(
          chalk.red(
            `A Garden ${chalk.white.bold(kind)}-action named ${chalk.white.bold(
              name
            )} already exists in ${chalk.white.bold(configPath)}`
          ),
          {
            configDir,
            configPath,
          }
        )
      }
    }

    const definition = allActionTypes[type]

    if (!definition) {
      throw new ParameterError(`Could not find action type ${chalk.white.bold(type)}`, {
        availableTypes: Object.keys(allActionTypes),
      })
    }

    const schema = (definition.schema
      ? baseActionConfigSchema().concat(definition.schema)
      : baseActionConfigSchema()
    ).keys({
      // TODO-0.13.0: Hide this from docs until we actually use it.
      //  Relates to https://github.com/garden-io/garden/pull/4102
      apiVersion: joi.string().meta({ internal: true }),
    })

    let { yaml } = renderConfigReference(schema, {
      yamlOpts: {
        onEmptyValue: "remove",
        filterMarkdown: true,
        renderBasicDescription: !opts["skip-comments"],
        renderFullDescription: false,
        renderValue: "preferExample",
        presetValues,
      },
    })

    const moduleTypeUrl = getModuleTypeUrl(type)
    yaml = `# See the documentation and reference for ${type} modules at ${moduleTypeUrl}\n\n${yaml}`
    await addConfig(configPath, yaml)

    log.info(chalk.green(`-> Created new module config in ${chalk.bold.white(relative(process.cwd(), configPath))}`))
    log.info("")

    // Warn if module type is defined by provider that isn't configured OR if not in a project, ask to make sure
    // it is configured in the project that will use the module.
    const projectConfig = await findProjectConfig(log, configDir)
    const pluginName = definition.plugin.name

    if (!fixedPlugins.includes(pluginName)) {
      if (projectConfig) {
        const allProvidersWithBases = flatten(
          projectConfig.providers.map((p) => getPluginBaseNames(p.name, keyBy(getSupportedPlugins, "name")))
        )

        if (!allProvidersWithBases.includes(pluginName)) {
          log.warn(
            chalk.yellow(
              wordWrap(
                deline`
                Module type ${chalk.white.bold(type)} is defined by the ${chalk.white.bold(pluginName)} provider,
                which is not configured in your project. Please make sure it is configured before using the new module.
              `,
                120
              )
            )
          )
          log.info("")
        }
      } else {
        log.info(
          wordWrap(
            deline`
            Module type ${chalk.white.bold(type)} is defined by the ${chalk.white.bold(pluginName)} provider.
            Please make sure it is configured in your project before using the new module.
          `,
            120
          )
        )
        log.info("")
      }
    }

    // This is to avoid `prettier` messing with the string formatting...
    const moduleTypeUrlFormatted = chalk.cyan.underline(moduleTypeUrl)
    const providerUrl = chalk.cyan.underline(getProviderUrl(pluginName))
    const configFilesUrl = chalk.cyan.underline(`${DOCS_BASE_URL}/using-garden/configuration-overview`)
    const formattedType = chalk.bold(type)
    const formattedPluginName = chalk.bold(pluginName)

    log.info({
      symbol: "info",
      msg: wordWrap(
        dedent`
        For more information about ${formattedType} modules, please check out ${moduleTypeUrlFormatted}, and the ${formattedPluginName} provider docs at ${providerUrl}. For general information about Garden configuration files, take a look at ${configFilesUrl}.
        `,
        120
      ),
    })

    log.info("")

    return { result: { configPath, name, type } }
  }
}
