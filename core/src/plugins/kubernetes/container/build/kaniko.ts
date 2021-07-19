/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import { V1PodSpec, V1Service } from "@kubernetes/client-node"
import { ContainerModule } from "../../../container/config"
import { millicpuToString, megabytesToString, makePodName } from "../../util"
import {
  inClusterRegistryHostname,
  skopeoDaemonContainerName,
  buildSyncVolumeName,
  dockerAuthSecretKey,
  k8sUtilImageName,
} from "../../constants"
import { KubeApi } from "../../api"
import { LogEntry } from "../../../../logger/log-entry"
import { KubernetesProvider, KubernetesPluginContext, DEFAULT_KANIKO_IMAGE } from "../../config"
import { BuildError, ConfigurationError } from "../../../../exceptions"
import { PodRunner } from "../../run"
import { Writable } from "stream"
import { ensureNamespace, getNamespaceStatus, getSystemNamespace } from "../../namespace"
import { dedent } from "../../../../util/string"
import { RunResult } from "../../../../types/plugin/base"
import { PluginContext } from "../../../../plugin-context"
import { KubernetesDeployment, KubernetesPod, KubernetesResource } from "../../types"
import {
  BuildStatusHandler,
  skopeoBuildStatus,
  getSocatContainer,
  BuildHandler,
  utilRsyncPort,
  syncToBuildSync,
  ensureBuilderSecret,
  commonSyncArgs,
  builderToleration,
  getUtilContainer,
} from "./common"
import { cloneDeep, differenceBy, isEmpty } from "lodash"
import chalk from "chalk"
import split2 from "split2"
import { LogLevel } from "../../../../logger/logger"
import { renderOutputStream, sleep } from "../../../../util/util"
import { getDockerBuildFlags } from "../../../container/build"
import { containerHelpers } from "../../../container/helpers"
import { compareDeployedResources, waitForResources } from "../../status/status"

export const DEFAULT_KANIKO_FLAGS = ["--cache=true"]

const utilDeploymentName = "garden-util"
const sharedVolumeName = "comms"
const sharedMountPath = "/.garden"
const contextPath = sharedMountPath + "/context"

const deployLock = new AsyncLock()

export const getKanikoBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = (await getNamespaceStatus({ log, ctx, provider })).namespaceName

  await ensureUtilDeployment({
    ctx,
    provider,
    log,
    api,
    namespace,
  })

  return skopeoBuildStatus({
    namespace,
    deploymentName: utilDeploymentName,
    containerName: skopeoDaemonContainerName,
    log,
    api,
    ctx,
    provider,
    module,
  })
}

export const kanikoBuild: BuildHandler = async (params) => {
  const { ctx, module, log } = params
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const projectNamespace = (await getNamespaceStatus({ log, ctx, provider })).namespaceName

  const localId = containerHelpers.getLocalImageId(module, module.version)
  const deploymentImageId = containerHelpers.getDeploymentImageId(
    module,
    module.version,
    provider.config.deploymentRegistry
  )
  const dockerfile = module.spec.dockerfile || "Dockerfile"

  let { authSecret } = await ensureUtilDeployment({
    ctx,
    provider,
    log,
    api,
    namespace: projectNamespace,
  })

  await syncToBuildSync({
    ...params,
    api,
    namespace: projectNamespace,
    deploymentName: utilDeploymentName,
    rsyncPort: utilRsyncPort,
  })

  log.setState(`Building image ${localId}...`)

  let buildLog = ""

  // Stream debug log to a status line
  const outputStream = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
    statusLine.setState(renderOutputStream(line.toString()))
  })

  // Use the project namespace if set to null in config
  // TODO: change in 0.13 to default to project namespace
  let kanikoNamespace =
    provider.config.kaniko?.namespace === null ? projectNamespace : provider.config.kaniko?.namespace

  if (!kanikoNamespace) {
    kanikoNamespace = await getSystemNamespace(ctx, provider, log)
  }

  if (kanikoNamespace !== projectNamespace) {
    // Make sure the Kaniko Pod namespace has the auth secret ready
    const secretRes = await ensureBuilderSecret({
      provider,
      log: log.placeholder(),
      api,
      namespace: kanikoNamespace,
    })

    authSecret = secretRes.authSecret
  }

  await ensureNamespace(api, { name: kanikoNamespace }, log)

  // Execute the build
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

  const buildRes = await runKaniko({
    ctx,
    provider,
    log,
    kanikoNamespace,
    utilNamespace: projectNamespace,
    authSecretName: authSecret.metadata.name,
    module,
    args,
    outputStream,
  })

  buildLog = buildRes.log

  if (kanikoBuildFailed(buildRes)) {
    throw new BuildError(`Failed building module ${chalk.bold(module.name)}:\n\n${buildLog}`, { buildLog })
  }

  log.silly(buildLog)

  return {
    buildLog,
    fetched: false,
    fresh: true,
    version: module.version.versionString,
  }
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

    // Check status of the util deployment
    const { deployment, service } = getUtilManifests(provider, authSecret.metadata.name)
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
      serviceName: "garden-util",
      resources: [deployment, service],
      log: deployLog,
      timeoutSec: 600,
    })

    deployLog.setState({ append: true, msg: "Done!" })

    return { authSecret, updated: true }
  })
}

export const getKanikoFlags = (flags?: string[], topLevelFlags?: string[]): string[] => {
  if (!flags && !topLevelFlags) {
    return DEFAULT_KANIKO_FLAGS
  }
  const flagToKey = (flag: string) => {
    const found = flag.match(/--([a-zA-Z]*)/)
    if (found === null) {
      throw new ConfigurationError(`Invalid format for a kaniko flag`, { flag })
    }
    return found[0]
  }
  const defaultsToKeep = differenceBy(DEFAULT_KANIKO_FLAGS, flags || topLevelFlags || [], flagToKey)
  const topLevelToKeep = differenceBy(topLevelFlags || [], flags || [], flagToKey)
  return [...(flags || []), ...topLevelToKeep, ...defaultsToKeep]
}

export function kanikoBuildFailed(buildRes: RunResult) {
  return (
    !buildRes.success &&
    !(
      buildRes.log.includes("error pushing image: ") &&
      buildRes.log.includes("cannot be overwritten because the repository is immutable.")
    )
  )
}

interface RunKanikoParams {
  ctx: PluginContext
  provider: KubernetesProvider
  kanikoNamespace: string
  utilNamespace: string
  authSecretName: string
  log: LogEntry
  module: ContainerModule
  args: string[]
  outputStream: Writable
}

async function runKaniko({
  ctx,
  provider,
  kanikoNamespace,
  utilNamespace,
  authSecretName,
  log,
  module,
  args,
  outputStream,
}: RunKanikoParams): Promise<RunResult> {
  const api = await KubeApi.factory(log, ctx, provider)

  const podName = makePodName("kaniko", module.name)

  // Escape the args so that we can safely interpolate them into the kaniko command
  const argsStr = args.map((arg) => JSON.stringify(arg)).join(" ")

  let commandStr = dedent`
    /kaniko/executor ${argsStr};
    export exitcode=$?;
    touch ${sharedMountPath}/done;
    exit $exitcode;
  `

  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    // This may seem kind of insane but we have to wait until the socat proxy is up (because Kaniko immediately tries to
    // reach the registry we plan on pushing to). See the support container in the Pod spec below for more on this
    // hackery.
    commandStr = dedent`
      while true; do
        if ls ${sharedMountPath}/socatStarted 2> /dev/null; then
          ${commandStr}
        else
          sleep 0.3;
        fi
      done
    `
  }

  const kanikoImage = provider.config.kaniko?.image || DEFAULT_KANIKO_IMAGE
  const utilHostname = `${utilDeploymentName}.${utilNamespace}.svc.cluster.local`
  const sourceUrl = `rsync://${utilHostname}:${utilRsyncPort}/volume/${ctx.workingCopyId}/${module.name}/`

  const syncArgs = [...commonSyncArgs, sourceUrl, contextPath]

  const spec: V1PodSpec = {
    shareProcessNamespace: true,
    volumes: [
      // Mount the docker auth secret, so Kaniko can pull from private registries.
      {
        name: authSecretName,
        secret: {
          secretName: authSecretName,
          items: [{ key: dockerAuthSecretKey, path: "config.json" }],
        },
      },
      // Mount a volume to communicate between the containers in the Pod.
      {
        name: sharedVolumeName,
        emptyDir: {},
      },
    ],
    // Start by rsyncing the build context from the util deployment
    initContainers: [
      {
        name: "init",
        image: k8sUtilImageName,
        command: [
          "/bin/sh",
          "-c",
          dedent`
            echo "Copying from ${sourceUrl} to ${contextPath}"
            mkdir -p ${contextPath}
            n=0
            until [ "$n" -ge 30 ]
            do
              rsync ${syncArgs.join(" ")} && break
              n=$((n+1))
              sleep 1
            done
            echo "Done!"
          `,
        ],
        imagePullPolicy: "IfNotPresent",
        volumeMounts: [
          {
            name: sharedVolumeName,
            mountPath: sharedMountPath,
          },
        ],
      },
    ],
    containers: [
      {
        name: "kaniko",
        image: kanikoImage,
        command: ["sh", "-c", commandStr],
        volumeMounts: [
          {
            name: authSecretName,
            mountPath: "/kaniko/.docker",
            readOnly: true,
          },
          {
            name: sharedVolumeName,
            mountPath: sharedMountPath,
          },
        ],
        resources: {
          limits: {
            cpu: millicpuToString(provider.config.resources.builder.limits.cpu),
            memory: megabytesToString(provider.config.resources.builder.limits.memory),
          },
          requests: {
            cpu: millicpuToString(provider.config.resources.builder.requests.cpu),
            memory: megabytesToString(provider.config.resources.builder.requests.memory),
          },
        },
      },
    ],
    tolerations: [builderToleration],
  }

  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    spec.containers = spec.containers.concat([
      getSocatContainer(provider),
      // This is a workaround so that the kaniko executor can wait until socat starts, and so that the socat proxy
      // doesn't just keep running after the build finishes. Doing this in the kaniko Pod is currently not possible
      // because of https://github.com/GoogleContainerTools/distroless/issues/225
      {
        name: "support",
        image: "busybox:1.31.1",
        command: [
          "sh",
          "-c",
          dedent`
              while true; do
                if pidof socat 2> /dev/null; then
                  touch ${sharedMountPath}/socatStarted;
                  break;
                else
                  sleep 0.3;
                fi
              done
              while true; do
                if ls ${sharedMountPath}/done 2> /dev/null; then
                  killall socat; exit 0;
                else
                  sleep 0.3;
                fi
              done
            `,
        ],
        volumeMounts: [
          {
            name: sharedVolumeName,
            mountPath: sharedMountPath,
          },
        ],
      },
    ])
  }

  const pod: KubernetesPod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace: kanikoNamespace,
    },
    spec,
  }

  // Set the configured nodeSelector, if any
  if (!isEmpty(provider.config.kaniko?.nodeSelector)) {
    pod.spec.nodeSelector = provider.config.kaniko?.nodeSelector
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace: kanikoNamespace,
  })

  const result = await runner.runAndWait({
    log,
    remove: true,
    timeoutSec: module.spec.build.timeout,
    stdout: outputStream,
    stderr: outputStream,
    tty: false,
  })

  return {
    ...result,
    moduleName: module.name,
    version: module.version.versionString,
  }
}

export function getUtilManifests(provider: KubernetesProvider, authSecretName: string) {
  const deployment: KubernetesDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      labels: {
        app: utilDeploymentName,
      },
      name: utilDeploymentName,
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
        },
        spec: {
          containers: [getUtilContainer(authSecretName)],
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
          tolerations: [builderToleration],
        },
      },
    },
  }

  const service = cloneDeep(baseUtilService)

  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    // We need a proxy sidecar to be able to reach the in-cluster registry from the Pod
    deployment.spec!.template.spec!.containers.push(getSocatContainer(provider))
  }

  // Set the configured nodeSelector, if any
  if (!isEmpty(provider.config.kaniko?.nodeSelector)) {
    deployment.spec!.template.spec!.nodeSelector = provider.config.kaniko?.nodeSelector
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
