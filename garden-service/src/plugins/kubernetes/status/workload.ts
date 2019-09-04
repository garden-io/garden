/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { flatten, sortBy } from "lodash"
import { KubernetesPod, KubernetesServerResource } from "../types"
import {
  V1Deployment,
  V1DaemonSet,
  V1DaemonSetStatus,
  V1StatefulSetStatus,
  V1StatefulSet,
  V1StatefulSetSpec,
  V1DeploymentStatus,
  V1Event,
} from "@kubernetes/client-node"
import dedent = require("dedent")
import { getWorkloadPods } from "../util"
import { getPodLogs, podLogLines } from "./pod"
import { ResourceStatus, StatusHandlerParams } from "./status"
import { getResourceEvents } from "./events"

const containerStatusFailures = ["CrashLoopBackOff", "CreateContainerConfigError", "ImagePullBackOff"]

type Workload = KubernetesServerResource<V1Deployment | V1DaemonSet | V1StatefulSet>

interface Condition {
  message?: string
  reason?: string
}

/**
 * Check the rollout status for the given Deployment, DaemonSet or StatefulSet.
 *
 * NOTE: This mostly replicates the logic in `kubectl rollout status`. Using that directly here
 * didn't pan out, since it doesn't look for events and just times out when errors occur during rollout.
 */
export async function checkWorkloadStatus({ api, namespace, resource }: StatusHandlerParams): Promise<ResourceStatus> {
  const workload = <Workload>resource

  let _pods: KubernetesPod[]
  let _events: V1Event[]

  const getPods = async () => {
    if (!_pods) {
      _pods = await getWorkloadPods(api, namespace, workload)
    }
    return _pods
  }

  const getEvents = async () => {
    if (!_events) {
      // Get all relevant events for the workload
      const workloadEvents = await getResourceEvents(api, workload)
      const pods = await getPods()
      const podEvents = flatten(await Promise.all(pods.map((pod) => getResourceEvents(api, pod))))
      _events = sortBy([...workloadEvents, ...podEvents], (e) => e.metadata.creationTimestamp)
    }
    return _events
  }

  const fail = async (lastMessage: string) => {
    let logs = ""

    // List events
    const events = await getEvents()
    if (events.length > 0) {
      logs += chalk.white("━━━ Events ━━━")
      for (const event of events) {
        const obj = event.involvedObject
        const name = chalk.blueBright(`${obj.kind} ${obj.name}:`)
        const msg = `${event.reason} - ${event.message}`
        const colored =
          event.type === "Error" ? chalk.red(msg) : event.type === "Warning" ? chalk.yellow(msg) : chalk.white(msg)
        logs += `\n${name} ${colored}`
      }
    }

    // Attach pod logs for debug output
    const podNames = (await getPods()).map((pod) => pod.metadata.name)
    const podLogs = (await getPodLogs(api, namespace, podNames)) || undefined

    if (podLogs) {
      logs += chalk.white("\n\n━━━ Pod logs ━━━\n")
      logs +=
        chalk.gray(dedent`
      <Showing last ${podLogLines} lines per pod in this ${workload.kind}. Run the following command for complete logs>
      $ kubectl -n ${namespace} --context=${api.context} logs ${workload.kind.toLowerCase()}/${workload.metadata.name}
      `) +
        "\n" +
        podLogs
    }

    return <ResourceStatus>{
      state: "unhealthy",
      lastMessage,
      logs,
      resource: workload,
    }
  }

  const failWithCondition = (condition: Condition) => {
    return fail(`${condition.reason} - ${condition.message}`)
  }

  // Check the reported rollout status on the workload resource itself.
  const out = await getRolloutStatus(workload)

  // All set, nothing more to check!
  if (out.state === "ready") {
    return out
  }

  // Catch timeout conditions
  for (const condition of workload.status!.conditions || []) {
    if (condition.status === "False" && condition.reason === "ProgressDeadlineExceeded") {
      return failWithCondition(condition)
    }
  }

  // Look for warnings and fatal errors in pod statuses
  for (const pod of await getPods()) {
    const status = pod.status!
    const containerStatuses = status.containerStatuses || []

    for (const containerStatus of containerStatuses) {
      const condition = containerStatus.state && containerStatus.state.waiting && containerStatus.state.waiting
      if (condition && containerStatusFailures.includes(condition.reason!)) {
        return failWithCondition(condition)
      }
    }
  }

  // Look for warnings or failures in the events,
  // so that we can display them or fail fast instead of timing out
  for (let event of await getEvents()) {
    if (
      event.type === "Error" ||
      event.type === "Failed" ||
      (event.type === "Warning" &&
        (event.message!.includes("CrashLoopBackOff") ||
          event.message!.includes("ImagePullBackOff") ||
          event.message!.includes("DeadlineExceeded") ||
          event.reason === "BackOff"))
    ) {
      return failWithCondition(event)
    }

    if (event.type === "Warning") {
      out.warning = true
    }

    let message = event.message

    if (event.reason === event.reason!.toUpperCase()) {
      // some events like ingress events are formatted this way
      message = `${event.reason} ${message}`
    }

    if (message) {
      out.lastMessage = message
    }
  }

  return out
}

async function getRolloutStatus(workload: Workload) {
  const out: ResourceStatus = {
    state: "unhealthy",
    resource: workload,
  }

  out.state = "ready"

  // See `https://github.com/kubernetes/kubernetes/blob/master/pkg/kubectl/rollout_status.go` for a reference
  // for this logic.
  if (workload.metadata.generation! > workload.status!.observedGeneration!) {
    out.lastMessage = `Waiting for spec update to be observed...`
    out.state = "deploying"
  } else if (workload.kind === "DaemonSet") {
    const status = <V1DaemonSetStatus>workload.status

    const desired = status.desiredNumberScheduled || 0
    const updated = status.updatedNumberScheduled || 0
    const available = status.numberAvailable || 0

    if (updated < desired) {
      out.lastMessage = `Waiting for rollout: ${updated} out of ${desired} new pods updated...`
      out.state = "deploying"
    } else if (available < desired) {
      out.lastMessage = `Waiting for rollout: ${available} out of ${desired} updated pods available...`
      out.state = "deploying"
    }
  } else if (workload.kind === "StatefulSet") {
    const status = <V1StatefulSetStatus>workload.status
    const workloadSpec = <Required<V1StatefulSetSpec>>workload.spec

    const replicas = status.replicas || 0
    const updated = status.updatedReplicas || 0
    const ready = status.readyReplicas || 0

    if (replicas && ready < replicas) {
      out.lastMessage = `Waiting for rollout: ${ready} out of ${replicas} new pods updated...`
      out.state = "deploying"
    } else if (workloadSpec.updateStrategy.type === "RollingUpdate" && workloadSpec.updateStrategy.rollingUpdate) {
      if (replicas && workloadSpec.updateStrategy.rollingUpdate.partition) {
        const desired = replicas - workloadSpec.updateStrategy.rollingUpdate.partition
        if (updated < desired) {
          out.lastMessage = `Waiting for partitioned roll out to finish: ${updated} out of ${desired} new pods have been updated...`
          out.state = "deploying"
        }
      }
    } else if (status.updateRevision !== status.currentRevision) {
      out.lastMessage = `Waiting for rolling update to complete...`
      out.state = "deploying"
    }
  } else {
    const status = <V1DeploymentStatus>workload.status

    const desired = status.replicas || 0
    const updated = status.updatedReplicas || 0
    const replicas = status.replicas || 0
    const available = status.availableReplicas || 0

    if (updated < desired) {
      out.lastMessage = `Waiting for rollout: ${updated} out of ${desired} new replicas updated...`
      out.state = "deploying"
    } else if (replicas > updated) {
      out.lastMessage = `Waiting for rollout: ${replicas - updated} old replicas pending termination...`
      out.state = "deploying"
    } else if (available < updated) {
      out.lastMessage = `Waiting for rollout: ${available} out of ${updated} updated replicas available...`
      out.state = "deploying"
    }
  }

  return out
}
