/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1PodSpec } from "@kubernetes/client-node"
import { ContainerModule } from "../../../container/config"
import { millicpuToString, megabytesToString, makePodName } from "../../util"
import {
  dockerAuthSecretName,
  inClusterRegistryHostname,
  skopeoDaemonContainerName,
  gardenUtilDaemonDeploymentName,
} from "../../constants"
import { KubeApi } from "../../api"
import { LogEntry } from "../../../../logger/log-entry"
import { getDockerAuthVolume } from "../../util"
import { KubernetesProvider, KubernetesPluginContext, DEFAULT_KANIKO_IMAGE } from "../../config"
import { ConfigurationError } from "../../../../exceptions"
import { PodRunner } from "../../run"
import { getRegistryHostname, getKubernetesSystemVariables } from "../../init"
import { Writable } from "stream"
import { getSystemNamespace } from "../../namespace"
import { dedent } from "../../../../util/string"
import { RunResult } from "../../../../types/plugin/base"
import { PluginContext } from "../../../../plugin-context"
import { KubernetesPod } from "../../types"
import { BuildStatusHandler, skopeoBuildStatus, getSocatContainer } from "./common"
import { differenceBy } from "lodash"

export const getKanikoBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const api = await KubeApi.factory(log, ctx, provider)
  const systemNamespace = await getSystemNamespace(ctx, provider, log)

  return skopeoBuildStatus({
    namespace: systemNamespace,
    deploymentName: gardenUtilDaemonDeploymentName,
    containerName: skopeoDaemonContainerName,
    log,
    api,
    ctx,
    provider,
    module,
  })
}

export const DEFAULT_KANIKO_FLAGS = ["--cache=true"]

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
  namespace: string
  log: LogEntry
  module: ContainerModule
  args: string[]
  outputStream: Writable
}

export async function runKaniko({
  ctx,
  provider,
  namespace,
  log,
  module,
  args,
  outputStream,
}: RunKanikoParams): Promise<RunResult> {
  const api = await KubeApi.factory(log, ctx, provider)

  const podName = makePodName("kaniko", namespace, module.name)
  const registryHostname = getRegistryHostname(provider.config)
  const k8sSystemVars = getKubernetesSystemVariables(provider.config)
  const syncDataVolumeName = k8sSystemVars["sync-volume-name"]
  const commsVolumeName = "comms"
  const commsMountPath = "/.garden/comms"

  // Escape the args so that we can safely interpolate them into the kaniko command
  const argsStr = args.map((arg) => JSON.stringify(arg)).join(" ")

  let commandStr = dedent`
      /kaniko/executor ${argsStr};
      export exitcode=$?;
      touch ${commsMountPath}/done;
      exit $exitcode;
    `
  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    // This may seem kind of insane but we have to wait until the socat proxy is up (because Kaniko immediately tries to
    // reach the registry we plan on pushing to). See the support container in the Pod spec below for more on this
    // hackery.
    commandStr = dedent`
      while true; do
        if ls ${commsMountPath}/socatStarted 2> /dev/null; then
          ${commandStr}
        else
          sleep 0.3;
        fi
      done
    `
  }

  const kanikoImage = provider.config.kaniko?.image || DEFAULT_KANIKO_IMAGE

  const spec: V1PodSpec = {
    shareProcessNamespace: true,
    volumes: [
      // Mount the build sync volume, to get the build context from.
      {
        name: syncDataVolumeName,
        persistentVolumeClaim: { claimName: syncDataVolumeName },
      },
      // Mount the docker auth secret, so Kaniko can pull from private registries.
      getDockerAuthVolume(),
      // Mount a volume to communicate between the containers in the Pod.
      {
        name: commsVolumeName,
        emptyDir: {},
      },
    ],
    containers: [
      {
        name: "kaniko",
        image: kanikoImage,
        command: ["sh", "-c", commandStr],
        volumeMounts: [
          {
            name: syncDataVolumeName,
            mountPath: "/garden-build",
          },
          {
            name: dockerAuthSecretName,
            mountPath: "/kaniko/.docker",
            readOnly: true,
          },
          {
            name: commsVolumeName,
            mountPath: commsMountPath,
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
  }

  if (provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname) {
    spec.containers = spec.containers.concat([
      getSocatContainer(registryHostname),
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
                  touch ${commsMountPath}/socatStarted;
                  break;
                else
                  sleep 0.3;
                fi
              done
              while true; do
                if ls ${commsMountPath}/done 2> /dev/null; then
                  killall socat; exit 0;
                else
                  sleep 0.3;
                fi
              done
            `,
        ],
        volumeMounts: [
          {
            name: commsVolumeName,
            mountPath: commsMountPath,
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
      namespace,
    },
    spec,
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace,
  })

  const result = await runner.runAndWait({
    log,
    remove: true,
    timeoutSec: module.spec.build.timeout,
    stdout: outputStream,
    tty: false,
  })

  return {
    ...result,
    moduleName: module.name,
    version: module.version.versionString,
  }
}
