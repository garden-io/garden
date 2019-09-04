/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { joiArray, joi } from "../../../config/common"

export interface ExecInServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  command: string[]
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

  paramsSchema: serviceActionParamsSchema.keys({
    command: joiArray(joi.string()).description("The command to run alongside the service."),
    interactive: joi.boolean(),
  }),

  resultSchema: joi.object().keys({
    code: joi
      .number()
      .required()
      .description("The exit code of the command executed in the service container."),
    output: joi
      .string()
      .allow("")
      .required()
      .description("The output of the executed command."),
    stdout: joi
      .string()
      .allow("")
      .description("The stdout output of the executed command (if available)."),
    stderr: joi
      .string()
      .allow("")
      .description("The stderr output of the executed command (if available)."),
  }),
}
