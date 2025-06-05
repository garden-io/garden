/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginBuildActionParamsBase } from "../../../plugin/base.js"
import { actionParamsSchema } from "../../../plugin/base.js"
import type { BuildAction } from "../../../actions/build.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { Resolved } from "../../../actions/types.js"
import type { BuildStatus } from "./get-status.js"
import { getBuildStatusSchema } from "./get-status.js"

export type DoBuildActionParams<T extends BuildAction> = PluginBuildActionParamsBase<T>

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
