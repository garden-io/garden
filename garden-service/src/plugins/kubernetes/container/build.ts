/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { containerHelpers } from "../../container/helpers"
import { buildContainerModule, getContainerBuildStatus } from "../../container/build"
import { GetBuildStatusParams, BuildStatus } from "../../../types/plugin/module/getBuildStatus"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"
import { getPortForward, getPods } from "../util"
import { systemNamespace } from "../system"
import { RSYNC_PORT } from "../constants"
import execa = require("execa")
import { posix, resolve } from "path"
import { KubeApi } from "../api"
import { kubectl } from "../kubectl"
import { ConfigurationError } from "../../../exceptions"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesProvider } from "../config"

const builderDeployment = "garden-docker-daemon"

export async function k8sGetContainerBuildStatus(
  params: GetBuildStatusParams<ContainerModule>,
): Promise<BuildStatus> {
  const { ctx } = params
  const provider = <KubernetesProvider>ctx.provider

  if (provider.config.buildMode === "local") {
    const status = await getContainerBuildStatus(params)

    if (ctx.provider.config.deploymentRegistry) {
      // TODO: Check if the image exists in the remote registry
    }
    return status

  } else if (provider.config.buildMode === "cluster-docker") {
    return getContainerBuildStatusCluster(params)

  } else {
    throw invalidBuildMode(provider)
  }
}

export async function k8sBuildContainer(params: BuildModuleParams<ContainerModule>): Promise<BuildResult> {
  const { ctx } = params
  const provider = <KubernetesProvider>ctx.provider

  if (provider.config.buildMode === "local") {
    return buildContainerLocal(params)

  } else if (provider.config.buildMode === "cluster-docker") {
    return buildContainerCluster(params)

  } else {
    throw invalidBuildMode(provider)
  }
}

async function getContainerBuildStatusCluster(params: GetBuildStatusParams<ContainerModule>) {
  const { ctx, module, log } = params
  const provider = <KubernetesProvider>ctx.provider

  const hasDockerfile = await containerHelpers.hasDockerfile(module)

  if (!hasDockerfile) {
    return { ready: true }
  }

  const deploymentImage = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

  const args = ["docker", "images", "-q", deploymentImage]
  const res = await execInBuilder(provider, log, args, 30)

  const checkLog = res.stdout + res.stderr
  log.silly(checkLog)

  // The `docker images -q <id>` command returns an ID if the image exists, otherwise it returns an empty string
  const ready = checkLog.trim().length > 0

  return { ready }
}

async function buildContainerLocal(params: BuildModuleParams<ContainerModule>) {
  const { ctx, module, log } = params
  const buildResult = await buildContainerModule(params)

  if (!ctx.provider.config.deploymentRegistry) {
    return buildResult
  }

  if (!(await containerHelpers.hasDockerfile(module))) {
    return buildResult
  }

  const localId = await containerHelpers.getLocalImageId(module)
  const remoteId = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)

  log.setState({ msg: `Pushing image ${remoteId} to cluster...` })

  await containerHelpers.dockerCli(module, ["tag", localId, remoteId])
  await containerHelpers.dockerCli(module, ["push", remoteId])

  return buildResult
}

async function buildContainerCluster(params: BuildModuleParams<ContainerModule>) {
  const { ctx, module, log } = params
  const provider = <KubernetesProvider>ctx.provider

  const hasDockerfile = await containerHelpers.hasDockerfile(module)

  if (!hasDockerfile) {
    log.setState("Nothing to build")

    return {
      fetched: true,
      fresh: false,
      version: module.version.versionString,
    }
  }

  // Sync the build context to the remote sync service
  // -> Get a tunnel to the service
  log.setState("Syncing sources to cluster...")
  const syncFwd = await getPortForward(ctx, log, systemNamespace, `Deployment/${builderDeployment}`, RSYNC_PORT)

  // -> Run rsync
  const buildRoot = resolve(module.buildPath, "..")
  // This trick is used to automatically create the correct target directory with rsync:
  // https://stackoverflow.com/questions/1636889/rsync-how-can-i-configure-it-to-create-target-directory-on-server
  const src = `${buildRoot}/./${module.name}/`
  const destination = `rsync://localhost:${syncFwd.localPort}/volume/`

  log.debug(`Syncing from ${src} to ${destination}`)
  // TODO: use list of files from module version
  await execa("rsync", ["-vrpztgo", "--relative", src, destination])

  // Execute the build
  const localId = await containerHelpers.getLocalImageId(module)
  const deploymentImageId = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

  log.setState(`Building image ${localId}...`)

  // Prepare the build command
  const dockerfile = module.spec.dockerfile || "Dockerfile"
  const contextPath = `/garden-build/${module.name}`
  const dockerfilePath = posix.join(contextPath, dockerfile)

  const buildArgs = [
    "docker", "build",
    "-t", deploymentImageId,
    "-f", dockerfilePath,
    `/garden-build/${module.name}`,
  ]

  const buildRes = await execInBuilder(provider, log, buildArgs, 600)

  const buildLog = buildRes.stdout + buildRes.stderr
  log.silly(buildLog)

  // Push the image to the registry
  log.setState({ msg: `Pushing image ${localId} to registry...` })

  const dockerCmd = ["docker", "push", deploymentImageId]
  const pushArgs = ["/bin/sh", "-c", dockerCmd.join(" ")]

  await execInBuilder(provider, log, pushArgs, 300)

  return {
    buildLog,
    fetched: false,
    fresh: true,
    version: module.version.versionString,
  }
}

// TODO: we should make a simple service around this instead of execing into containers
async function execInBuilder(provider: KubernetesProvider, log: LogEntry, args: string[], timeout: number) {
  const api = await KubeApi.factory(log, provider.config.context)
  const builderDockerPodName = await getBuilderPodName(api)

  const execCmd = ["exec", "-i", builderDockerPodName, "-c", "docker-daemon", "--", ...args]

  log.verbose(`Running: kubectl ${execCmd.join(" ")}`)

  return kubectl.exec({
    args: execCmd,
    context: api.context,
    log,
    namespace: systemNamespace,
    timeout,
  })
}

async function getBuilderPodName(api: KubeApi) {
  const builderStatusRes = await api.apps.readNamespacedDeployment(builderDeployment, systemNamespace)
  const builderPods = await getPods(api, systemNamespace, builderStatusRes.body.spec.selector.matchLabels)
  return builderPods[0].metadata.name
}

function invalidBuildMode(provider: KubernetesProvider) {
  return new ConfigurationError(
    `kubernetes: Invalid build mode '${provider.config.buildMode}'`,
    { config: provider.config },
  )
}
