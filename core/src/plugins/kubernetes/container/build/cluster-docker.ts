/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getDeploymentPod } from "../../util"
import { dockerDaemonDeploymentName, dockerDaemonContainerName } from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesProvider, KubernetesPluginContext } from "../../config"
import { InternalError } from "../../../../exceptions"
import { PodRunner } from "../../run"
import { getSystemNamespace } from "../../namespace"
import chalk = require("chalk")
import { PluginContext } from "../../../../plugin-context"
import { BuildStatusHandler, getManifestInspectArgs } from "./common"

export const getClusterDockerBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const deploymentRegistry = provider.config.deploymentRegistry
  const api = await KubeApi.factory(log, ctx, provider)

  if (!deploymentRegistry) {
    // This is validated in the provider configure handler, so this is an internal error if it happens
    throw new InternalError(`Expected configured deploymentRegistry for remote build`, { config: provider.config })
  }

  const args = await getManifestInspectArgs(module, deploymentRegistry)
  const pushArgs = ["/bin/sh", "-c", "DOCKER_CLI_EXPERIMENTAL=enabled docker " + args.join(" ")]

  const systemNamespace = await getSystemNamespace(ctx, provider, log)
  const runner = await getDockerDaemonPodRunner({ api, systemNamespace, ctx, provider })

  try {
    await runner.exec({
      log,
      command: pushArgs,
      timeoutSec: 300,
      containerName: dockerDaemonContainerName,
    })
    return { ready: true }
  } catch (err) {
    const res = err.detail?.result

    // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
    if (res.exitCode !== 0 && !res.stderr.includes("no such manifest")) {
      const detail = res.all || `docker manifest inspect exited with code ${res.exitCode}`
      log.warn(chalk.yellow(`Unable to query registry for image status: ${detail}`))
    }

    return { ready: false }
  }
}

export async function getDockerDaemonPodRunner({
  api,
  systemNamespace,
  ctx,
  provider,
}: {
  api: KubeApi
  systemNamespace: string
  ctx: PluginContext
  provider: KubernetesProvider
}) {
  const pod = await getDeploymentPod({ api, deploymentName: dockerDaemonDeploymentName, namespace: systemNamespace })

  return new PodRunner({
    api,
    ctx,
    provider,
    namespace: systemNamespace,
    pod,
  })
}
