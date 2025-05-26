/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { ActionRuntime, PluginBuildActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import type { BuildAction } from "../../../actions/build.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import { actionStatusSchema } from "../../../actions/base.js"
import type { ActionStatus, ActionStatusMap, Resolved } from "../../../actions/types.js"

/**
 * - `fetched`: The build was fetched from a repository instead of building.
 * - `outdated`: No up-to-date build was found the remote repository.
 * - `building`: The build is in progress.
 * - `built`: The build was completed successfully.
 * - `failed`: An error occurred while fetching or building.
 */
export const buildStates = ["fetching", "fetched", "outdated", "building", "built", "failed", "unknown"] as const
export type BuildState = (typeof buildStates)[number]

export interface BuildStatusForEventPayload {
  state: BuildState
}

type GetBuildStatusParams<T extends BuildAction = BuildAction> = PluginBuildActionParamsBase<T>

export interface BuildResult {
  // Information about whether the action ran locally, or in a remote runner, and if the plugin decided to fall back to another mode of execution for some reason.
  runtime: ActionRuntime
  // The full log from the build.
  buildLog?: string
  // Set to true if the build was fetched from a remote registry.
  fetched?: boolean
  // Set to true if the build was performed, false if it was already built, or fetched from a registry
  fresh?: boolean
  // Additional information, specific to the provider.
  details?: any
}

export type BuildStatus<T extends BuildAction = BuildAction, D extends {} = BuildResult> = ActionStatus<T, D>

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
