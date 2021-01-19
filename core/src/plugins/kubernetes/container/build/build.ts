/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split2 = require("split2")
import { ContainerModule } from "../../../container/config"
import { containerHelpers } from "../../../container/helpers"
import { getDockerBuildFlags } from "../../../container/build"
import { GetBuildStatusParams, BuildStatus } from "../../../../types/plugin/module/getBuildStatus"
import { BuildModuleParams, BuildResult } from "../../../../types/plugin/module/build"
import { inClusterRegistryHostname, dockerDaemonContainerName } from "../../constants"
import { posix } from "path"
import { KubeApi } from "../../api"
import { KubernetesProvider, ContainerBuildMode } from "../../config"
import { BuildError, ConfigurationError } from "../../../../exceptions"
import { LogLevel } from "../../../../logger/log-node"
import { renderOutputStream } from "../../../../util/util"
import { getSystemNamespace } from "../../namespace"
import chalk = require("chalk")
import { getKanikoBuildStatus, runKaniko, kanikoBuildFailed, getKanikoFlags } from "./kaniko"
import { getClusterDockerBuildStatus, getDockerDaemonPodRunner } from "./cluster-docker"
import { getLocalBuildStatus, localBuild } from "./local"
import { BuildStatusHandler, BuildHandler, syncToSharedBuildSync } from "./common"

export async function k8sGetContainerBuildStatus(params: GetBuildStatusParams<ContainerModule>): Promise<BuildStatus> {
  const { ctx, module } = params
  const provider = <KubernetesProvider>ctx.provider

  const hasDockerfile = containerHelpers.hasDockerfile(module, module.version)

  if (!hasDockerfile) {
    // Nothing to build
    return { ready: true }
  }

  const handler = buildStatusHandlers[provider.config.buildMode]
  return handler(params)
}

export async function k8sBuildContainer(params: BuildModuleParams<ContainerModule>): Promise<BuildResult> {
  const { ctx, module } = params

  if (!containerHelpers.hasDockerfile(module, module.version)) {
    return {}
  }

  const provider = <KubernetesProvider>ctx.provider
  const handler = buildHandlers[provider.config.buildMode]

  return handler(params)
}

const buildStatusHandlers: { [mode in ContainerBuildMode]: BuildStatusHandler } = {
  "local-docker": getLocalBuildStatus,
  // TODO: make these handlers faster by running a simple in-cluster service
  // that wraps https://github.com/containers/image
  "cluster-docker": getClusterDockerBuildStatus,
  "kaniko": getKanikoBuildStatus,
}

const remoteBuild: BuildHandler = async (params) => {
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

  const { contextPath } = await syncToSharedBuildSync({ ...params, api, systemNamespace })

  log.setState(`Building image ${localId}...`)

  let buildLog = ""

  // Stream debug log to a status line
  const stdout = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  stdout.on("error", () => {})
  stdout.on("data", (line: Buffer) => {
    statusLine.setState(renderOutputStream(line.toString()))
  })

  if (provider.config.buildMode === "cluster-docker") {
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
    })

    buildLog += pushRes.log
  } else if (provider.config.buildMode === "kaniko") {
    // build with Kaniko
    const args = [
      "--context",
      "dir://" + contextPath,
      "--dockerfile",
      dockerfile,
      "--destination",
      deploymentImageId,
      ...getKanikoFlags(module.spec.extraFlags, provider.config.kaniko?.extraFlags),
    ]

    if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
      // The in-cluster registry is not exposed, so we don't configure TLS on it.
      args.push("--insecure")
    }

    args.push(...getDockerBuildFlags(module))

    // Execute the build
    const buildRes = await runKaniko({
      ctx,
      provider,
      log,
      namespace: systemNamespace,
      module,
      args,
      outputStream: stdout,
    })
    buildLog = buildRes.log

    if (kanikoBuildFailed(buildRes)) {
      throw new BuildError(`Failed building module ${chalk.bold(module.name)}:\n\n${buildLog}`, { buildLog })
    }
  } else {
    throw new ConfigurationError("Uknown build mode", { buildMode: provider.config.buildMode })
  }

  log.silly(buildLog)

  return {
    buildLog,
    fetched: false,
    fresh: true,
    version: module.version.versionString,
  }
}

const buildHandlers: { [mode in ContainerBuildMode]: BuildHandler } = {
  "local-docker": localBuild,
  "cluster-docker": remoteBuild,
  "kaniko": remoteBuild,
}
