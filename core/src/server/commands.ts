/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import Koa = require("koa")
import { Command, CommandGroup } from "../commands/base"
import { joi } from "../config/common"
import { validateSchema } from "../config/validation"
import { extend, mapValues, omitBy } from "lodash"
import { LogLevel } from "../logger/logger"
import { LogEntry } from "../logger/log-entry"
import { Parameters, ParameterValues, globalOptions } from "../cli/params"

export interface CommandMap {
  [key: string]: {
    command: Command
    requestSchema: Joi.ObjectSchema
    // TODO: implement resultSchema on Commands, so we can include it here as well (for docs mainly)
  }
}

const baseRequestSchema = () =>
  joi.object().keys({
    command: joi.string().required().description("The command name to run.").example("get.status"),
    parameters: joi
      .object()
      .keys({})
      .unknown(true)
      .default(() => ({}))
      .description("The parameters for the command."),
  })

/**
 * Validate and map a request body to a Command
 */
export function parseRequest(ctx: Koa.ParameterizedContext, log: LogEntry, commands: CommandMap, request: any) {
  // Perform basic validation and find command.
  try {
    request = validateSchema(request, baseRequestSchema(), { context: "API request" })
  } catch (err) {
    ctx.throw(400, "Invalid request format: " + err.message)
  }

  const commandSpec = commands[request.command]

  if (!commandSpec) {
    ctx.throw(404, `Could not find command ${request.command}`)
  }

  // Validate command parameters.
  try {
    request = validateSchema(request, commandSpec.requestSchema)
  } catch {
    ctx.throw(400, `Invalid request format for command ${request.command}`)
  }

  // Prepare arguments for command action.
  const command = commandSpec.command

  // We generally don't want actions to log anything in the server.
  const cmdLog = log.placeholder({ level: LogLevel.silly, childEntriesInheritLevel: true })

  const cmdArgs = mapParams(ctx, request.parameters, command.arguments)
  const optParams = extend({ ...globalOptions, ...command.options })
  const cmdOpts = mapParams(ctx, request.parameters, optParams)

  return {
    command,
    log: cmdLog,
    args: cmdArgs,
    opts: cmdOpts,
  }
}

export function prepareCommands(): CommandMap {
  const commands: CommandMap = {}

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

    commands[command.getKey()] = {
      command,
      requestSchema,
    }

    if (command instanceof CommandGroup) {
      command.getSubCommands().forEach(addCommand)
    }
  }

  // Need to import this here to avoid circular import issues
  const { getCoreCommands } = require("../commands/commands")
  getCoreCommands().forEach(addCommand)

  return commands
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
