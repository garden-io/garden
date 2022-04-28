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
import { BuildAction, BuildActionConfig } from "../../../actions/build"
import { ActionTypeHandlerSpec } from "../base/base"

interface BuildActionParams<T extends BuildAction<any, any>> extends PluginBuildActionParamsBase<T> {}

/**
 * - `fetched`: The build was fetched from a remote repository instead of building.
 * - `building`: The build is in progress.
 * - `built`: The build was completed successfully.
 * - `failed`: An error occurred while fetching or building.
 */
export type BuildState = "fetched" | "building" | "built" | "failed"

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
  details?: any
}

export const buildResultSchema = () =>
  joi.object().keys({
    buildLog: joi.string().allow("").description("The full log from the build."),
    fetched: joi.boolean().description("Set to true if the build was fetched from a remote registry."),
    fresh: joi
      .boolean()
      .description("Set to true if the build was performed, false if it was already built, or fetched from a registry"),
    version: joi.string().description("The version that was built."),
    details: joi.object().description("Additional information, specific to the provider."),
  })

export class BuildBuildAction<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "build",
  BuildActionParams<T>,
  BuildResult
> {
  description = dedent`
    Build the current version of a Build action. This must wait until the build is complete before returning.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => buildResultSchema()
}
