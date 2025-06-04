/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubeApi } from "../api.js"
import { KubernetesError } from "../api.js"
import type { KubernetesServerResource, KubernetesPod } from "../types.js"
import type { V1Pod, V1Status } from "@kubernetes/client-node"
import type { ResourceStatus } from "./status.js"
import type { DeployState } from "../../../types/service.js"
import { combineStates } from "../../../types/service.js"
import stringify from "json-stringify-safe"
import { styles } from "../../../logger/styles.js"

export const POD_LOG_LINES = 30

export function checkPodStatus(pod: KubernetesServerResource<V1Pod>): DeployState {
  const phase = pod.status!.phase

  // phase can be "Running" even if some containers have failed, so we need to check container statuses
  if (phase === "Pending" || phase === "Running") {
    const containerStatuses = pod.status!.containerStatuses

    if (containerStatuses) {
      let allTerminated = true

      for (const c of containerStatuses) {
        // Return "unhealthy" if image or command is invalid
        if (
          c.state &&
          c.state.waiting &&
          (c.state.waiting.reason === "ImageInspectError" || c.state.waiting.reason === "ErrImagePull")
        ) {
          return "unhealthy"
        }

        // One of the containers failed
        if (c.state?.terminated) {
          if (c.state?.terminated?.exitCode !== 0) {
            return "unhealthy"
          }
        } else {
          allTerminated = false
        }
      }

      if (phase === "Running") {
        return "ready"
      } else if (allTerminated) {
        return "stopped"
      }
    }

    return "deploying"
  } else if (phase === "Failed") {
    return "unhealthy"
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
  sinceSeconds,
}: {
  api: KubeApi
  namespace: string
  pod: V1Pod
  containerNames?: string[]
  byteLimit?: number
  lineLimit?: number
  timestamps?: boolean
  sinceSeconds?: number
}) {
  let podContainers = [
    // Include init containers
    ...(pod.spec!.initContainers || []).map((c) => c.name).filter((n) => !n.match(/garden-/)),
    ...pod.spec!.containers.map((c) => c.name).filter((n) => !n.match(/garden-/)),
  ]

  if (containerNames) {
    podContainers = podContainers.filter((name) => containerNames.includes(name))
  }
  const containerByOrder = podContainers.reduce<{ [key: string]: number }>((memo, name, index) => {
    memo[name] = index
    return memo
  }, {})

  const allLogs = await Promise.all(
    podContainers.map(async (container) => {
      const follow = false
      const insecureSkipTLSVerifyBackend = false
      const pretty = undefined

      let log: unknown
      let retLog: string
      try {
        log = await api.core.readNamespacedPodLog({
          name: pod.metadata!.name!,
          namespace,
          container,
          follow,
          insecureSkipTLSVerifyBackend,
          limitBytes: byteLimit,
          pretty,
          previous: false,
          sinceSeconds,
          tailLines: lineLimit,
          timestamps,
        })
      } catch (error) {
        if (!(error instanceof KubernetesError)) {
          throw error
        }

        const terminated = error.responseStatusCode === 400 && error.apiMessage?.endsWith("is terminated")

        if (terminated || error.responseStatusCode === 404) {
          // Couldn't find pod/container, try requesting a previously terminated one
          try {
            log = await api.core.readNamespacedPodLog({
              name: pod.metadata!.name!,
              namespace,
              container,
              follow,
              insecureSkipTLSVerifyBackend,
              limitBytes: byteLimit,
              pretty,
              previous: true,
              sinceSeconds,
              tailLines: lineLimit,
              timestamps,
            })
          } catch (err) {
            retLog = `[Could not retrieve previous logs for deleted pod ${pod.metadata!.name!}: ${
              err || "Unknown error occurred"
            }]`
          }
        } else if (error instanceof KubernetesError && error.message.includes("waiting to start")) {
          retLog = ""
        } else {
          throw error
        }
      }

      if (typeof log === "string") {
        retLog = log
      } else if (typeof log === "object") {
        retLog = stringify(log)
      } else if (!log) {
        retLog = ""
      } else {
        retLog = "[Could not read Pod logs. Received unexpected output.]"
      }

      // the API returns undefined if no logs have been output, for some reason
      return { containerName: container, log: retLog }
    })
  )

  // The logs are grouped by container in the order that the logs promises are resolved so we sort
  // them in the order the containers appear in the config.
  const sortedLogs = allLogs.sort((a, b) => containerByOrder[a.containerName] - containerByOrder[b.containerName])

  return sortedLogs
}

/**
 * Get a formatted list of log tails for each of the specified pods. Used for debugging and error logs.
 */
export async function getFormattedPodLogs(
  api: KubeApi,
  namespace: string,
  pods: KubernetesPod[],
  filterFn?: (params: { log: string; containerName: string }) => boolean
): Promise<string | null> {
  const yesFilter = () => true
  const logFilter = filterFn || yesFilter
  const allLogs = await Promise.all(
    pods.map(async (pod) => {
      return {
        podName: pod.metadata.name,
        // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
        // accidentally logs a binary file or something.
        containers: await getPodLogs({ api, namespace, pod, byteLimit: 5000, lineLimit: POD_LOG_LINES }),
      }
    })
  )

  const hasLogs = !!allLogs.flatMap(({ containers }) => containers.map((c) => c.log)).join("")

  if (!hasLogs) {
    return null
  }

  return allLogs
    .map(({ podName, containers }) => {
      const containerLogs = containers
        .filter(logFilter)
        // Format logs like so: <pod-name>/<container-name>: log message
        .map(({ containerName, log }) => {
          return log
            .split("\n")
            .map((line) => (line ? styles.primary(`${styles.section(podName + "/" + containerName)}: ${line}`) : ""))
            .join("\n")
        })
        .join("\n")

      return containerLogs
    })
    .join("\n")
}

export function getExecExitCode(status: V1Status): number {
  // Status can be either "Success" or "Failure"
  if (status.status === "Success") {
    return 0
  }

  const causes = status.details?.causes || []
  const exitCodeCause = causes.find((c) => c.reason === "ExitCode")

  if (exitCodeCause && exitCodeCause.message) {
    return parseInt(exitCodeCause.message, 10)
  }

  return 1
}
