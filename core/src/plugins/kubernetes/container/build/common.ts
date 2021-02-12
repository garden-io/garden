/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import pRetry from "p-retry"
import { ContainerModule, ContainerRegistryConfig } from "../../../container/config"
import { containerHelpers } from "../../../container/helpers"
import { GetBuildStatusParams, BuildStatus } from "../../../../types/plugin/module/getBuildStatus"
import { BuildModuleParams, BuildResult } from "../../../../types/plugin/module/build"
import { getDeploymentPod } from "../../util"
import { gardenUtilDaemonDeploymentName, inClusterRegistryHostname } from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesProvider } from "../../config"
import { PodRunner } from "../../run"
import { PluginContext } from "../../../../plugin-context"
import { resolve } from "path"
import { getPortForward } from "../../port-forward"
import { normalizeLocalRsyncPath } from "../../../../util/fs"
import { exec } from "../../../../util/util"
import { InternalError, RuntimeError } from "../../../../exceptions"
import { LogEntry } from "../../../../logger/log-entry"

const inClusterRegistryPort = 5000

export const sharedBuildSyncDeploymentName = "garden-build-sync"

export type BuildStatusHandler = (params: GetBuildStatusParams<ContainerModule>) => Promise<BuildStatus>
export type BuildHandler = (params: BuildModuleParams<ContainerModule>) => Promise<BuildResult>

interface SyncToSharedBuildSyncParams extends BuildModuleParams<ContainerModule> {
  api: KubeApi
  namespace: string
  deploymentName: string
  rsyncPort: number
}

export async function syncToBuildSync(params: SyncToSharedBuildSyncParams) {
  const { ctx, module, log, api, namespace, deploymentName, rsyncPort } = params

  const buildSyncPod = await getDeploymentPod({
    api,
    deploymentName,
    namespace,
  })
  // Sync the build context to the remote sync service
  // -> Get a tunnel to the service
  log.setState("Syncing sources to cluster...")
  const syncFwd = await getPortForward({
    ctx,
    log,
    namespace,
    targetResource: `Pod/${buildSyncPod.metadata.name}`,
    port: rsyncPort,
  })

  // -> Run rsync
  const buildRoot = resolve(module.buildPath, "..")
  // The '/./' trick is used to automatically create the correct target directory with rsync:
  // https://stackoverflow.com/questions/1636889/rsync-how-can-i-configure-it-to-create-target-directory-on-server
  let src = normalizeLocalRsyncPath(`${buildRoot}`) + `/./${module.name}/`
  const destination = `rsync://localhost:${syncFwd.localPort}/volume/${ctx.workingCopyId}/`
  const syncArgs = [
    "--recursive",
    "--relative",
    // Copy symlinks (Note: These are sanitized while syncing to the build staging dir)
    "--links",
    // Preserve permissions
    "--perms",
    // Preserve modification times
    "--times",
    "--compress",
    "--delete",
    "--temp-dir",
    "/tmp",
    src,
    destination,
  ]

  log.debug(`Syncing from ${src} to ${destination}`)
  // We retry a couple of times, because we may get intermittent connection issues or concurrency issues
  await pRetry(() => exec("rsync", syncArgs), {
    retries: 3,
    minTimeout: 500,
  })

  // Because we're syncing to a shared volume, we need to scope by a unique ID
  const contextPath = `/garden-build/${ctx.workingCopyId}/${module.name}/`

  return { contextPath }
}

/**
 * Checks if the module has been built by exec-ing skopeo in a deployed pod in the cluster.
 */
export async function skopeoBuildStatus({
  namespace,
  deploymentName,
  containerName,
  log,
  api,
  ctx,
  provider,
  module,
}: {
  namespace: string
  deploymentName: string
  containerName: string
  log: LogEntry
  api: KubeApi
  ctx: PluginContext
  provider: KubernetesProvider
  module: ContainerModule
}) {
  const deploymentRegistry = provider.config.deploymentRegistry

  if (!deploymentRegistry) {
    // This is validated in the provider configure handler, so this is an internal error if it happens
    throw new InternalError(`Expected configured deploymentRegistry for remote build`, { config: provider.config })
  }
  const remoteId = containerHelpers.getDeploymentImageId(module, module.version, deploymentRegistry)
  const inClusterRegistry = deploymentRegistry?.hostname === inClusterRegistryHostname
  const skopeoCommand = ["skopeo", "--command-timeout=30s", "inspect", "--raw", "--authfile", "/.docker/config.json"]
  if (inClusterRegistry) {
    // The in-cluster registry is not exposed, so we don't configure TLS on it.
    skopeoCommand.push("--tls-verify=false")
  }

  skopeoCommand.push(`docker://${remoteId}`)

  const podCommand = ["sh", "-c", skopeoCommand.join(" ")]

  const pod = await getDeploymentPod({
    api,
    deploymentName,
    namespace,
  })

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace,
    pod,
  })

  try {
    await runner.exec({
      log,
      command: podCommand,
      timeoutSec: 300,
      containerName,
    })
    return { ready: true }
  } catch (err) {
    const res = err.detail?.result || {}

    // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
    if (res.exitCode !== 0 && !res.stderr.includes("manifest unknown")) {
      const output = res.allLogs || err.message

      throw new RuntimeError(`Unable to query registry for image status: ${output}`, {
        command: skopeoCommand,
        output,
      })
    }
    return { ready: false }
  }
}

export async function getUtilDaemonPodRunner({
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
  const pod = await getDeploymentPod({
    api,
    deploymentName: gardenUtilDaemonDeploymentName,
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

export function getSocatContainer(registryHostname: string) {
  return {
    name: "proxy",
    image: "gardendev/socat:0.1.0",
    command: ["/bin/sh", "-c", `socat TCP-LISTEN:5000,fork TCP:${registryHostname}:${inClusterRegistryPort} || exit 0`],
    ports: [
      {
        name: "proxy",
        containerPort: inClusterRegistryPort,
        protocol: "TCP",
      },
    ],
    readinessProbe: {
      tcpSocket: { port: <any>inClusterRegistryPort },
    },
  }
}

export async function getManifestInspectArgs(module: ContainerModule, deploymentRegistry: ContainerRegistryConfig) {
  const remoteId = containerHelpers.getDeploymentImageId(module, module.version, deploymentRegistry)

  const dockerArgs = ["manifest", "inspect", remoteId]
  if (isLocalHostname(deploymentRegistry.hostname)) {
    dockerArgs.push("--insecure")
  }

  return dockerArgs
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname.startsWith("127.")
}
