/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../../container/moduleConfig"
import { containerHelpers } from "../../../container/helpers"
import { GetBuildStatusParams, BuildStatus } from "../../../../types/plugin/module/getBuildStatus"
import { BuildModuleParams, BuildResult } from "../../../../types/plugin/module/build"
import { KubernetesProvider, ContainerBuildMode } from "../../config"
import { getKanikoBuildStatus, kanikoBuild } from "./kaniko"
import { getLocalBuildStatus, localBuild } from "./local"
import { BuildStatusHandler, BuildHandler } from "./common"
import { buildkitBuildHandler, getBuildkitBuildStatus } from "./buildkit"

export async function k8sGetContainerBuildStatus(params: GetBuildStatusParams<ContainerModule>): Promise<BuildStatus> {
  const { ctx, module } = params
  const provider = <KubernetesProvider>ctx.provider

  const hasDockerfile = containerHelpers.moduleHasDockerfile(module, module.version)

  if (!hasDockerfile) {
    // Nothing to build
    return { ready: true }
  }

  const handler = buildStatusHandlers[provider.config.buildMode]
  return handler(params)
}

export async function k8sBuildContainer(params: BuildModuleParams<ContainerModule>): Promise<BuildResult> {
  const { ctx, module } = params

  if (!containerHelpers.moduleHasDockerfile(module, module.version)) {
    return {}
  }

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
