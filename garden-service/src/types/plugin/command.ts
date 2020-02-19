/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { joi, joiArray, joiIdentifier, joiIdentifierDescription } from "../../config/common"

// TODO: allow args and opts
export interface PluginCommandParams {
  ctx: PluginContext
  // args: ParameterValues<T>
  // opts: ParameterValues<U>
  log: LogEntry
}

export interface PluginCommandResult<T extends object = object> {
  result: T
  errors?: Error[]
}

export const pluginCommandResultSchema = () =>
  joi.object().keys({
    result: joi
      .object()
      .options({ allowUnknown: true })
      .required(),
    errors: joiArray(joi.any()),
  })

export interface PluginCommandHandler<T extends object = object> {
  (params: PluginCommandParams): PluginCommandResult<T> | Promise<PluginCommandResult<T>>
}

export interface PluginCommand {
  name: string
  description: string
  title?: string | ((params: { environmentName: string }) => string | Promise<string>)
  // TODO: allow arguments
  handler: PluginCommandHandler
  base?: PluginCommand
}

export const pluginCommandSchema = () =>
  joi.object().keys({
    name: joiIdentifier()
      .required()
      .description("The name of the command. Must be " + joiIdentifierDescription),
    description: joi
      .string()
      .required()
      .max(80)
      .description("A one-line description of the command (max 80 chars)."),
    title: joi
      .alternatives(joi.string(), joi.func())
      .description("A heading to print ahead of calling the command handler, or a function that returns it."),
    handler: joi
      .func()
      // TODO: see if we can define/output the function schema somehow
      .description("The command handler."),
    // TODO: allow arguments and options
  })
