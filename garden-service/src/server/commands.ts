/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("joi")
import Koa = require("koa")
import { Command, Parameters } from "../commands/base"
import { validate } from "../config/common"
import { coreCommands } from "../commands/commands"
import { mapValues, omitBy } from "lodash"
import { Garden } from "../garden"
import { LogLevel } from "../logger/log-node"
import { LogEntry } from "../logger/log-entry"

export interface CommandMap {
  [key: string]: {
    command: Command,
    requestSchema: Joi.ObjectSchema,
    // TODO: implement resultSchema on Commands, so we can include it here as well (for docs mainly)
  }
}

const baseRequestSchema = Joi.object()
  .keys({
    command: Joi.string()
      .required()
      .description("The command name to run.")
      .example("get.status"),
    parameters: Joi.object()
      .keys({})
      .unknown(true)
      .default(() => ({}), "{}")
      .description("The parameters for the command."),
  })

/**
 * Validate and map a request body to a Command, execute its action, and return its result.
 */
export async function resolveRequest(
  ctx: Koa.Context, garden: Garden, log: LogEntry, commands: CommandMap, request: any,
) {
  // Perform basic validation and find command.
  try {
    request = validate(request, baseRequestSchema, { context: "API request" })
  } catch (ex) {
    ctx.throw(400, ex)
  }

  const commandSpec = commands[request.command]

  if (!commandSpec) {
    ctx.throw(404, `Could not find command ${request.command}`)
  }

  // Validate command parameters.
  try {
    request = validate(request, commandSpec.requestSchema)
  } catch {
    ctx.throw(400, `Invalid request format for command ${request.command}`)
  }

  // Prepare arguments for command action.
  const command = commandSpec.command

  // TODO: Creating a new Garden instance is not ideal,
  //       need to revisit once we've refactored the TaskGraph and config resolution.
  const cmdGarden = await Garden.factory(garden.projectRoot, garden.opts)

  // We generally don't want actions to log anything in the server.
  const cmdLog = log.placeholder(LogLevel.silly, { childEntriesInheritLevel: true })

  const cmdArgs = mapParams(ctx, request.parameters, command.arguments)
  const cmdOpts = mapParams(ctx, request.parameters, command.options)

  return command.action({
    garden: cmdGarden,
    log: cmdLog,
    logFooter: cmdLog,
    args: cmdArgs,
    opts: cmdOpts,
  })
  // TODO: validate result schema
}

export async function prepareCommands(): Promise<CommandMap> {
  const commands: CommandMap = {}

  function addCommand(command: Command) {
    const requestSchema = baseRequestSchema
      .keys({
        parameters: Joi.object()
          .keys({
            ...paramsToJoi(command.arguments),
            ...paramsToJoi(command.options),
          })
          .unknown(false),
      })

    commands[command.getKey()] = {
      command,
      requestSchema,
    }

    command.getSubCommands().forEach(addCommand)
  }

  coreCommands.forEach(addCommand)

  return commands
}

function paramsToJoi(params?: Parameters) {
  if (!params) {
    return {}
  }

  params = omitBy(params, p => p.cliOnly)

  return mapValues(params, p => {
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
function mapParams(ctx: Koa.Context, values: object, params?: Parameters) {
  if (!params) {
    return {}
  }

  const output = mapValues(params, (p, key) => {
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
