/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import chalk from "chalk"
import split2 = require("split2")
import { cloneDeep, isEmpty } from "lodash"
import {
  buildSyncVolumeName,
  dockerAuthSecretKey,
  inClusterRegistryHostname,
  k8sUtilImageName,
  rsyncPortName,
} from "../../constants"
import { KubeApi } from "../../api"
import { KubernetesDeployment } from "../../types"
import { LogEntry } from "../../../../logger/log-entry"
import { waitForResources, compareDeployedResources } from "../../status/status"
import { KubernetesProvider, KubernetesPluginContext } from "../../config"
import { PluginContext } from "../../../../plugin-context"
import { prepareDockerAuth, getRegistryHostname } from "../../init"
import { BuildStatusHandler, skopeoBuildStatus, BuildHandler, syncToBuildSync, getSocatContainer } from "./common"
import { getNamespace } from "../../namespace"
import { containerHelpers } from "../../../container/helpers"
import { LogLevel } from "../../../../logger/log-node"
import { renderOutputStream, sleep } from "../../../../util/util"
import { ContainerModule } from "../../../container/config"
import { getDockerBuildArgs } from "../../../container/build"
import { getDeploymentPod, millicpuToString, megabytesToString } from "../../util"
import { PodRunner } from "../../run"
import { V1Container } from "@kubernetes/client-node"

export const buildkitImageName = "gardendev/buildkit:v0.8.1-4"
export const buildkitDeploymentName = "garden-buildkit"
export const buildkitAuthSecretName = "garden-docker-auth"
const buildkitContainerName = "buildkitd"
const utilRsyncPort = 8730

const deployLock = new AsyncLock()

export const getBuildkitBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getNamespace({ log, ctx, provider })

  await ensureBuildkit({
    ctx,
    provider,
    log,
    api,
    namespace,
  })

  return skopeoBuildStatus({
    namespace,
    deploymentName: buildkitDeploymentName,
    containerName: utilContainer.name,
    log,
    api,
    ctx,
    provider,
    module,
  })
}

export const buildkitBuildHandler: BuildHandler = async (params) => {
  const { ctx, module, log } = params
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getNamespace({ log, ctx, provider })

  await ensureBuildkit({
    ctx,
    provider,
    log,
    api,
    namespace,
  })

  const localId = containerHelpers.getLocalImageId(module, module.version)
  const deploymentImageName = containerHelpers.getDeploymentImageName(module, provider.config.deploymentRegistry)
  const deploymentImageId = containerHelpers.getDeploymentImageId(
    module,
    module.version,
    provider.config.deploymentRegistry
  )
  const dockerfile = module.spec.dockerfile || "Dockerfile"

  const { contextPath } = await syncToBuildSync({
    ...params,
    api,
    namespace,
    deploymentName: buildkitDeploymentName,
    rsyncPort: utilRsyncPort,
  })

  log.setState(`Building image ${localId}...`)

  let buildLog = ""

  // Stream debug log to a status line
  const stdout = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  stdout.on("error", () => {})
  stdout.on("data", (line: Buffer) => {
    statusLine.setState(renderOutputStream(line.toString()))
  })

  // Prepare the build command (this thing, while an otherwise excellent piece of software, is clearly is not meant for
  // everyday human usage)
  let outputSpec = `type=image,name=${deploymentImageId},push=true`

  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    // The in-cluster registry is not exposed, so we don't configure TLS on it.
    outputSpec += ",registry.insecure=true"
  }

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
    "--output",
    outputSpec,
    "--export-cache",
    "type=inline",
    "--import-cache",
    `type=registry,ref=${deploymentImageName}`,
    ...getBuildkitFlags(module),
  ]

  // Execute the build
  const buildTimeout = module.spec.build.timeout

  const pod = await getDeploymentPod({ api, deploymentName: buildkitDeploymentName, namespace })

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
    stdout,
    buffer: true,
  })

  buildLog = buildRes.log

  log.silly(buildLog)

  return {
    buildLog,
    fetched: false,
    fresh: true,
    version: module.version.versionString,
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
  return deployLock.acquire("deploy", async () => {
    const deployLog = log.placeholder()

    // Check status of the buildkit deployment
    const manifest = getBuildkitDeployment(provider)
    const status = await compareDeployedResources(ctx as KubernetesPluginContext, api, namespace, [manifest], deployLog)

    // Ensure docker auth secret is available and up-to-date in the namespace
    const authSecret = await prepareDockerAuth(api, provider, namespace)
    authSecret.metadata.name = buildkitAuthSecretName
    const existingSecret = await api.readOrNull({ log: deployLog, namespace, manifest: authSecret })

    if (!existingSecret || authSecret.data?.[dockerAuthSecretKey] !== existingSecret.data?.[dockerAuthSecretKey]) {
      deployLog.setState(chalk.gray(`-> Updating Docker auth secret in namespace ${namespace}`))
      await api.upsert({ kind: "Secret", namespace, log: deployLog, obj: authSecret })
      // Need to wait a little to ensure the secret is updated in the buildkit deployment
      if (status.state === "ready") {
        await sleep(5)
      }
    }

    if (status.state === "ready") {
      return false
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
      serviceName: "garden-buildkit",
      resources: [manifest],
      log: deployLog,
      timeoutSec: 600,
    })

    deployLog.setState({ append: true, msg: "Done!" })
    return true
  })
}

export function getBuildkitFlags(module: ContainerModule) {
  const args: string[] = []

  for (const arg of getDockerBuildArgs(module)) {
    args.push("--opt", "build-arg:" + arg)
  }

  if (module.spec.build.targetImage) {
    args.push("--opt", "target=" + module.spec.build.targetImage)
  }

  args.push(...(module.spec.extraFlags || []))

  return args
}

export function getBuildkitDeployment(provider: KubernetesProvider) {
  const deployment = cloneDeep(baseBuildkitDeployment)
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

  buildkitContainer.resources = {
    limits: {
      cpu: millicpuToString(provider.config.resources.builder.limits.cpu),
      memory: megabytesToString(provider.config.resources.builder.limits.memory),
    },
    requests: {
      cpu: millicpuToString(provider.config.resources.builder.requests.cpu),
      memory: megabytesToString(provider.config.resources.builder.requests.memory),
    },
  }

  // We need a proxy sidecar to be able to reach the in-cluster registry from the Pod
  const registryHostname = getRegistryHostname(provider.config)
  deployment.spec!.template.spec!.containers.push(getSocatContainer(registryHostname))

  // Set the configured nodeSelector, if any
  if (!isEmpty(provider.config.clusterBuildkit?.nodeSelector)) {
    deployment.spec!.template.spec!.nodeSelector = provider.config.clusterBuildkit?.nodeSelector
  }

  return deployment
}

const utilContainer: V1Container = {
  name: "util",
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
      name: buildkitAuthSecretName,
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
    tcpSocket: { port: <object>(<unknown>rsyncPortName) },
  },
  resources: {
    // This should be ample
    limits: {
      cpu: "256m",
      memory: "512Mi",
    },
  },
  securityContext: {
    runAsUser: 1000,
    runAsGroup: 1000,
  },
}

const baseBuildkitDeployment: KubernetesDeployment = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    labels: {
      app: buildkitDeploymentName,
    },
    name: buildkitDeploymentName,
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
                name: buildkitAuthSecretName,
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
          utilContainer,
        ],
        volumes: [
          {
            name: buildkitAuthSecretName,
            secret: {
              secretName: buildkitAuthSecretName,
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
        tolerations: [
          {
            key: "garden-build",
            operator: "Equal",
            value: "true",
            effect: "NoSchedule",
          },
        ],
      },
    },
  },
}
