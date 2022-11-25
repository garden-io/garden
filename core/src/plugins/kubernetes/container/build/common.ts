/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import type { ContainerBuildAction, ContainerRegistryConfig } from "../../../container/moduleConfig.js"
import type { KubeApi } from "../../api.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../config.js"
import { PodRunner, PodRunnerError } from "../../run.js"
import type { PluginContext } from "../../../../plugin-context.js"
import { hashString, sleep } from "../../../../util/util.js"
import { InternalError, RuntimeError } from "../../../../exceptions.js"
import type { Log } from "../../../../logger/log-entry.js"
import { prepareDockerAuth } from "../../init.js"
import { prepareSecrets } from "../../secrets.js"
import { Mutagen } from "../../../../mutagen.js"
import { randomString } from "../../../../util/string.js"
import type { V1Container, V1Service } from "@kubernetes/client-node"
import { cloneDeep, isEmpty } from "lodash-es"
import { compareDeployedResources, waitForResources } from "../../status/status.js"
import type { KubernetesDeployment, KubernetesResource, KubernetesServiceAccount } from "../../types.js"
import type { BuildActionHandler, BuildActionResults } from "../../../../plugin/action-types.js"
import { k8sGetContainerBuildActionOutputs } from "../handlers.js"
import type { Resolved } from "../../../../actions/types.js"
import { stringifyResources } from "../util.js"
import { getKubectlExecDestination } from "../../sync.js"
import { getRunningDeploymentPod } from "../../util.js"
import { buildSyncVolumeName, dockerAuthSecretKey, k8sUtilImageName, rsyncPortName } from "../../constants.js"
import { styles } from "../../../../logger/styles.js"
import type { StringMap } from "../../../../config/common.js"

export const inClusterBuilderServiceAccount = "garden-in-cluster-builder"
export const sharedBuildSyncDeploymentName = "garden-build-sync"
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
  log: Log
  api: KubeApi
  action: ContainerBuildAction
  namespace: string
  deploymentName: string
  sourcePath?: string
}

export async function syncToBuildSync(params: SyncToSharedBuildSyncParams) {
  const { ctx, action, log, api, namespace, deploymentName } = params

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

  // Sync using mutagen
  const key = `k8s--build-sync--${ctx.environmentName}--${namespace}--${action.name}--${randomString(8)}`
  const targetPath = `/data/${ctx.workingCopyId}/${action.name}`

  const mutagen = new Mutagen({ ctx, log })

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
    await mutagen.ensureSync({
      log,
      key,
      logSection: action.key(),
      sourceDescription: `${action.kind} ${action.name} build path`,
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
        // make files world and group readable by default. This is also the default for git.
        defaultFileMode: 0o644,
        defaultDirectoryMode: 0o755,
        ignore: [],
      },
    })

    // -> Flush the sync once
    await mutagen.flushSync(key)
    log.debug(`Sync from ${sourcePath} to ${resourceName} completed`)
  } finally {
    // -> Terminate the sync
    await mutagen.terminateSync(log, key)
    log.debug(`Sync connection terminated`)
  }

  log.info("File sync to cluster complete")

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
  log: Log
  api: KubeApi
  ctx: PluginContext
  provider: KubernetesProvider
  action: Resolved<ContainerBuildAction>
}): Promise<BuildStatusResult> {
  const deploymentRegistry = provider.config.deploymentRegistry

  if (!deploymentRegistry) {
    // This is validated in the provider configure handler, so this is an internal error if it happens
    throw new InternalError({
      message: `Expected configured deploymentRegistry for remote build`,
    })
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
    if (err instanceof PodRunnerError) {
      const res = err.details.result

      // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
      if (res?.exitCode !== 0 && skopeoManifestUnknown(res?.stderr)) {
        // This would happen when the image does not exist, i.e. not ready
        return { state: "not-ready", outputs, detail: {} }
      }

      const output = res?.allLogs || err.message

      throw new RuntimeError({
        message: `Unable to query registry for image status: Command "${skopeoCommand.join(
          " "
        )}" failed. This is the output:\n${output}`,
        wrappedErrors: [err],
      })
    }

    throw err
  }
}

/**
 Returns `true` if the error implies the registry does not have a manifest with the given name.
 Useful for e.g. when getting the build status for an image that has never been pushed before.
 */
export function skopeoManifestUnknown(errMsg: string | null | undefined): boolean {
  if (!errMsg) {
    return false
  }
  return (
    errMsg.includes("manifest unknown") ||
    errMsg.includes("name unknown") ||
    errMsg.includes("Failed to fetch") ||
    /(artifact|repository) [^ ]+ not found/.test(errMsg)
  )
}

export async function ensureServiceAccount({
  ctx,
  log,
  api,
  namespace,
  annotations,
}: {
  ctx: PluginContext
  log: Log
  api: KubeApi
  namespace: string
  annotations?: StringMap
}): Promise<boolean> {
  return deployLock.acquire(namespace, async () => {
    const serviceAccount = getBuilderServiceAccountSpec(annotations)

    const status = await compareDeployedResources({
      ctx: ctx as KubernetesPluginContext,
      api,
      namespace,
      manifests: [serviceAccount],
      log,
    })

    // NOTE: This is here to make sure that we remove annotations in case they are removed in the garden config.
    // `compareDeployedResources` as of today only checks wether the manifest is a subset of the deployed manifest.
    // The manifest is still a subset of the deployed manifest, if an annotation has been removed. But we want the
    // annotation to be actually removed.
    // NOTE(steffen): I tried to change the behaviour of `compareDeployedResources` to return "outdated" when the
    // annotations have changed. But a lot of code actually depends on the behaviour of it with missing annotations.
    const annotationsNeedUpdate =
      status.remoteResources.length > 0 && !isEqualAnnotations(serviceAccount, status.remoteResources[0])

    const needUpsert = status.state !== "ready" || annotationsNeedUpdate

    if (needUpsert) {
      await api.upsert({ kind: "ServiceAccount", namespace, log, obj: serviceAccount })
      return true
    }

    return false
  })
}

function isEqualAnnotations(r1: KubernetesResource, r2: KubernetesResource): boolean {
  // normalize annotations before comparison
  const a1 = r1.metadata.annotations !== undefined ? r1.metadata.annotations : {}
  const a2 = r2.metadata.annotations !== undefined ? r2.metadata.annotations : {}
  return JSON.stringify(a1) === JSON.stringify(a2)
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
  log: Log
  api: KubeApi
  namespace: string
}) {
  const serviceAccountChanged = await ensureServiceAccount({
    ctx,
    log,
    api,
    namespace,
    annotations: provider.config.kaniko?.serviceAccountAnnotations,
  })

  return deployLock.acquire(namespace, async () => {
    const deployLog = log.createLog()

    const { authSecret, updated: secretUpdated } = await ensureBuilderSecret({
      provider,
      log,
      api,
      namespace,
    })

    const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })

    // Check status of the util deployment
    const { deployment, service } = getUtilManifests(provider, authSecret.metadata.name, imagePullSecrets)
    const status = await compareDeployedResources({
      ctx: ctx as KubernetesPluginContext,
      api,
      namespace,
      manifests: [deployment, service],
      log: deployLog,
    })

    // if the service account changed, all pods part of the deployment must be restarted
    // so that they receive new credentials (e.g. for IRSA)
    if (status.remoteResources.length && serviceAccountChanged) {
      await cycleDeployment({ ctx, provider, deployment, api, namespace, deployLog })
    }

    if (status.state === "ready") {
      // Need to wait a little to ensure the secret is updated in the deployment
      if (secretUpdated) {
        await sleep(1000)
      }
      return { authSecret, updated: serviceAccountChanged }
    }

    // Deploy the service
    deployLog.info(
      styles.primary(`-> Deploying ${utilDeploymentName} service in ${namespace} namespace (was ${status.state})`)
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

    deployLog.info("Done!")

    return { authSecret, updated: true }
  })
}

export async function cycleDeployment({
  ctx,
  provider,
  deployment,
  api,
  namespace,
  deployLog,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  deployment: KubernetesDeployment
  api: KubeApi
  namespace: string
  deployLog: Log
}) {
  const originalReplicas = deployment.spec.replicas

  deployment.spec.replicas = 0
  await api.upsert({ kind: "Deployment", namespace, log: deployLog, obj: deployment })
  await waitForResources({
    namespace,
    ctx,
    provider,
    resources: [deployment],
    log: deployLog,
    timeoutSec: 600,
  })

  deployment.spec.replicas = originalReplicas
  await api.upsert({ kind: "Deployment", namespace, log: deployLog, obj: deployment })
  await waitForResources({
    namespace,
    ctx,
    provider,
    resources: [deployment],
    log: deployLog,
    timeoutSec: 600,
  })
}

export async function getManifestInspectArgs(remoteId: string, deploymentRegistry: ContainerRegistryConfig) {
  const dockerArgs = ["manifest", "inspect", remoteId]
  const { hostname } = deploymentRegistry
  // Allow insecure connections on local registry
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname === "default-route-openshift-image-registry.apps-crc.testing"
  ) {
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
  log: Log
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

  const existingSecret = await api.readBySpecOrNull({ log, namespace, manifest: authSecret })

  if (!existingSecret || authSecret.data?.[dockerAuthSecretKey] !== existingSecret.data?.[dockerAuthSecretKey]) {
    log.info(styles.primary(`-> Updating Docker auth secret in namespace ${namespace}`))
    await api.upsert({ kind: "Secret", namespace, log, obj: authSecret })
    updated = true
  }

  return { authSecret, updated }
}

export function getBuilderServiceAccountSpec(annotations?: StringMap) {
  const serviceAccount: KubernetesServiceAccount = {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: {
      name: inClusterBuilderServiceAccount,
      // ensure we clear old annotations if config flags are removed
      annotations: annotations || {},
    },
  }

  return serviceAccount
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
            "until test $(pgrep -f '^[^ ]+rsync' | wc -l) = 1; do echo waiting for rsync to finish...; sleep 1; done",
          ],
        },
      },
    },
    resources: stringifyResources(provider.config?.resources?.util),
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
  const utilContainer = getUtilContainer(authSecretName, provider)
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
      strategy: {
        // Note: When updating the deployment, we make sure to kill off old buildkit pods before new pods are started.
        // This is important because with multiple running Pods we might end up syncing or building to the wrong Pod.
        type: "Recreate",
      },
      template: {
        metadata: {
          labels: {
            app: utilDeploymentName,
          },
          annotations: kanikoAnnotations,
        },
        spec: {
          serviceAccountName: inClusterBuilderServiceAccount,
          containers: [utilContainer],
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
