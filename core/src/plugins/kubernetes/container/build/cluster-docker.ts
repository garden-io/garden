/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getRunningDeploymentPod } from "../../util"
import { dockerDaemonDeploymentName, dockerDaemonContainerName, rsyncPort } from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesProvider, KubernetesPluginContext } from "../../config"
import { InternalError } from "../../../../exceptions"
import { PodRunner } from "../../run"
import { getSystemNamespace } from "../../namespace"
import chalk from "chalk"
import { PluginContext } from "../../../../plugin-context"
import {
  BuildHandler,
  BuildStatusHandler,
  getManifestInspectArgs,
  sharedBuildSyncDeploymentName,
  syncToBuildSync,
} from "./common"
import { posix } from "path"
import split2 = require("split2")
import { LogLevel } from "../../../../logger/logger"
import { renderOutputStream } from "../../../../util/util"
import { getDockerBuildFlags } from "../../../container/build"
import { containerHelpers } from "../../../container/helpers"

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
      buffer: true,
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

export const clusterDockerBuild: BuildHandler = async (params) => {
  const { ctx, module, log } = params
  const provider = <KubernetesProvider>ctx.provider
  const systemNamespace = await getSystemNamespace(ctx, provider, log)
  const api = await KubeApi.factory(log, ctx, provider)

  const localId = containerHelpers.getLocalImageId(module, module.version)
  const deploymentImageId = containerHelpers.getDeploymentImageId(
    module,
    module.version,
    provider.config.deploymentRegistry
  )
  const dockerfile = module.spec.dockerfile || "Dockerfile"

  const { contextPath } = await syncToBuildSync({
    ...params,
    api,
    namespace: systemNamespace,
    deploymentName: sharedBuildSyncDeploymentName,
    rsyncPort,
  })

  log.setState(`Building image ${localId}...`)

  let buildLog = ""

  // Stream debug log to a status line
  const stdout = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  stdout.on("error", () => {})
  stdout.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
    statusLine.setState(renderOutputStream(line.toString()))
  })

  // Prepare the build command
  const dockerfilePath = posix.join(contextPath, dockerfile)

  let args = [
    "docker",
    "build",
    "-t",
    deploymentImageId,
    "-f",
    dockerfilePath,
    contextPath,
    ...getDockerBuildFlags(module),
  ]

  // Execute the build
  const containerName = dockerDaemonContainerName
  const buildTimeout = module.spec.build.timeout

  if (provider.config.clusterDocker && provider.config.clusterDocker.enableBuildKit) {
    args = ["/bin/sh", "-c", "DOCKER_BUILDKIT=1 " + args.join(" ")]
  }

  const runner = await getDockerDaemonPodRunner({ api, ctx, provider, systemNamespace })

  const buildRes = await runner.exec({
    log,
    command: args,
    timeoutSec: buildTimeout,
    containerName,
    stdout,
    buffer: true,
  })

  buildLog = buildRes.log

  // Push the image to the registry
  log.setState({ msg: `Pushing image ${localId} to registry...` })

  const dockerCmd = ["docker", "push", deploymentImageId]
  const pushArgs = ["/bin/sh", "-c", dockerCmd.join(" ")]

  const pushRes = await runner.exec({
    log,
    command: pushArgs,
    timeoutSec: 300,
    containerName,
    stdout,
    buffer: true,
  })

  buildLog += pushRes.log

  log.silly(buildLog)

  return {
    buildLog,
    fetched: false,
    fresh: true,
    version: module.version.versionString,
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
  const pod = await getRunningDeploymentPod({
    api,
    deploymentName: dockerDaemonDeploymentName,
    namespace: systemNamespace,
  })

  return new PodRunner({
    api,
    ctx,
    provider,
    namespace: systemNamespace,
    pod,
  })
}
