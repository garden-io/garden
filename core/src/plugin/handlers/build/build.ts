/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { actionParamsSchema, PluginBuildActionParamsBase } from "../../../plugin/base"
import { BuildAction } from "../../../actions/build"
import { ActionTypeHandlerSpec } from "../base/base"
import { Resolved } from "../../../actions/types"
import { BuildStatus, getBuildStatusSchema } from "./get-status"

interface DoBuildActionParams<T extends BuildAction> extends PluginBuildActionParamsBase<T> {}

export class DoBuildAction<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "Build",
  DoBuildActionParams<Resolved<T>>,
  BuildStatus<T>
> {
  description = dedent`
    Build the current version of a Build action. This must wait until the build is complete before returning.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getBuildStatusSchema()
}
