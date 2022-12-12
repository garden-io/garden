/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import chalk from "chalk"
import split2 = require("split2")
import { isEmpty } from "lodash"
import { buildSyncVolumeName, dockerAuthSecretKey } from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesDeployment } from "../../types"
import { LogEntry } from "../../../../logger/log-entry"
import { waitForResources, compareDeployedResources } from "../../status/status"
import { KubernetesProvider, KubernetesPluginContext, ClusterBuildkitCacheConfig } from "../../config"
import { PluginContext } from "../../../../plugin-context"
import {
  BuildStatusHandler,
  skopeoBuildStatus,
  BuildHandler,
  syncToBuildSync,
  getUtilContainer,
  utilRsyncPort,
  ensureBuilderSecret,
  builderToleration,
} from "./common"
import { getNamespaceStatus } from "../../namespace"
import { LogLevel } from "../../../../logger/logger"
import { renderOutputStream, sleep } from "../../../../util/util"
import { ContainerBuildAction, ContainerModuleOutputs } from "../../../container/moduleConfig"
import { getDockerBuildArgs } from "../../../container/build"
<<<<<<< HEAD
import { getRunningDeploymentPod, millicpuToString, megabytesToString } from "../../util"
import { PodRunner } from "../../run"
import { prepareSecrets } from "../../secrets"
import { defaultDockerfileName } from "../../../container/helpers"
import { k8sGetContainerBuildActionOutputs } from "../handlers"
import { Resolved } from "../../../../actions/types"
=======
import { getRunningDeploymentPod, usingInClusterRegistry } from "../../util"
import { PodRunner } from "../../run"
import { prepareSecrets } from "../../secrets"
import { ContainerModuleOutputs } from "../../../container/container"
import { stringifyResources } from "../util"
>>>>>>> main

export const buildkitImageName = "gardendev/buildkit:v0.10.5-2"
export const buildkitDeploymentName = "garden-buildkit"
const buildkitContainerName = "buildkitd"

const deployLock = new AsyncLock()

export const getBuildkitBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = (await getNamespaceStatus({ log, ctx, provider })).namespaceName

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

  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = (await getNamespaceStatus({ log, ctx, provider })).namespaceName

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
    ctx: ctx as KubernetesPluginContext,
    api,
    namespace,
    deploymentName: buildkitDeploymentName,
    rsyncPort: utilRsyncPort,
  })

  log.setState(`Building image ${localId}...`)

  let buildLog = ""

  // Stream verbose logs to a status line
  const outputStream = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
    statusLine.setState(renderOutputStream(line.toString()))
  })

  const command = [
    "buildctl",
    "build",
    "--frontend=dockerfile.v0",
    "--local",
    "context=" + contextPath,
    "--local",
    "dockerfile=" + contextPath,
    "--opt",
    "filename=" + dockerfile,
    ...getBuildkitImageFlags(
      provider.config.clusterBuildkit!.cache,
      outputs,
      provider.config.deploymentRegistry!.insecure
    ),
    ...getBuildkitFlags(action),
  ]

  // Execute the build
  const buildTimeout = spec.timeout

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

  buildLog = buildRes.log

  log.silly(buildLog)

  return {
    state: "ready",
    outputs,
    detail: {
      buildLog,
      fetched: false,
      fresh: true,
      outputs,
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
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  api: KubeApi
  namespace: string
}) {
  return deployLock.acquire(namespace, async () => {
    const deployLog = log.placeholder()

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
    const status = await compareDeployedResources(ctx as KubernetesPluginContext, api, namespace, [manifest], deployLog)

    if (status.state === "ready") {
      // Need to wait a little to ensure the secret is updated in the deployment
      if (secretUpdated) {
        await sleep(1000)
      }
      return { authSecret, updated: false }
    }

    // Deploy the buildkit daemon
    deployLog.setState(
      chalk.gray(`-> Deploying ${buildkitDeploymentName} daemon in ${namespace} namespace (was ${status.state})`)
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

    deployLog.setState({ append: true, msg: "Done!" })

    return { authSecret, updated: true }
  })
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

    args.push(
      "--export-cache",
      `type=registry,ref=${cacheImageName}:${cache.tag},mode=${cacheMode}${registryExtraSpec}`
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

  // NOTE: If you change this, please make sure to also change the table in our documentation in config.ts
  const allowList = [
    /^([^/]+\.)?pkg\.dev\//i, // Google Package Registry
    /^([^/]+\.)?azurecr\.io\//i, // Azure Container registry
    /^hub\.docker\.com\//i, // DockerHub
    /^ghcr\.io\//i, // GitHub Container registry
  ]

  // use mode=max for all registries that are known to support it
  for (const allowed of allowList) {
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
      template: {
        metadata: {
          labels: {
            app: buildkitDeploymentName,
          },
          annotations: provider.config.clusterBuildkit?.annotations,
        },
        spec: {
          containers: [
            {
              name: buildkitContainerName,
              image: buildkitImageName,
              args: ["--addr", "unix:///run/buildkit/buildkitd.sock"],
              readinessProbe: {
                exec: {
                  command: ["buildctl", "debug", "workers"],
                },
                initialDelaySeconds: 3,
                periodSeconds: 5,
              },
              livenessProbe: {
                exec: {
                  command: ["buildctl", "debug", "workers"],
                },
                initialDelaySeconds: 5,
                periodSeconds: 30,
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
            // Attach a util container for the rsync server and to use skopeo
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
    buildkitContainer.image += "-rootless"
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
