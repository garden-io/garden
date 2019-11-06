/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "../api"
import Bluebird from "bluebird"
import { KubernetesServerResource } from "../types"
import { V1Pod } from "@kubernetes/client-node"
import { some } from "lodash"
import { ResourceStatus } from "./status"
import chalk from "chalk"

export const podLogLines = 20

export function checkPodStatus(
  resource: KubernetesServerResource,
  pods: KubernetesServerResource<V1Pod>[]
): ResourceStatus {
  for (const pod of pods) {
    // TODO: detect unhealthy state (currently we just time out)
    const ready = some(pod.status!.conditions!.map((c) => c.type === "ready"))
    if (!ready) {
      return { state: "deploying", resource }
    }
  }

  return { state: "ready", resource }
}

/**
 * Get a formatted list of log tails for each of the specified pods. Used for debugging and error logs.
 */
export async function getPodLogs(api: KubeApi, namespace: string, podNames: string[]): Promise<string> {
  const allLogs = await Bluebird.map(podNames, async (name) => {
    let containerName: string | undefined

    try {
      const podRes = await api.core.readNamespacedPod(name, namespace)
      const containerNames = podRes.spec.containers.map((c) => c.name)
      if (containerNames.length > 1) {
        containerName = containerNames.filter((n) => !n.match(/garden-/))[0] || containerNames[0]
      } else {
        containerName = containerNames[0]
      }
    } catch (err) {
      if (err.code === 404) {
        return ""
      } else {
        throw err
      }
    }

    // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
    // accidentally logs a binary file or something.
    try {
      const log = await api.core.readNamespacedPodLog(
        name,
        namespace,
        containerName,
        false,
        5000,
        undefined,
        false,
        undefined,
        podLogLines
      )
      return log ? chalk.blueBright(`\n****** ${name} ******\n`) + log : ""
    } catch (err) {
      if (err instanceof KubernetesError && err.message.includes("waiting to start")) {
        return ""
      } else {
        throw err
      }
    }
  })
  return allLogs.filter((l) => l !== "").join("\n\n")
}
