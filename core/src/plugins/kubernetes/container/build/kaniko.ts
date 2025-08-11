/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { V1PodSpec } from "@kubernetes/client-node"
import {
  skopeoDaemonContainerName,
  dockerAuthSecretKey,
  defaultKanikoImageName,
  getK8sUtilImagePath,
} from "../../constants.js"
import { KubeApi } from "../../api.js"
import type { Log } from "../../../../logger/log-entry.js"
import type { KubernetesProvider, KubernetesPluginContext } from "../../config.js"
import { BuildError, ConfigurationError } from "../../../../exceptions.js"
import { PodRunner } from "../../run.js"
import { ensureNamespace, getAppNamespace, getSystemNamespace } from "../../namespace.js"
import { prepareSecrets } from "../../secrets.js"
import { dedent } from "../../../../util/string.js"
import type { RunResult } from "../../../../plugin/base.js"
import type { PluginContext } from "../../../../plugin-context.js"
import type { KubernetesPod } from "../../types.js"
import type { BuildStatusHandler, BuildHandler } from "./common.js"
import {
  skopeoBuildStatus,
  utilRsyncPort,
  syncToBuildSync,
  ensureBuilderSecret,
  commonSyncArgs,
  builderToleration,
  ensureUtilDeployment,
  utilDeploymentName,
  inClusterBuilderServiceAccount,
  ensureServiceAccount,
} from "./common.js"
import { differenceBy, isEmpty } from "lodash-es"
import { getDockerBuildFlags } from "../../../container/build.js"
import { k8sGetContainerBuildActionOutputs } from "../handlers.js"
import { stringifyResources } from "../util.js"
import { makePodName } from "../../util.js"
import type { ContainerBuildAction } from "../../../container/config.js"
import { defaultDockerfileName } from "../../../container/config.js"
import { styles } from "../../../../logger/styles.js"
import { commandListToShellScript } from "../../../../util/escape.js"
import type { ContainerProviderConfig } from "../../../container/container.js"

export const DEFAULT_KANIKO_FLAGS = ["--cache=true"]

const sharedVolumeName = "comms"
const sharedMountPath = "/.garden"
const contextPath = sharedMountPath + "/context"

export const getKanikoBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

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
    action,
  })
}

export const kanikoBuild: BuildHandler = async (params) => {
  const { ctx, action, log } = params
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const k8sCtx = ctx as KubernetesPluginContext

  const projectNamespace = await getAppNamespace(k8sCtx, log, provider)

  const spec = action.getSpec()

  if (spec.secrets) {
    throw new ConfigurationError({
      message: dedent`
        Unfortunately Kaniko does not support secret build arguments.
        Remote Container Builder and the Kubernetes BuildKit in-cluster builder both support secrets.

        See also https://github.com/GoogleContainerTools/kaniko/issues/3028
      `,
    })
  }

  const outputs = k8sGetContainerBuildActionOutputs({ provider, action, log })

  const localId = outputs.localImageId
  const deploymentImageId = outputs.deploymentImageId
  const dockerfile = spec.dockerfile || defaultDockerfileName

  const platforms = action.getSpec().platforms
  if (platforms && platforms.length > 1) {
    throw new ConfigurationError({
      message: dedent`Failed building ${styles.bold(action.name)}.
          Kaniko does not support multi-platform builds.
          Please consider a build method that supports multi-platform builds.
          See: https://docs.garden.io/other-plugins/container#multi-platform-builds`,
    })
  }

  let { authSecret } = await ensureUtilDeployment({
    ctx,
    provider,
    log,
    api,
    namespace: projectNamespace,
  })

  await syncToBuildSync({
    ...params,
    ctx: ctx as KubernetesPluginContext,
    api,
    namespace: projectNamespace,
    deploymentName: utilDeploymentName,
  })

  log.info(`Building image ${localId}...`)

  // Use the project namespace by default
  let kanikoNamespace = provider.config.kaniko?.namespace || projectNamespace

  if (!kanikoNamespace) {
    kanikoNamespace = await getSystemNamespace(k8sCtx, provider, log)
  }

  await ensureNamespace(api, k8sCtx, { name: kanikoNamespace }, log)

  if (kanikoNamespace !== projectNamespace) {
    // Make sure the Kaniko Pod namespace has the auth secret ready
    const secretRes = await ensureBuilderSecret({
      provider,
      log: log.createLog(),
      api,
      namespace: kanikoNamespace,
    })

    authSecret = secretRes.authSecret

    // Make sure the Kaniko Pod namespace has the garden-in-cluster-builder service account
    await ensureServiceAccount({
      ctx,
      log,
      api,
      namespace: kanikoNamespace,
    })
  }

  // Execute the build
  const args = [
    "--context",
    "dir://" + contextPath,
    "--dockerfile",
    dockerfile,
    "--destination",
    deploymentImageId,
    ...getKanikoFlags(spec.extraFlags, provider.config.kaniko?.extraFlags),
  ]

  const isOpenShiftLocal =
    provider.config.deploymentRegistry?.hostname === "default-route-openshift-image-registry.apps-crc.testing"

  if (isOpenShiftLocal) {
    // The registry in OpenShift Local requires TLS and comes with a self-signed certificate
    args.push("--skip-tls-verify")
  }

  // TODO: do we support the garden-provided in-cluster registry anymore, or could this be deleted?
  if (provider.config.deploymentRegistry?.insecure === true && !isOpenShiftLocal) {
    // The in-cluster registry is not exposed, so we don't configure TLS on it.
    args.push("--insecure")
  }

  const containerProviderConfig: ContainerProviderConfig = provider.dependencies.container.config

  args.push(...getDockerBuildFlags(action, containerProviderConfig, log))

  const buildRes = await runKaniko({
    ctx,
    provider,
    log,
    kanikoNamespace,
    utilNamespace: projectNamespace,
    authSecretName: authSecret.metadata.name,
    action,
    args,
  })

  const buildLog = buildRes.log

  if (kanikoBuildFailed(buildRes)) {
    throw new BuildError({
      message: `Failed building ${styles.bold(action.name)}:\n\n${buildLog}`,
    })
  }

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

export const getKanikoFlags = (flags?: string[], topLevelFlags?: string[]): string[] => {
  if (!flags && !topLevelFlags) {
    return DEFAULT_KANIKO_FLAGS
  }
  const flagToKey = (flag: string) => {
    const found = flag.match(/--([a-zA-Z-]*)/)
    if (found === null) {
      throw new ConfigurationError({
        message: `Invalid format for a kaniko flag. Expected it to match /--([a-zA-Z-]*)/, actually got: ${flag}`,
      })
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
  log: Log
  action: ContainerBuildAction
  args: string[]
}

export function getKanikoBuilderPodManifest({
  provider,
  kanikoNamespace,
  authSecretName,
  syncArgs,
  imagePullSecrets,
  sourceUrl,
  podName,
  kanikoCommand,
}: {
  provider: KubernetesProvider
  kanikoNamespace: string
  authSecretName: string
  syncArgs: string[]
  imagePullSecrets: {
    name: string
  }[]
  sourceUrl: string
  podName: string
  kanikoCommand: string[]
}) {
  const kanikoImage = provider.config.kaniko?.image || defaultKanikoImageName
  const kanikoTolerations = [...(provider.config.kaniko?.tolerations || []), builderToleration]

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
    imagePullSecrets,
    // Start by rsyncing the build context from the util deployment
    initContainers: [
      {
        name: "init",
        image: getK8sUtilImagePath(provider.config.utilImageRegistryDomain),
        command: [
          "/bin/sh",
          "-c",
          dedent`
            echo "Copying from $SYNC_SOURCE_URL to $SYNC_CONTEXT_PATH"
            mkdir -p "$SYNC_CONTEXT_PATH"
            n=0
            until [ "$n" -ge 30 ]
            do
              rsync ${commandListToShellScript({ command: syncArgs })} && break
              n=$((n+1))
              sleep 1
            done
            echo "Done!"
          `,
        ],
        imagePullPolicy: "IfNotPresent",
        env: [
          {
            name: "SYNC_SOURCE_URL",
            value: sourceUrl,
          },
          {
            name: "SYNC_CONTEXT_PATH",
            value: contextPath,
          },
        ],
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
        command: [
          "/bin/sh",
          "-c",
          dedent`
            ${commandListToShellScript({ command: kanikoCommand })};
            export exitcode=$?;
            ${commandListToShellScript({ command: ["touch", `${sharedMountPath}/done`] })};
            exit $exitcode;
          `,
        ],
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
        resources: stringifyResources(provider.config.resources.builder),
      },
    ],
    tolerations: kanikoTolerations,
    serviceAccountName: inClusterBuilderServiceAccount,
  }

  const pod: KubernetesPod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace: kanikoNamespace,
      annotations: provider.config.kaniko?.annotations,
    },
    spec,
  }

  return pod
}

async function runKaniko({
  ctx,
  provider,
  kanikoNamespace,
  utilNamespace,
  authSecretName,
  log,
  action,
  args,
}: RunKanikoParams): Promise<RunResult> {
  const api = await KubeApi.factory(log, ctx, provider)

  const podName = makePodName("kaniko", action.name)

  const kanikoCommand = ["/kaniko/executor", ...args]

  const utilHostname = `${utilDeploymentName}.${utilNamespace}.svc.cluster.local`
  const sourceUrl = `rsync://${utilHostname}:${utilRsyncPort}/volume/${ctx.workingCopyId}/${action.name}/`
  const imagePullSecrets = await prepareSecrets({
    api,
    namespace: kanikoNamespace,
    secrets: provider.config.imagePullSecrets,
    log,
  })

  const syncArgs = [...commonSyncArgs, sourceUrl, contextPath]

  const pod = getKanikoBuilderPodManifest({
    provider,
    podName,
    sourceUrl,
    syncArgs,
    imagePullSecrets,
    kanikoCommand,
    kanikoNamespace,
    authSecretName,
  })

  // Set the configured nodeSelector, if any
  if (!isEmpty(provider.config.kaniko?.nodeSelector)) {
    pod.spec.nodeSelector = provider.config.kaniko?.nodeSelector
  }

  const runner = new PodRunner({
    ctx,
    logEventContext: {
      origin: "kaniko",
      level: "verbose",
    },
    api,
    pod,
    provider,
    namespace: kanikoNamespace,
  })

  const timeoutSec = action.getConfig("timeout")

  const result = await runner.runAndWait({
    log,
    remove: true,
    events: ctx.events,
    timeoutSec,
    tty: false,
  })

  return result
}
