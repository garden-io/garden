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
import { actionStatusSchema } from "../../../actions/base"
import { ActionStatus, ActionStatusMap, Resolved } from "../../../actions/types"
import { joi } from "../../../config/common"

interface GetBuildStatusParams<T extends BuildAction = BuildAction> extends PluginBuildActionParamsBase<T> {}

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
  details?: any
}

export const buildResultSchema = () =>
  joi.object().keys({
    buildLog: joi.string().allow("").description("The full log from the build."),
    fetched: joi.boolean().description("Set to true if the build was fetched from a remote registry."),
    fresh: joi
      .boolean()
      .description("Set to true if the build was performed, false if it was already built, or fetched from a registry"),
    details: joi.object().description("Additional information, specific to the provider."),
  })

export interface BuildStatus<T extends BuildAction = BuildAction, D = BuildResult> extends ActionStatus<T, D> {}

export interface BuildStatusMap extends ActionStatusMap<BuildAction> {
  [key: string]: BuildStatus
}

export const getBuildStatusSchema = () => actionStatusSchema()

export class GetBuildActionStatus<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "Build",
  GetBuildStatusParams<Resolved<T>>,
  BuildStatus<T>
> {
  description = dedent`
    Check and return the build status of a Build action, i.e. whether the current version has been built.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getBuildStatusSchema()
}
