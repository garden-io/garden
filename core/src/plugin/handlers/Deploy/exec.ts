/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginDeployActionParamsBase } from "../../../plugin/base.js"
import { actionParamsSchema } from "../../../plugin/base.js"
import { dedent } from "../../../util/string.js"
import { joiArray, joi, createSchema } from "../../../config/common.js"
import type { DeployAction } from "../../../actions/deploy.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { Executed } from "../../../actions/types.js"

interface ExecInDeployParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  command: string[]
  interactive: boolean
  target?: string
}

export interface ExecInDeployResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export const execInDeployResultSchema = createSchema({
  name: "exec-in-deploy-result",
  keys: () => ({
    code: joi.number().required().description("The exit code of the command executed."),
    output: joi.string().allow("").required().description("The output of the executed command."),
    stdout: joi.string().allow("").description("The stdout output of the executed command (if available)."),
    stderr: joi.string().allow("").description("The stderr output of the executed command (if available)."),
  }),
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
