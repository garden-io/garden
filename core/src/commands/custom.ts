/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import execa from "execa"
import { apply as jsonMerge } from "json-merge-patch"
import { cloneDeep, keyBy, mapValues, flatten } from "lodash"
import { parseCliArgs, prepareMinimistOpts } from "../cli/helpers"
import { BooleanParameter, globalOptions, IntegerParameter, Parameter, StringParameter } from "../cli/params"
import { loadConfigResources } from "../config/base"
import {
  CommandResource,
  customCommandExecSchema,
  customCommandGardenCommandSchema,
  CustomCommandOption,
  customCommandSchema,
} from "../config/command"
import { joi } from "../config/common"
import { CustomCommandContext } from "../config/template-contexts/custom-command"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, GardenBaseError, InternalError, RuntimeError, toGardenError } from "../exceptions"
import { resolveTemplateStrings } from "../template-string/template-string"
import { listDirectory, isConfigFilename } from "../util/fs"
import { Command, CommandGroup, CommandParams, CommandResult, PrintHeaderParams } from "./base"
import { customMinimist } from "../lib/minimist"
import { removeSlice } from "../util/util"
import { join } from "path"

function convertArgSpec(spec: CustomCommandOption) {
  const params = {
    name: spec.name,
    help: spec.description,
    required: spec.required,
  }

  if (spec.type === "string") {
    return new StringParameter(params)
  } else if (spec.type === "integer") {
    return new IntegerParameter(params)
  } else if (spec.type === "boolean") {
    return new BooleanParameter(params)
  } else {
    throw new ConfigurationError(`Unexpected parameter type '${spec.type}'`, { spec })
  }
}

interface CustomCommandResult {
  exec?: {
    startedAt: Date
    completedAt: Date
    command: string[]
    exitCode: number
  }
  gardenCommand?: {
    startedAt: Date
    completedAt: Date
    command: string[]
    result: any
    errors: (Error | GardenBaseError)[]
  }
}

export class CustomCommandWrapper extends Command {
  // These are overridden in the constructor
  name = "<custom>"
  help = ""

  allowUndefinedArguments = true

  constructor(public spec: CommandResource) {
    super()
    this.name = spec.name
    this.help = spec.description?.short
    this.description = spec.description?.long

    // Convert argument specs, so they'll be validated
    this.arguments = spec.args ? mapValues(keyBy(spec.args, "name"), convertArgSpec) : undefined
    this.options = mapValues(keyBy(spec.opts, "name"), convertArgSpec)
  }

  printHeader({ headerLog }: PrintHeaderParams) {
    headerLog.info(chalk.cyan(this.name))
  }

  async action({ garden, cli, log, args, opts }: CommandParams<any, any>): Promise<CommandResult<CustomCommandResult>> {
    // Prepare args/opts for the template context.
    // Prepare the ${args.$rest} variable
    // Note: The fork of minimist is a slightly unfortunate hack to be able to extract all unknown args and flags.
    const parsed = customMinimist(
      args.$all || [],
      prepareMinimistOpts({
        options: this.options || {},
        cli: true,
      })
    )
    // Strip the command name and any specified arguments off the $rest variable
    const rest = removeSlice(parsed._unknown, this.getPath()).slice(Object.keys(this.arguments || {}).length)

    // Render the command variables
    const variablesContext = new CustomCommandContext({ ...garden, args, opts, rest })
    const commandVariables = resolveTemplateStrings(this.spec.variables, variablesContext)
    const variables: any = jsonMerge(cloneDeep(garden.variables), commandVariables)

    // Make a new template context with the resolved variables
    const commandContext = new CustomCommandContext({ ...garden, args, opts, variables, rest })

    const result: CustomCommandResult = {}
    const errors: GardenBaseError[] = []

    // Run exec command
    if (this.spec.exec) {
      const startedAt = new Date()

      const exec = validateWithPath({
        config: resolveTemplateStrings(this.spec.exec, commandContext),
        schema: customCommandExecSchema(),
        path: this.spec.path,
        projectRoot: garden.projectRoot,
        configType: `exec field in custom Command '${this.name}'`,
      })

      const command = exec.command
      log.debug(`Running exec command: ${command.join(" ")}`)

      const res = await execa(command[0], command.slice(1), {
        stdio: "inherit",
        buffer: true,
        env: {
          ...process.env,
          // Workaround for https://github.com/vercel/pkg/issues/897
          PKG_EXECPATH: "",
          ...(exec.env || {}),
        },
        cwd: garden.projectRoot,
        reject: false,
      })
      const completedAt = new Date()

      if (res.exitCode !== 0) {
        return {
          exitCode: res.exitCode,
          errors: [new RuntimeError(`Command exited with code ${res.exitCode}`, { exitCode: res.exitCode, command })],
        }
      }

      result.exec = {
        command,
        startedAt,
        completedAt,
        exitCode: res.exitCode,
      }
    }

    // Run Garden command
    if (this.spec.gardenCommand) {
      const startedAt = new Date()

      let gardenCommand = validateWithPath({
        config: resolveTemplateStrings(this.spec.gardenCommand, commandContext),
        schema: customCommandGardenCommandSchema(),
        path: this.spec.path,
        projectRoot: garden.projectRoot,
        configType: `gardenCommand field in custom Command '${this.name}'`,
      })

      log.debug(`Running Garden command: ${gardenCommand.join(" ")}`)

      // Doing runtime check to avoid updating hundreds of test invocations with a new required param, sorry. - JE
      if (!cli) {
        throw new InternalError(`Missing cli argument in custom command wrapper.`, {})
      }

      // Pass explicitly set global opts with the command, if they're not set in the command itself.
      const parsedCommand = parseCliArgs({ stringArgs: gardenCommand, command: this, cli: false })

      const globalFlags = Object.entries(opts)
        .filter(([flag, value]) => {
          const opt = <Parameter<any>>globalOptions[flag]
          if (opt) {
            if (!parsedCommand[flag] && value !== opt.getDefaultValue(true)) {
              return true
            }
          }
          return false
        })
        .flatMap(([flag, value]) => ["--" + flag, value + ""])

      gardenCommand = [...globalFlags, ...gardenCommand]

      const res = await cli.run({
        args: gardenCommand,
        exitOnError: false,
        cwd: garden.projectRoot,
      })

      if (res.consoleOutput) {
        if (res.code === 0) {
          log.info(res.consoleOutput)
        } else {
          log.error(res.consoleOutput)
        }
      }

      const completedAt = new Date()

      errors.push(...res.errors.map((e) => toGardenError(e)))

      result.gardenCommand = {
        startedAt,
        completedAt,
        command: gardenCommand,
        result: res.result,
        errors: res.errors,
      }
    }

    return { result, errors }
  }
}

export async function getCustomCommands(builtinCommands: (Command | CommandGroup)[], projectRoot: string) {
  // Look for Command resources in the project root directory
  const rootFiles = await listDirectory(projectRoot, { recursive: false })
  const paths = rootFiles.filter(isConfigFilename).map((p) => join(projectRoot, p))

  const resources = flatten(await Bluebird.map(paths, (path) => loadConfigResources(projectRoot, path)))

  const builtinNames = builtinCommands.flatMap((c) => c.getPaths().map((p) => p.join(" ")))

  // Filter and validate the resources
  const commandResources = <CommandResource[]>resources
    .filter((r) => {
      if (r.kind !== "Command") {
        return false
      }

      if (builtinNames.includes(r.name)) {
        // tslint:disable-next-line: no-console
        console.log(
          chalk.yellow(
            `Ignoring custom command ${r.name} because it conflicts with a built-in command with the same name`
          )
        )
        return false
      }

      return true
    })
    .map((config) =>
      validateWithPath({
        config,
        schema: customCommandSchema().keys({
          // Allowing any values here because they're fully resolved later
          exec: joi.any(),
          gardenCommand: joi.any(),
        }),
        path: config.path,
        projectRoot,
        configType: `custom Command '${config.name}'`,
      })
    )

  return commandResources.map((spec) => new CustomCommandWrapper(spec))
}
