/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "../api"
import Bluebird from "bluebird"
import { KubernetesServerResource, KubernetesPod } from "../types"
import { V1Pod, V1Status } from "@kubernetes/client-node"
import { ResourceStatus } from "./status"
import chalk from "chalk"
import { ServiceState, combineStates } from "../../../types/service"

export const POD_LOG_LINES = 30

export function checkPodStatus(pod: KubernetesServerResource<V1Pod>): ServiceState {
  const phase = pod.status!.phase

  if (phase === "Pending") {
    // Return "unhealthy" if image or command is invalid
    const containerStatuses = pod.status!.containerStatuses

    if (containerStatuses) {
      for (const c of containerStatuses) {
        if (
          c.state &&
          c.state.waiting &&
          (c.state.waiting.reason === "ImageInspectError" || c.state.waiting.reason === "ErrImagePull")
        ) {
          return "unhealthy"
        }
        if (c.state && c.state.terminated) {
          if (c.state.terminated.exitCode === 0) {
            return "stopped"
          } else {
            return "unhealthy"
          }
        }
      }
    }

    return "deploying"
  } else if (phase === "Failed") {
    return "unhealthy"
  } else if (phase === "Running") {
    return "ready"
  } else if (phase === "Succeeded" || phase === "Completed") {
    return "stopped"
  } else {
    return "unknown"
  }
}

export function checkWorkloadPodStatus(
  resource: KubernetesServerResource,
  pods: KubernetesServerResource<V1Pod>[]
): ResourceStatus {
  return { state: combineStates(pods.map(checkPodStatus)), resource }
}

export async function getPodLogs({
  api,
  namespace,
  pod,
  containerNames,
  byteLimit,
  lineLimit,
  timestamps,
}: {
  api: KubeApi
  namespace: string
  pod: V1Pod
  containerNames?: string[]
  byteLimit?: number
  lineLimit?: number
  timestamps?: boolean
}) {
  let podContainers = pod.spec!.containers.map((c) => c.name).filter((n) => !n.match(/garden-/))

  if (containerNames) {
    podContainers = podContainers.filter((name) => containerNames.includes(name))
  }

  return Bluebird.map(podContainers, async (containerName) => {
    let log = ""

    const follow = false
    const insecureSkipTLSVerify = false
    const pretty = undefined
    const sinceSeconds = undefined

    try {
      log = await api.core.readNamespacedPodLog(
        pod.metadata!.name!,
        namespace,
        containerName,
        follow,
        insecureSkipTLSVerify,
        byteLimit,
        pretty,
        false, // previous
        sinceSeconds,
        lineLimit,
        timestamps
      )
    } catch (err) {
      if (err.statusCode === 404) {
        // Couldn't find pod/container, try requesting a previously terminated one
        log = await api.core.readNamespacedPodLog(
          pod.metadata!.name!,
          namespace,
          containerName,
          follow,
          insecureSkipTLSVerify,
          byteLimit,
          pretty,
          true, // previous
          sinceSeconds,
          lineLimit,
          timestamps
        )
      } else if (err instanceof KubernetesError && err.message.includes("waiting to start")) {
        log = ""
      } else {
        throw err
      }
    }

    if (typeof log === "object") {
      log = JSON.stringify(log)
    }

    // the API returns undefined if no logs have been output, for some reason
    return { containerName, log: log || "" }
  })
}

/**
 * Get a formatted list of log tails for each of the specified pods. Used for debugging and error logs.
 */
export async function getFormattedPodLogs(api: KubeApi, namespace: string, pods: KubernetesPod[]): Promise<string> {
  const allLogs = await Bluebird.map(pods, async (pod) => {
    return {
      podName: pod.metadata.name,
      // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
      // accidentally logs a binary file or something.
      containers: await getPodLogs({ api, namespace, pod, byteLimit: 5000, lineLimit: POD_LOG_LINES }),
    }
  })

  return allLogs
    .map(({ podName, containers }) => {
      return (
        chalk.blueBright(`\n****** ${podName} ******\n`) +
        containers.map(({ containerName, log }) => {
          return chalk.gray(`------ ${containerName} ------`) + (log || "<no logs>")
        })
      )
    })
    .join("\n\n")
}

export function getExecExitCode(status: V1Status) {
  let exitCode = 0

  if (status.status !== "Success") {
    exitCode = 1

    const causes = status.details?.causes || []
    const exitCodeCause = causes.find((c) => c.reason === "ExitCode")

    if (exitCodeCause && exitCodeCause.message) {
      exitCode = parseInt(exitCodeCause.message, 10)
    }
  }

  return exitCode
}
