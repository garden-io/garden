/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { apply as jsonMerge } from "json-merge-patch"
import cloneDeep from "fast-copy"
import { keyBy, mapValues, flatten } from "lodash-es"
import { parseCliArgs, prepareMinimistOpts } from "../cli/helpers.js"
import type { Parameter, ParameterObject } from "../cli/params.js"
import { BooleanParameter, globalOptions, IntegerParameter, StringParameter } from "../cli/params.js"
import { loadConfigResources } from "../config/base.js"
import type { CommandResource, CustomCommandOption } from "../config/command.js"
import { customCommandSchema } from "../config/command.js"
import { omitFromSchema } from "../config/common.js"
import { CustomCommandContext } from "../config/template-contexts/custom-command.js"
import { validateWithPath } from "../config/validation.js"
import type { GardenError } from "../exceptions.js"
import { ConfigurationError, RuntimeError, InternalError, toGardenError } from "../exceptions.js"
import { resolveTemplateStrings } from "../template-string/template-string.js"
import { listDirectory, isConfigFilename } from "../util/fs.js"
import type { CommandParams, CommandResult, PrintHeaderParams } from "./base.js"
import { Command } from "./base.js"
import { customMinimist } from "../lib/minimist.js"
import { removeSlice } from "../util/util.js"
import { join } from "path"
import { getBuiltinCommands } from "./commands.js"
import type { Log } from "../logger/log-entry.js"
import { getTracePropagationEnvVars } from "../util/open-telemetry/propagation.js"
import { styles } from "../logger/styles.js"
import { GardenConfig } from "../template-string/validation.js"
import { GenericContext, LayeredContext } from "../config/template-contexts/base.js"

function convertArgSpec(spec: CustomCommandOption) {
  const params = {
    name: spec.name,
    help: spec.description,
    required: spec.required,
    spread: true,
  }

  if (spec.type === "string") {
    return new StringParameter(params)
  } else if (spec.type === "integer") {
    return new IntegerParameter(params)
  } else if (spec.type === "boolean") {
    return new BooleanParameter(params)
  } else {
    throw new ConfigurationError({ message: `Unexpected parameter type '${spec.type}'` })
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
    errors: (Error | GardenError)[]
  }
}

export class CustomCommandWrapper extends Command {
  // These are overridden in the constructor
  name = "<custom>"
  help = ""

  override isCustom = true

  override allowUndefinedArguments = true

  constructor(public config: GardenConfig<Omit<CommandResource, "exec" | "gardenCommand">, BaseGardenResourceMetadata>) {
    super(config)
    this.name = config.config.name
    this.help = config.config.description?.short
    this.description = config.config.description?.long

    // Convert argument specs, so they'll be validated
    this.arguments = config.config.args ? mapValues(keyBy(config.config.args, "name"), convertArgSpec) : {}
    this.options = mapValues(keyBy(config.config.opts, "name"), convertArgSpec)
  }

  override printHeader({ log }: PrintHeaderParams) {
    log.info(styles.highlight(this.name))
  }

  async action({
    garden,
    cli,
    log,
    args,
    opts,
  }: CommandParams<ParameterObject, ParameterObject>): Promise<CommandResult<CustomCommandResult>> {
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

    // command variables are lazy and have precendence over garden variables
    const commandVariables = new GenericContext(this.config.config.variables)
    const variables = new LayeredContext(commandVariables, garden.variables)

    // Make a new template context with the lazy variables
    const commandContext = new CustomCommandContext({ ...garden, args, opts, variables, rest })

    const result: CustomCommandResult = {}
    const errors: GardenError[] = []

    const refined = this.config
      .withContext(commandContext)
      .refineWithJoi<CommandResource>(customCommandSchema())

    // Run exec command
    if (refined.config.exec) {
      const startedAt = new Date()

      const command = refined.config.exec.command
      log.debug(`Running exec command: ${command.join(" ")}`)

      const res = await execa(command[0], command.slice(1), {
        stdio: "inherit",
        buffer: true,
        env: {
          ...process.env,
          ...(refined.config.exec.env || {}),
          ...getTracePropagationEnvVars(),
        },
        cwd: garden.projectRoot,
        reject: false,
      })
      const completedAt = new Date()

      if (res.exitCode !== 0) {
        return {
          exitCode: res.exitCode,
          errors: [
            new RuntimeError({
              message: `Command "${command.join(" ")}" exited with code ${res.exitCode}`,
            }),
          ],
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
    if (refined.config.gardenCommand) {
      const startedAt = new Date()

      log.debug(`Running Garden command: ${refined.config.gardenCommand.join(" ")}`)

      // Doing runtime check to avoid updating hundreds of test invocations with a new required param, sorry. - JE
      if (!cli) {
        throw new InternalError({ message: `Missing cli argument in custom command wrapper.` })
      }

      // Pass explicitly set global opts with the command, if they're not set in the command itself.
      const parsedCommand = parseCliArgs({ stringArgs: refined.config.gardenCommand, command: this, cli: false })

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

      const gardenCommand = [...globalFlags, ...refined.config.gardenCommand]

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

export async function getCustomCommands(log: Log, projectRoot: string) {
  // Look for Command resources in the project root directory
  const rootFiles = await listDirectory(projectRoot, { recursive: false })
  const paths = rootFiles.filter(isConfigFilename).map((p) => join(projectRoot, p))

  const resources = flatten(await Promise.all(paths.map((path) => loadConfigResources(log, projectRoot, path))))

  const builtinNames = getBuiltinCommands().flatMap((c) => c.getPaths().map((p) => p.join(" ")))

  // Filter and validate the resources
  const commandResources = resources.filter((r) => {
      if (r.config.kind !== "Command") {
        return false
      }

      if (builtinNames.includes(r.config.name)) {
        // eslint-disable-next-line no-console
        console.log(
          styles.warning(
            `Ignoring custom command ${r.config.name} because it conflicts with a built-in command with the same name`
          )
        )
        return false
      }

      return true
    })
    .map((config) => {
      return config.refineWithJoi<Omit<CommandResource, "exec" | "gardenCommand">>(
        omitFromSchema(customCommandSchema(), "exec", "gardenCommand")
      )
    })

  return commandResources.map((spec) => new CustomCommandWrapper(spec))
}
