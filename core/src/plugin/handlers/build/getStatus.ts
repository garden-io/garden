/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { actionParamsSchema, PluginBuildActionParamsBase } from "../../../plugin/base"
import { joi } from "../../../config/common"
import { BuildActionSpec } from "../../../actions/build"

export interface GetBuildStatusParams<T extends BuildActionSpec = BuildActionSpec>
  extends PluginBuildActionParamsBase<T> {}

export interface BuildStatus {
  ready: boolean
  detail?: any
}

export const getBuildStatus = () => ({
  description: dedent`
    Check and return the build status of a Build action, i.e. whether the current version has been built.
  `,
  paramsSchema: actionParamsSchema(),
  resultSchema: joi.object().keys({
    ready: joi.boolean().required().description("Whether an up-to-date build is ready for the action."),
    detail: joi.any().description("Optional provider-specific information about the build."),
  }),
})
