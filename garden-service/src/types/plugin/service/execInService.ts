/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { RuntimeContext, runtimeContextSchema } from "../../service"
import { joiArray } from "../../../config/common"

export interface ExecInServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  command: string[]
  runtimeContext: RuntimeContext
  interactive: boolean
}

export interface ExecInServiceResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export const execInService = {
  description: dedent`
    Execute the specified command next to a running service, e.g. in a service container.

    Called by the \`garden exec\` command.
  `,

  paramsSchema: serviceActionParamsSchema
    .keys({
      command: joiArray(Joi.string())
        .description("The command to run alongside the service."),
      runtimeContext: runtimeContextSchema,
      interactive: Joi.boolean(),
    }),

  resultSchema: Joi.object()
    .keys({
      code: Joi.number()
        .required()
        .description("The exit code of the command executed in the service container."),
      output: Joi.string()
        .allow("")
        .required()
        .description("The output of the executed command."),
      stdout: Joi.string()
        .allow("")
        .description("The stdout output of the executed command (if available)."),
      stderr: Joi.string()
        .allow("")
        .description("The stderr output of the executed command (if available)."),
    }),
}
