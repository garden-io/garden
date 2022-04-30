/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerBuildAction } from "../../../container/moduleConfig"
import { KubernetesProvider, ContainerBuildMode } from "../../config"
import { getKanikoBuildStatus, kanikoBuild } from "./kaniko"
import { getLocalBuildStatus, localBuild } from "./local"
import { BuildStatusHandler, BuildHandler } from "./common"
import { buildkitBuildHandler, getBuildkitBuildStatus } from "./buildkit"
import { BuildActionHandler } from "../../../../plugin/action-types"

export const k8sGetContainerBuildStatus: BuildActionHandler<"getStatus", ContainerBuildAction> = async (params) => {
  const { ctx } = params
  const provider = <KubernetesProvider>ctx.provider

  const handler = buildStatusHandlers[provider.config.buildMode]
  return handler(params)
}

export const k8sBuildContainer: BuildActionHandler<"build", ContainerBuildAction> = async (params) => {
  const { ctx } = params

  const provider = <KubernetesProvider>ctx.provider
  const handler = buildHandlers[provider.config.buildMode]

  return handler(params)
}

const buildStatusHandlers: { [mode in ContainerBuildMode]: BuildStatusHandler } = {
  "local-docker": getLocalBuildStatus,
  "cluster-buildkit": getBuildkitBuildStatus,
  "kaniko": getKanikoBuildStatus,
}

const buildHandlers: { [mode in ContainerBuildMode]: BuildHandler } = {
  "local-docker": localBuild,
  "cluster-buildkit": buildkitBuildHandler,
  "kaniko": kanikoBuild,
}
