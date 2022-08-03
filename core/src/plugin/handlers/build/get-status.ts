/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { actionParamsSchema, PluginBuildActionParamsBase } from "../../base"
import { BuildAction } from "../../../actions/build"
import { ActionTypeHandlerSpec } from "../base/base"
import { ActionStatus, actionStatusSchema, Resolved } from "../../../actions/base"

interface GetBuildStatusParams<T extends BuildAction = BuildAction> extends PluginBuildActionParamsBase<T> {}

export type BuildStatus<T extends BuildAction = BuildAction, D = any> = ActionStatus<T, D>

export class GetBuildActionStatus<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "Build",
  GetBuildStatusParams<Resolved<T>>,
  BuildStatus<T>
> {
  description = dedent`
    Check and return the build status of a Build action, i.e. whether the current version has been built.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => actionStatusSchema()
}
