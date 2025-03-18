/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import split2 from "split2"
import { isEmpty } from "lodash-es"
import {
  buildSyncVolumeName,
  buildkitContainerName,
  buildkitDeploymentName,
  dockerAuthSecretKey,
  getBuildkitImagePath,
  getBuildkitRootlessImagePath,
} from "../../constants.js"
import { KubeApi } from "../../api.js"
import type { KubernetesDeployment } from "../../types.js"
import type { Log } from "../../../../logger/log-entry.js"
import { waitForResources, compareDeployedResources } from "../../status/status.js"
import type { KubernetesProvider, KubernetesPluginContext, ClusterBuildkitCacheConfig } from "../../config.js"
import type { BuildStatusHandler, BuildHandler } from "./common.js"
import {
  skopeoBuildStatus,
  syncToBuildSync,
  getUtilContainer,
  ensureBuilderSecret,
  builderToleration,
  inClusterBuilderServiceAccount,
  ensureServiceAccount,
  cycleDeployment,
} from "./common.js"
import { getAppNamespace } from "../../namespace.js"
import { sleep } from "../../../../util/util.js"
import type { ContainerBuildAction, ContainerModuleOutputs } from "../../../container/moduleConfig.js"
import { getDockerBuildArgs, getDockerSecrets } from "../../../container/build.js"
import type { Resolved } from "../../../../actions/types.js"
import { PodRunner } from "../../run.js"
import { prepareSecrets } from "../../secrets.js"
import { getRunningDeploymentPod } from "../../util.js"
import { defaultDockerfileName } from "../../../container/config.js"
import { k8sGetContainerBuildActionOutputs } from "../handlers.js"
import { stringifyResources } from "../util.js"
import { styles } from "../../../../logger/styles.js"
import type { ResolvedBuildAction } from "../../../../actions/build.js"
import { commandListToShellScript } from "../../../../util/escape.js"
import { type MaybeSecret, maybeSecret } from "../../../../util/secrets.js"

const AWS_ECR_REGEX = /^([^\.]+\.)?dkr\.ecr\.([^\.]+\.)amazonaws\.com\//i // AWS Elastic Container Registry

// NOTE: If you change this, please make sure to also change the table in our documentation in config.ts
const MODE_MAX_ALLOWED_REGISTRIES = [
  AWS_ECR_REGEX,
  /^([^/]+\.)?pkg\.dev\//i, // Google Package Registry
  /^([^/]+\.)?azurecr\.io\//i, // Azure Container registry
  /^hub\.docker\.com\//i, // DockerHub
  /^ghcr\.io\//i, // GitHub Container registry
]

const deployLock = new AsyncLock()

export const getBuildkitBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  const { authSecret } = await ensureBuildkit({
    ctx,
    provider,
    log,
    api,
    namespace,
  })

  return skopeoBuildStatus({
    namespace,
    deploymentName: buildkitDeploymentName,
    containerName: getUtilContainer(authSecret.metadata.name, provider).name,
    log,
    api,
    ctx,
    provider,
    action,
  })
}

export const buildkitBuildHandler: BuildHandler = async (params) => {
  const { ctx, action, log } = params
  const spec = action.getSpec()
  const k8sCtx = ctx as KubernetesPluginContext

  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  await ensureBuildkit({
    ctx,
    provider,
    log,
    api,
    namespace,
  })

  const outputs = k8sGetContainerBuildActionOutputs({ provider, action })

  const localId = outputs.localImageId
  const dockerfile = spec.dockerfile || defaultDockerfileName

  const { contextPath } = await syncToBuildSync({
    ...params,
    ctx: k8sCtx,
    api,
    namespace,
    deploymentName: buildkitDeploymentName,
  })

  log.createLog({ origin: "buildkit" }).info(`Building image ${styles.highlight(localId)}...`)

  const logEventContext = {
    origin: "buildkit",
    level: "verbose" as const,
  }

  const outputStream = split2()
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
  })

  const command = makeBuildkitBuildCommand({ provider, outputs, action, contextPath, dockerfile })

  // Execute the build
  const buildTimeout = action.getConfig("timeout")

  const pod = await getRunningDeploymentPod({ api, deploymentName: buildkitDeploymentName, namespace })

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace,
    pod,
  })

  const buildRes = await runner.exec({
    log,
    command,
    timeoutSec: buildTimeout,
    containerName: buildkitContainerName,
    stdout: outputStream,
    stderr: outputStream,
    buffer: true,
  })

  const buildLog = buildRes.log

  log.silly(() => buildLog)

  return {
    state: "ready",
    outputs,
    detail: {
      buildLog,
      fetched: false,
      fresh: true,
      outputs,
      runtime: {
        actual: {
          kind: "remote",
          type: "plugin",
          pluginName: ctx.provider.name,
        },
      },
    },
  }
}

export async function ensureBuildkit({
  ctx,
  provider,
  log,
  api,
  namespace,
}: {
  ctx: KubernetesPluginContext
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
  })

  return deployLock.acquire(namespace, async () => {
    const deployLog = log.createLog()

    // Make sure auth secret is in place
    const { authSecret, updated: secretUpdated } = await ensureBuilderSecret({
      provider,
      log,
      api,
      namespace,
    })

    const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })

    // Check status of the buildkit deployment
    const manifest = getBuildkitDeployment(provider, authSecret.metadata.name, imagePullSecrets)
    const status = await compareDeployedResources({
      ctx: ctx as KubernetesPluginContext,
      api,
      namespace,
      manifests: [manifest],
      log: deployLog,
    })

    // if the service account changed, all pods part of the deployment must be restarted
    // so that they receive new credentials (e.g. for IRSA)
    if (status.remoteResources.length > 0 && serviceAccountChanged) {
      await cycleDeployment({ ctx, provider, deployment: manifest, api, namespace, deployLog })
    }

    if (status.state === "ready") {
      // Need to wait a little to ensure the secret is updated in the deployment
      if (secretUpdated) {
        await sleep(1000)
      }
      return { authSecret, updated: serviceAccountChanged }
    }

    // Deploy the buildkit daemon
    deployLog.info(
      `Deploying ${buildkitDeploymentName} daemon in ${styles.highlight(namespace)} namespace (was ${status.state})`
    )

    await api.upsert({ kind: "Deployment", namespace, log: deployLog, obj: manifest })

    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: "garden-buildkit",
      resources: [manifest],
      log: deployLog,
      timeoutSec: 600,
    })

    deployLog.info("Done!")

    return { authSecret, updated: true }
  })
}

/**
 * Returns the full build command which first changes into the build context directory
 * and then runs the `buildctl` command.
 *
 * We change into the build context directory to e.g. ensure that secret files that are
 * passed as extra flags will have the correct path when the command is executed.
 */
export function makeBuildkitBuildCommand({
  provider,
  outputs,
  action,
  contextPath,
  dockerfile,
}: {
  provider: KubernetesProvider
  outputs: ContainerModuleOutputs
  action: ResolvedBuildAction
  contextPath: string
  dockerfile: string
}): MaybeSecret[] {
  const { secretArgs, secretEnvVars } = getDockerSecrets(action.getSpec())

  const buildctlCommand = [
    "buildctl",
    "build",
    "--frontend=dockerfile.v0",
    "--local",
    "context=" + contextPath,
    "--local",
    "dockerfile=" + contextPath,
    "--opt",
    "filename=" + dockerfile,
    ...secretArgs,
    ...getBuildkitImageFlags(
      provider.config.clusterBuildkit!.cache,
      outputs,
      provider.config.deploymentRegistry!.insecure
    ),
    ...getBuildkitFlags(action),
  ]

  return [
    "sh",
    "-c",
    maybeSecret`cd ${contextPath} && ${commandListToShellScript({ command: buildctlCommand, env: secretEnvVars })}`,
  ]
}

export function getBuildkitFlags(action: Resolved<ContainerBuildAction>) {
  const args: string[] = []

  const spec = action.getSpec()

  for (const arg of getDockerBuildArgs(action.versionString(), spec.buildArgs)) {
    args.push("--opt", "build-arg:" + arg)
  }

  if (spec.targetStage) {
    args.push("--opt", "target=" + spec.targetStage)
  }

  for (const platform of spec.platforms || []) {
    args.push("--opt", "platform=" + platform)
  }

  args.push(...(spec.extraFlags || []))

  return args
}

export function getBuildkitImageFlags(
  cacheConfig: ClusterBuildkitCacheConfig[],
  moduleOutputs: ContainerModuleOutputs,
  deploymentRegistryInsecure: boolean
) {
  const args: string[] = []

  const inlineCaches = cacheConfig.filter(
    (config) => getSupportedCacheMode(config, getCacheImageName(moduleOutputs, config)) === "inline"
  )
  const imageNames = [moduleOutputs["deployment-image-id"]]

  if (inlineCaches.length > 0) {
    args.push("--export-cache", "type=inline")

    for (const cache of inlineCaches) {
      const cacheImageName = getCacheImageName(moduleOutputs, cache)
      imageNames.push(`${cacheImageName}:${cache.tag}`)
    }
  }

  let deploymentRegistryExtraSpec = ""
  if (deploymentRegistryInsecure) {
    deploymentRegistryExtraSpec = ",registry.insecure=true"
  }

  args.push("--output", `type=image,"name=${imageNames.join(",")}",push=true${deploymentRegistryExtraSpec}`)

  for (const cache of cacheConfig) {
    const cacheImageName = getCacheImageName(moduleOutputs, cache)

    let registryExtraSpec = ""
    if (cache.registry === undefined) {
      registryExtraSpec = deploymentRegistryExtraSpec
    } else if (cache.registry?.insecure === true) {
      registryExtraSpec = ",registry.insecure=true"
    }

    // subtle: it is important that --import-cache arguments are in the same order as the cacheConfigs
    // buildkit will go through them one by one, and use the first that has any cache hit for all following
    // layers, so it will actually never use multiple caches at once
    args.push("--import-cache", `type=registry,ref=${cacheImageName}:${cache.tag}${registryExtraSpec}`)

    if (cache.export === false) {
      continue
    }

    const cacheMode = getSupportedCacheMode(cache, cacheImageName)
    // we handle inline caches above
    if (cacheMode === "inline") {
      continue
    }

    // AWS ECR needs extra flag image-manifest=true with mode=max
    // See also https://aws.amazon.com/blogs/containers/announcing-remote-cache-support-in-amazon-ecr-for-buildkit-clients/
    let imageManifestFlag = ""
    if (cacheMode === "max" && AWS_ECR_REGEX.test(cacheImageName)) {
      imageManifestFlag = "image-manifest=true,"
    }

    args.push(
      "--export-cache",
      `${imageManifestFlag}type=registry,ref=${cacheImageName}:${cache.tag},mode=${cacheMode}${registryExtraSpec}`
    )
  }

  return args
}

function getCacheImageName(moduleOutputs: ContainerModuleOutputs, cacheConfig: ClusterBuildkitCacheConfig): string {
  if (cacheConfig.registry === undefined) {
    return moduleOutputs["deployment-image-name"]
  }

  const { hostname, port, namespace } = cacheConfig.registry
  const portPart = port ? `:${port}` : ""
  return `${hostname}${portPart}/${namespace}/${moduleOutputs["local-image-name"]}`
}

export const getSupportedCacheMode = (
  cache: ClusterBuildkitCacheConfig,
  deploymentImageName: string
): ClusterBuildkitCacheConfig["mode"] => {
  if (cache.mode !== "auto") {
    return cache.mode
  }

  // use mode=max for all registries that are known to support it
  for (const allowed of MODE_MAX_ALLOWED_REGISTRIES) {
    if (allowed.test(deploymentImageName)) {
      return "max"
    }
  }

  // we default to mode=inline for all the other registries, including
  // self-hosted ones. Actually almost all self-hosted registries do support
  // mode=max, but harbor doesn't. As it is hard to auto-detect harbor, we
  // chose to use mode=inline for all unknown registries.
  return "inline"
}

export function getBuildkitDeployment(
  provider: KubernetesProvider,
  authSecretName: string,
  imagePullSecrets: { name: string }[]
) {
  const tolerations = [...(provider.config.clusterBuildkit?.tolerations || []), builderToleration]
  const deployment: KubernetesDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      labels: {
        app: buildkitDeploymentName,
      },
      name: buildkitDeploymentName,
      annotations: provider.config.clusterBuildkit?.annotations,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: buildkitDeploymentName,
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
            app: buildkitDeploymentName,
          },
          annotations: provider.config.clusterBuildkit?.annotations,
        },
        spec: {
          serviceAccountName: inClusterBuilderServiceAccount,
          containers: [
            {
              name: buildkitContainerName,
              image: getBuildkitImagePath(provider.config.utilImageRegistryDomain),
              args: ["--addr", "unix:///run/buildkit/buildkitd.sock"],
              readinessProbe: {
                exec: {
                  command: ["buildctl", "debug", "workers"],
                },
                initialDelaySeconds: 3,
                periodSeconds: 5,
              },
              securityContext: {
                privileged: true,
              },
              volumeMounts: [
                {
                  name: authSecretName,
                  mountPath: "/.docker",
                  readOnly: true,
                },
                {
                  name: buildSyncVolumeName,
                  mountPath: "/garden-build",
                },
              ],
              env: [
                {
                  name: "DOCKER_CONFIG",
                  value: "/.docker",
                },
              ],
            },
            // Attach the util container
            getUtilContainer(authSecretName, provider),
          ],
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
          tolerations,
        },
      },
    },
  }

  const buildkitContainer = deployment.spec!.template.spec!.containers[0]

  // Optionally run buildkit in rootless mode
  if (!!provider.config.clusterBuildkit?.rootless) {
    deployment.spec!.template.metadata!.annotations = {
      "container.apparmor.security.beta.kubernetes.io/buildkitd": "unconfined",
      "container.seccomp.security.alpha.kubernetes.io/buildkitd": "unconfined",
    }
    buildkitContainer.image = getBuildkitRootlessImagePath(provider.config.utilImageRegistryDomain)
    buildkitContainer.args = [
      "--addr",
      "unix:///run/user/1000/buildkit/buildkitd.sock",
      "--oci-worker-no-process-sandbox",
    ]
    buildkitContainer.securityContext = {
      runAsUser: 1000,
      runAsGroup: 1000,
    }
  }

  buildkitContainer.resources = stringifyResources(provider.config.resources.builder)

  // Set the configured nodeSelector, if any
  if (!isEmpty(provider.config.clusterBuildkit?.nodeSelector)) {
    deployment.spec!.template.spec!.nodeSelector = provider.config.clusterBuildkit?.nodeSelector
  }

  return deployment
}
