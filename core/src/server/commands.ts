/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import Koa = require("koa")
import { Command } from "../commands/base"
import { joi } from "../config/common"
import { validateSchema } from "../config/validation"
import { extend, mapValues, omitBy } from "lodash"
import { LoggerBase, LogLevel, ServerLogger, VoidLogger } from "../logger/logger"
import { Log } from "../logger/log-entry"
import { Parameters, ParameterValues, globalOptions } from "../cli/params"
import { parseCliArgs, processCliArgs } from "../cli/helpers"

export interface CommandMap {
  [key: string]: {
    command: Command
    requestSchema: Joi.ObjectSchema
    // TODO: implement resultSchema on Commands, so we can include it here as well (for docs mainly)
  }
}

interface BaseRequest {
  command: string
  stringArguments?: string[]
  parameters: object
  internal?: boolean
}

const baseRequestSchema = () =>
  joi
    .object()
    .keys({
      command: joi.string().required().description("The command name to run.").example("get status"),
      stringArguments: joi
        .array()
        .items(joi.string())
        .description("String arguments for the command, as if passed to the CLI normally."),
      parameters: joi.object().keys({}).unknown(true).description("The formal parameters for the command."),
      internal: joi
        .boolean()
        .description(
          "Internal command that's not triggered by the user. Internal commands have a higher log level and results are not persisted in Cloud."
        )
        .optional(),
    })
    .oxor("stringArguments", "parameters")

/**
 * Validate and map a request body to a Command
 */
export function parseRequest(ctx: Koa.ParameterizedContext, log: Log, commands: CommandMap, request: BaseRequest) {
  // Perform basic validation and find command.
  try {
    request = validateSchema(request, baseRequestSchema(), { context: "API request" })
  } catch (err) {
    ctx.throw(400, "Invalid request format: " + err.message)
  }

  // Support older way of specifying command name
  const commandKey = request.command.replace(".", " ")
  const commandSpec = commands[commandKey]

  if (!commandSpec) {
    ctx.throw(404, `Could not find command ${request.command}.`)
  }

  // Validate command parameters.
  try {
    request = validateSchema(request, commandSpec.requestSchema)
  } catch {
    ctx.throw(400, `Invalid request format for command ${request.command}`)
  }

  const internal = request.internal
  // Note that we clone the command here to ensure that each request gets its own
  // command instance and thereby that subscribers are properly isolated at the request level.
  const command = commandSpec.command.clone()

  let serverLogger: LoggerBase
  if (internal) {
    // TODO: Consider using a logger that logs at the silly level but doesn't emit anything.
    serverLogger = new VoidLogger({ level: LogLevel.info })
  } else {
    serverLogger = command.getServerLogger() || new ServerLogger({ rootLogger: log.root, level: log.root.level })
  }
  const cmdLog = serverLogger.createLog({})

  // Prepare arguments for command action.
  let cmdArgs: ParameterValues<any> = {}
  let cmdOpts: ParameterValues<any> = {}

  if (request.parameters) {
    // TODO: warn if using global opts (same as in processCliArgs())
    cmdArgs = mapParams(ctx, request.parameters, command.arguments)
    const optParams = extend({ ...globalOptions, ...command.options })
    cmdOpts = mapParams(ctx, request.parameters, optParams)
  } else {
    try {
      const args = request.stringArguments || []
      const argv = parseCliArgs({ stringArgs: args, command, cli: false })
      const parseResults = processCliArgs({ rawArgs: args, parsedArgs: argv, command, cli: false })
      cmdArgs = parseResults.args
      cmdOpts = parseResults.opts
    } catch (error) {
      ctx.throw(400, `Invalid string arguments for command ${command.getFullName()}: ${error.message}`)
    }
  }

  return {
    command,
    internal,
    log: cmdLog,
    args: cmdArgs,
    opts: cmdOpts,
  }
}

export function prepareCommands(commands: Command[]): CommandMap {
  const output: CommandMap = {}

  function addCommand(command: Command) {
    const requestSchema = baseRequestSchema().keys({
      parameters: joi
        .object()
        .keys({
          ...paramsToJoi(command.arguments),
          ...paramsToJoi({ ...globalOptions, ...command.options }),
        })
        .unknown(false),
    })

    for (const path of command.getPaths()) {
      output[path.join(" ")] = {
        command,
        requestSchema,
      }
    }
  }

  commands.forEach(addCommand)

  return output
}

function paramsToJoi(params?: Parameters) {
  if (!params) {
    return {}
  }

  params = omitBy(params, (p) => p.cliOnly)

  return mapValues(params, (p) => {
    let schema = p.schema.description(p.help)
    if (p.required) {
      schema = schema.required()
    }
    if (p.defaultValue) {
      schema = schema.default(p.defaultValue)
    }
    return schema
  })
}

/**
 * Prepare the args or opts for a Command action, by mapping input values to the parameter specs.
 */
function mapParams<P extends Parameters>(
  ctx: Koa.ParameterizedContext,
  values: object,
  params?: P
): ParameterValues<P> {
  if (!params) {
    return <ParameterValues<P>>{}
  }

  const output = <ParameterValues<P>>mapValues(params, (p, key) => {
    if (p.cliOnly) {
      return p.defaultValue
    }

    const value = values[key]

    const result = p.schema.validate(value)
    if (result.error) {
      ctx.throw(400, result.error.message)
    }
    return result.value
  })

  return output
}
