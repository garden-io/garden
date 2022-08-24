/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  runBaseParams,
  actionParamsSchema,
  PluginDeployActionParamsBase,
  RunResult,
  runResultSchema,
} from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"
import { Resolved } from "../../../actions/base"

interface RunDeployParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  interactive: boolean
  timeout?: number
}

export class RunDeploy<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Run",
  RunDeployParams<Resolved<T>>,
  RunResult
> {
  description = dedent`
    Run an ad-hoc instance of the specified deployment. This should wait until the process completes execution, and should ideally attach it to the terminal (i.e. pipe the output from the process to the console, as well as pipe the input from the console).

    Called by the \`garden run deploy\` (formerly \`garden run service\`) command.
  `

  paramsSchema = () => actionParamsSchema().keys(runBaseParams())
  resultSchema = () => runResultSchema()
}
