/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { joiArray, joi } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"
import { Executed } from "../../../actions/base"

interface ExecInDeployParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  command: string[]
  interactive: boolean
}

export interface ExecInDeployResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export const execInDeployResultSchema = () =>
  joi.object().keys({
    code: joi.number().required().description("The exit code of the command executed."),
    output: joi.string().allow("").required().description("The output of the executed command."),
    stdout: joi.string().allow("").description("The stdout output of the executed command (if available)."),
    stderr: joi.string().allow("").description("The stderr output of the executed command (if available)."),
  })

export class ExecInDeploy<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  ExecInDeployParams<Executed<T>>,
  ExecInDeployResult
> {
  description = dedent`
    Execute the specified command in the context of a running Deploy, e.g. in a running container.

    Called by the \`garden exec\` command.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      command: joiArray(joi.string()).description("The command to run."),
      interactive: joi.boolean(),
    })

  resultSchema = () => execInDeployResultSchema()
}
