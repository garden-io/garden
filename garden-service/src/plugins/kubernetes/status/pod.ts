/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "../api"
import Bluebird from "bluebird"
import { KubernetesServerResource } from "../types"
import { V1Pod } from "@kubernetes/client-node"
import { ResourceStatus } from "./status"
import chalk from "chalk"
import { ServiceState, combineStates } from "../../../types/service"

export const podLogLines = 20

export function checkPodStatus(pod: KubernetesServerResource<V1Pod>): ServiceState {
  const phase = pod.status!.phase

  if (phase === "Pending") {
    // Return "unhealthy" if image or command is invalid
    const containerStatuses = pod.status!.containerStatuses

    if (containerStatuses) {
      for (const c of containerStatuses) {
        if (c.state && c.state.waiting && c.state.waiting.reason === "ImageInspectError") {
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
  } else if (phase === "Succeeded") {
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
  podName,
  containerNames,
  byteLimit,
  lineLimit,
}: {
  api: KubeApi
  namespace: string
  podName: string
  containerNames?: string[]
  byteLimit?: number
  lineLimit?: number
}) {
  let podRes: V1Pod

  try {
    podRes = await api.core.readNamespacedPod(podName, namespace)
  } catch (err) {
    if (err.statusCode === 404) {
      return []
    } else {
      throw err
    }
  }

  let podContainers = podRes.spec!.containers.map((c) => c.name).filter((n) => !n.match(/garden-/))

  if (containerNames) {
    podContainers = podContainers.filter((name) => containerNames.includes(name))
  }

  return Bluebird.map(podContainers, async (containerName) => {
    let log = ""

    try {
      log = await api.core.readNamespacedPodLog(
        podName,
        namespace,
        containerName,
        false, // follow
        false, // insecureSkipTLSVerify
        byteLimit,
        undefined, // pretty
        false, // previous
        undefined, // sinceSeconds
        lineLimit
      )
    } catch (err) {
      if (err instanceof KubernetesError && err.message.includes("waiting to start")) {
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
export async function getFormattedPodLogs(api: KubeApi, namespace: string, podNames: string[]): Promise<string> {
  const allLogs = await Bluebird.map(podNames, async (podName) => {
    return {
      podName,
      // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
      // accidentally logs a binary file or something.
      containers: await getPodLogs({ api, namespace, podName, byteLimit: 5000, lineLimit: podLogLines }),
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
