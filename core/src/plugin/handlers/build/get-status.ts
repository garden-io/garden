/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { actionParamsSchema, PluginBuildActionParamsBase } from "../../base"
import { joi } from "../../../config/common"
import { BuildAction } from "../../../actions/build"
import { actionOutputsSchema, ActionTypeHandlerSpec } from "../base/base"
import { GetActionOutputType } from "../../../actions/base"

interface GetBuildStatusParams<T extends BuildAction = BuildAction> extends PluginBuildActionParamsBase<T> {}

export interface BuildStatus<T extends BuildAction = BuildAction> {
  ready: boolean
  detail?: any
  outputs: GetActionOutputType<T>
}

export class GetBuildActionStatus<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "build",
  GetBuildStatusParams<T>,
  BuildStatus<T>
> {
  description = dedent`
    Check and return the build status of a Build action, i.e. whether the current version has been built.
  `

  paramsSchema = () => actionParamsSchema()

  resultSchema = () =>
    joi.object().keys({
      ready: joi.boolean().required().description("Whether an up-to-date build is ready for the action."),
      detail: joi.any().description("Optional provider-specific information about the build."),
      outputs: actionOutputsSchema(),
    })
}
