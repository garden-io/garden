/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import pRetry from "p-retry"
import { ContainerBuildAction, ContainerRegistryConfig } from "../../../container/moduleConfig"
import { getRunningDeploymentPod } from "../../util"
import {
  buildSyncVolumeName,
  dockerAuthSecretKey,
  gardenUtilDaemonDeploymentName,
  k8sUtilImageName,
  rsyncPortName,
} from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesPluginContext, KubernetesProvider } from "../../config"
import { PodRunner } from "../../run"
import { PluginContext } from "../../../../plugin-context"
import { basename, resolve } from "path"
import { getPortForward } from "../../port-forward"
import { normalizeLocalRsyncPath } from "../../../../util/fs"
import { exec, hashString, sleep } from "../../../../util/util"
import { InternalError, RuntimeError } from "../../../../exceptions"
import { LogEntry } from "../../../../logger/log-entry"
import { prepareDockerAuth } from "../../init"
import { prepareSecrets } from "../../secrets"
import chalk from "chalk"
import { gardenEnv } from "../../../../constants"
import { ensureMutagenSync, flushMutagenSync, getKubectlExecDestination, terminateMutagenSync } from "../../mutagen"
import { randomString } from "../../../../util/string"
import { V1Container, V1Service } from "@kubernetes/client-node"
import { cloneDeep, isEmpty } from "lodash"
import { compareDeployedResources, waitForResources } from "../../status/status"
import { KubernetesDeployment, KubernetesResource } from "../../types"
import { BuildActionHandler, BuildActionResults } from "../../../../plugin/action-types"
import { k8sGetContainerBuildActionOutputs } from "../handlers"
import { Resolved } from "../../../../actions/types"
import { stringifyResources } from "../util"

export const utilContainerName = "util"
export const utilRsyncPort = 8730
export const utilDeploymentName = "garden-util"

export const commonSyncArgs = [
  "--recursive",
  // Copy symlinks (Note: These are sanitized while syncing to the build staging dir)
  "--links",
  // Preserve permissions
  "--perms",
  // Preserve modification times
  "--times",
  "--compress",
]

export const builderToleration = {
  key: "garden-build",
  operator: "Equal",
  value: "true",
  effect: "NoSchedule",
}

export type BuildStatusHandler = BuildActionHandler<"getStatus", ContainerBuildAction>
export type BuildStatusResult = BuildActionResults<"getStatus", ContainerBuildAction>
export type BuildHandler = BuildActionHandler<"build", ContainerBuildAction>

const deployLock = new AsyncLock()

interface SyncToSharedBuildSyncParams {
  ctx: KubernetesPluginContext
  log: LogEntry
  api: KubeApi
  action: ContainerBuildAction
  namespace: string
  deploymentName: string
  rsyncPort: number
  sourcePath?: string
}

export async function syncToBuildSync(params: SyncToSharedBuildSyncParams) {
  const { ctx, action, log, api, namespace, deploymentName, rsyncPort } = params

  const sourcePath = params.sourcePath || action.getBuildPath()

  // Because we're syncing to a shared volume, we need to scope by a unique ID
  const contextRelPath = `${ctx.workingCopyId}/${action.name}`

  // Absolute path mounted on the builder
  const contextPath = `/garden-build/${contextRelPath}`
  // Absolute path from within the sync/util container
  const dataPath = `/data/${contextRelPath}`

  const buildSyncPod = await getRunningDeploymentPod({
    api,
    deploymentName,
    namespace,
  })

  if (gardenEnv.GARDEN_K8S_BUILD_SYNC_MODE === "mutagen") {
    // Sync using mutagen
    const key = `build-sync-${action.name}-${randomString(8)}`
    const targetPath = `/data/${ctx.workingCopyId}/${action.name}`

    // Make sure the target path exists
    const runner = new PodRunner({
      ctx,
      provider: ctx.provider,
      api,
      pod: buildSyncPod,
      namespace,
    })

    await runner.exec({
      log,
      command: ["sh", "-c", "mkdir -p " + targetPath],
      containerName: utilContainerName,
      buffer: true,
    })

    try {
      const resourceName = `Deployment/${deploymentName}`

      log.debug(`Syncing from ${sourcePath} to ${resourceName}`)

      // -> Create the sync
      await ensureMutagenSync({
        ctx,
        log,
        key,
        logSection: action.name,
        sourceDescription: `Module ${action.name} build path`,
        targetDescription: "Build sync Pod",
        config: {
          alpha: sourcePath,
          beta: await getKubectlExecDestination({
            ctx,
            log,
            namespace,
            containerName: utilContainerName,
            resourceName,
            targetPath,
          }),
          mode: "one-way-replica",
          ignore: [],
        },
      })

      // -> Flush the sync once
      await flushMutagenSync(ctx, log, key)
      log.debug(`Sync from ${sourcePath} to ${resourceName} completed`)
    } finally {
      // -> Terminate the sync
      await terminateMutagenSync(ctx, log, key)
      log.debug(`Sync connection terminated`)
    }
  } else {
    // Sync the build context to the remote sync service
    // -> Get a tunnel to the service
    log.setState("Syncing files to cluster...")
    const syncFwd = await getPortForward({
      ctx,
      log,
      namespace,
      targetResource: `Pod/${buildSyncPod.metadata.name}`,
      port: rsyncPort,
    })

    // -> Run rsync
    const sourceParent = resolve(sourcePath, "..")
    const dirName = basename(sourcePath)

    // The '/./' trick is used to automatically create the correct target directory with rsync:
    // https://stackoverflow.com/questions/1636889/rsync-how-can-i-configure-it-to-create-target-directory-on-server
    let src = normalizeLocalRsyncPath(`${sourceParent}`) + `/./${dirName}/`
    const destination = `rsync://localhost:${syncFwd.localPort}/volume/${ctx.workingCopyId}/`
    const syncArgs = [...commonSyncArgs, "--relative", "--delete", "--temp-dir", "/tmp", src, destination]

    log.debug(`Syncing from ${src} to ${destination}`)
    // We retry a few times, because we may get intermittent connection issues or concurrency issues
    await pRetry(() => exec("rsync", syncArgs), {
      retries: 5,
      minTimeout: 1000,
    })
  }

  log.setState("File sync to cluster complete")

  return { contextRelPath, contextPath, dataPath }
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
  action,
}: {
  namespace: string
  deploymentName: string
  containerName: string
  log: LogEntry
  api: KubeApi
  ctx: PluginContext
  provider: KubernetesProvider
  action: Resolved<ContainerBuildAction>
}): Promise<BuildStatusResult> {
  const deploymentRegistry = provider.config.deploymentRegistry

  if (!deploymentRegistry) {
    // This is validated in the provider configure handler, so this is an internal error if it happens
    throw new InternalError(`Expected configured deploymentRegistry for remote build`, { config: provider.config })
  }

  const outputs = k8sGetContainerBuildActionOutputs({ action, provider })

  const remoteId = outputs.deploymentImageId
  const skopeoCommand = ["skopeo", "--command-timeout=30s", "inspect", "--raw", "--authfile", "/.docker/config.json"]

  if (deploymentRegistry?.insecure === true) {
    skopeoCommand.push("--tls-verify=false")
  }

  skopeoCommand.push(`docker://${remoteId}`)

  const podCommand = ["sh", "-c", skopeoCommand.join(" ")]

  const pod = await getRunningDeploymentPod({
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
      buffer: true,
    })
    return { state: "ready", outputs, detail: {} }
  } catch (err) {
    const res = err.detail?.result || {}

    // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
    if (res.exitCode !== 0 && !skopeoManifestUnknown(res.stderr)) {
      const output = res.allLogs || err.message

      throw new RuntimeError(`Unable to query registry for image status: ${output}`, {
        command: skopeoCommand,
        output,
      })
    }
    return { state: "unknown", outputs, detail: {} }
  }
}

export function skopeoManifestUnknown(errMsg: string | null | undefined): boolean {
  if (!errMsg) {
    return false
  }
  return errMsg.includes("manifest unknown") || /artifact [^ ]+ not found/.test(errMsg)
}

/**
 * Get a PodRunner for the util deployment in the garden-system namespace.
 */
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
  const pod = await getRunningDeploymentPod({
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

/**
 * Ensures that a garden-util deployment exists in the specified namespace.
 * Returns the docker auth secret that's generated and mounted in the deployment.
 */
export async function ensureUtilDeployment({
  ctx,
  provider,
  log,
  api,
  namespace,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  api: KubeApi
  namespace: string
}) {
  return deployLock.acquire(namespace, async () => {
    const deployLog = log.placeholder()

    const { authSecret, updated: secretUpdated } = await ensureBuilderSecret({
      provider,
      log,
      api,
      namespace,
    })

    const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })

    // Check status of the util deployment
    const { deployment, service } = getUtilManifests(provider, authSecret.metadata.name, imagePullSecrets)
    const status = await compareDeployedResources(
      ctx as KubernetesPluginContext,
      api,
      namespace,
      [deployment, service],
      deployLog
    )

    if (status.state === "ready") {
      // Need to wait a little to ensure the secret is updated in the deployment
      if (secretUpdated) {
        await sleep(1000)
      }
      return { authSecret, updated: false }
    }

    // Deploy the service
    deployLog.setState(
      chalk.gray(`-> Deploying ${utilDeploymentName} service in ${namespace} namespace (was ${status.state})`)
    )

    await api.upsert({ kind: "Deployment", namespace, log: deployLog, obj: deployment })
    await api.upsert({ kind: "Service", namespace, log: deployLog, obj: service })

    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: "garden-util",
      resources: [deployment, service],
      log: deployLog,
      timeoutSec: 600,
    })

    deployLog.setState({ append: true, msg: "Done!" })

    return { authSecret, updated: true }
  })
}

export async function getManifestInspectArgs(remoteId: string, deploymentRegistry: ContainerRegistryConfig) {
  const dockerArgs = ["manifest", "inspect", remoteId]
  if (isLocalHostname(deploymentRegistry.hostname)) {
    dockerArgs.push("--insecure")
  }

  return dockerArgs
}

/**
 * Creates and saves a Kubernetes Docker authentication Secret in the specified namespace, suitable for mounting in
 * builders and as an imagePullSecret.
 *
 * Returns the created Secret manifest.
 */
export async function ensureBuilderSecret({
  provider,
  log,
  api,
  namespace,
}: {
  provider: KubernetesProvider
  log: LogEntry
  api: KubeApi
  namespace: string
}) {
  // Ensure docker auth secret is available and up-to-date in the namespace
  const authSecret = await prepareDockerAuth(api, provider, namespace)
  let updated = false

  // Create a unique name based on the contents of the auth (otherwise different Garden runs can step over each other
  // in shared namespaces).
  const hash = hashString(authSecret.data![dockerAuthSecretKey], 6)
  const secretName = `garden-docker-auth-${hash}`
  authSecret.metadata.name = secretName

  const existingSecret = await api.readOrNull({ log, namespace, manifest: authSecret })

  if (!existingSecret || authSecret.data?.[dockerAuthSecretKey] !== existingSecret.data?.[dockerAuthSecretKey]) {
    log.setState(chalk.gray(`-> Updating Docker auth secret in namespace ${namespace}`))
    await api.upsert({ kind: "Secret", namespace, log, obj: authSecret })
    updated = true
  }

  return { authSecret, updated }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname.startsWith("127.")
}

export function getUtilContainer(authSecretName: string, provider: KubernetesProvider): V1Container {
  return {
    name: utilContainerName,
    image: k8sUtilImageName,
    imagePullPolicy: "IfNotPresent",
    command: ["/rsync-server.sh"],
    env: [
      // This makes sure the server is accessible on any IP address, because CIDRs can be different across clusters.
      // K8s can be trusted to secure the port. - JE
      { name: "ALLOW", value: "0.0.0.0/0" },
      {
        name: "RSYNC_PORT",
        value: "" + utilRsyncPort,
      },
    ],
    volumeMounts: [
      {
        name: authSecretName,
        mountPath: "/home/user/.docker",
        readOnly: true,
      },
      {
        name: buildSyncVolumeName,
        mountPath: "/data",
      },
    ],
    ports: [
      {
        name: rsyncPortName,
        protocol: "TCP",
        containerPort: utilRsyncPort,
      },
    ],
    readinessProbe: {
      initialDelaySeconds: 1,
      periodSeconds: 1,
      timeoutSeconds: 3,
      successThreshold: 2,
      failureThreshold: 5,
      tcpSocket: { port: rsyncPortName },
    },
    lifecycle: {
      preStop: {
        exec: {
          // this preStop command makes sure that we wait for some time if an rsync is still ongoing, before
          // actually killing the pod. If the transfer takes more than 30 seconds, which is unlikely, the pod
          // will be killed anyway. The command works by counting the number of rsync processes. This works
          // because rsync forks for every connection.
          command: [
            "/bin/sh",
            "-c",
            "until test $(pgrep -fc '^[^ ]+rsync') = 1; do echo waiting for rsync to finish...; sleep 1; done",
          ],
        },
      },
    },
    resources: stringifyResources(provider.config.resources.util),
    securityContext: {
      runAsUser: 1000,
      runAsGroup: 1000,
    },
  }
}

export function getUtilManifests(
  provider: KubernetesProvider,
  authSecretName: string,
  imagePullSecrets: { name: string }[]
) {
  const kanikoTolerations = [
    ...(provider.config.kaniko?.util?.tolerations || provider.config.kaniko?.tolerations || []),
    builderToleration,
  ]
  const kanikoAnnotations = provider.config.kaniko?.util?.annotations || provider.config.kaniko?.annotations
  const deployment: KubernetesDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      labels: {
        app: utilDeploymentName,
      },
      name: utilDeploymentName,
      annotations: kanikoAnnotations,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: utilDeploymentName,
        },
      },
      template: {
        metadata: {
          labels: {
            app: utilDeploymentName,
          },
          annotations: kanikoAnnotations,
        },
        spec: {
          containers: [getUtilContainer(authSecretName, provider)],
          imagePullSecrets,
          volumes: [
            {
              name: authSecretName,
              secret: {
                secretName: authSecretName,
                items: [
                  {
                    key: dockerAuthSecretKey,
                    path: "config.json",
                  },
                ],
              },
            },
            {
              name: buildSyncVolumeName,
              emptyDir: {},
            },
          ],
          tolerations: kanikoTolerations,
        },
      },
    },
  }

  const service = cloneDeep(baseUtilService)

  // Set the configured nodeSelector, if any
  const nodeSelector = provider.config.kaniko?.util?.nodeSelector || provider.config.kaniko?.nodeSelector
  if (!isEmpty(nodeSelector)) {
    deployment.spec!.template.spec!.nodeSelector = nodeSelector
  }

  return { deployment, service }
}

const baseUtilService: KubernetesResource<V1Service> = {
  apiVersion: "v1",
  kind: "Service",
  metadata: {
    name: utilDeploymentName,
  },
  spec: {
    ports: [
      {
        name: "rsync",
        protocol: "TCP",
        port: utilRsyncPort,
        targetPort: <any>utilRsyncPort,
      },
    ],
    selector: {
      app: utilDeploymentName,
    },
    type: "ClusterIP",
  },
}
