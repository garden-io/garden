/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { PluginCommand } from "../../../plugin/command.js"
import { dedent } from "../../../util/string.js"
import { gardenAnnotationKey, validateAnnotation } from "../../../util/annotations.js"
import { KubeApi } from "../api.js"
import minimist from "minimist"
import { CloudApiError } from "../../../exceptions.js"
import { sleep } from "../../../util/util.js"
import { styles } from "../../../logger/styles.js"
import type { Log } from "../../../logger/log-entry.js"
import type { AecStatus, AecTrigger, EnvironmentAecConfig } from "../../../config/aec.js"
import { aecConfigSchema, describeTrigger, matchAecTriggers } from "../../../config/aec.js"
import { validateSchema } from "../../../config/validation.js"
import { getAnnotationsForPausedWorkload } from "../aec.js"
import type { V1Namespace } from "@kubernetes/client-node"

const defaultCleanupInterval = 60000
const recycleAfterMinutes = 60 * 24 // 24 hours

export const aecAgentCommand: PluginCommand = {
  name: "aec-agent",
  description: dedent`
    [INTERNAL]

    Starts the AEC agent service, meant to run inside a Kubernetes cluster Pod.
  `,
  title: `[INTERNAL] Start the AEC agent service`,
  resolveGraph: false,
  hidden: true,

  handler: async ({ ctx, log, args, garden }) => {
    const result = {}
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = k8sCtx.provider

    const opts = minimist(args, {
      string: ["interval"],
    })

    let interval = defaultCleanupInterval

    if (opts["interval"]) {
      try {
        interval = parseInt(opts["interval"], 10)
      } catch (e) {
        log.error({ msg: `Invalid interval: ${opts["interval"]}` })
        return { result }
      }
    }

    const api = await KubeApi.factory(log, ctx, provider)

    // TODO: Deduplicate this with the setup-aec command
    const cloudApi = garden.cloudApiV2

    if (!cloudApi) {
      if (garden.cloudApi) {
        throw new CloudApiError({
          message:
            "You must be logged in to app.garden.io to use this command. Single-tenant Garden Enterprise is currently not supported.",
        })
      }

      throw new CloudApiError({
        message:
          "You must be logged in to Garden Cloud and have admin access to your project's organization to use this command.",
      })
    }

    const organization = await cloudApi.getOrganization()

    if (organization.plan === "free") {
      throw new CloudApiError({
        message: `Your organization (${organization.name}) is on the Free plan. The AEC feature is currentlyonly available on paid plans. Please upgrade your organization to continue.`,
      })
    }

    const account = await cloudApi.getCurrentAccount()

    // Note: This shouldn't happen
    if (!account) {
      throw new CloudApiError({
        message: "You must be logged in to Garden Cloud to use this command.",
      })
    }

    const startTime = new Date()
    let lastLoopStart = startTime

    while (true) {
      const now = new Date()
      lastLoopStart = now

      const exit = await cleanupLoop({ log, ctx, api, lastLoopStart, currentTime: now })
      const timeSinceStart = now.getTime() - startTime.getTime()
      const minutesSinceStart = timeSinceStart / 60000

      if (minutesSinceStart > recycleAfterMinutes) {
        log.info({
          msg: styles.warning(`AEC agent service stopping to recycle after ${minutesSinceStart} minutes`),
        })
        break
      }

      if (exit) {
        break
      }
      await sleep(interval)
    }

    log.info({ msg: styles.warning("AEC agent service stopped") })

    return { result }
  },
}

async function cleanupLoop({
  log,
  api,
  lastLoopStart,
  currentTime,
}: {
  log: Log
  ctx: KubernetesPluginContext
  api: KubeApi
  lastLoopStart: Date
  currentTime: Date
}) {
  log.info({ msg: "Checking namespaces..." })

  // TODO: Send heartbeat to Cloud

  const allNamespaces = await api.core.listNamespace()

  await Promise.all(
    allNamespaces.items.map(async (ns) => {
      await checkAndCleanupNamespace({
        log: log.createLog({ origin: ns.metadata?.name || "<unknown>" }),
        api,
        namespace: ns,
        lastLoopStart,
        currentTime,
      })
    })
  )

  // TODO: Send results to Cloud (either at end of loop or for each namespace)

  return false
}

interface CheckAndCleanupResult {
  namespace: V1Namespace
  aecConfigured?: boolean
  aecStatus?: AecStatus
  lastDeployed?: Date
  aecConfigParsed?: EnvironmentAecConfig
  matchedTriggers?: AecTrigger[]
  error?: string
  inProgress?: boolean
  paused?: boolean
  deleted?: boolean
}

export async function checkAndCleanupNamespace({
  log,
  api,
  namespace,
  lastLoopStart,
  currentTime,
  dryRun,
}: {
  log: Log
  api: KubeApi
  namespace: V1Namespace
  lastLoopStart: Date
  currentTime: Date
  dryRun?: boolean
}): Promise<CheckAndCleanupResult> {
  const namespaceName = namespace.metadata?.name

  if (!namespaceName) {
    // Should never happen, but just in case
    log.warn({ msg: `Namespace has no name, skipping` })
    return {
      namespace,
    }
  }

  const annotations = namespace.metadata?.annotations || {}

  const aecStatusAnnotation = annotations[gardenAnnotationKey("aec-status")]
  const aecConfigAnnotation = annotations[gardenAnnotationKey("aec-config")]
  const aecForceAnnotation = annotations[gardenAnnotationKey("aec-force")]
  const lastDeployedAnnotation = annotations[gardenAnnotationKey("last-deployed")]

  let aecConfigured = false
  let aecStatus: AecStatus = "none"
  let lastDeployed: Date | null = null
  let aecConfigParsed: EnvironmentAecConfig | null = null

  if (aecStatusAnnotation) {
    aecStatus = validateAnnotation("aec-status", aecStatusAnnotation)
  }

  if (aecConfigAnnotation) {
    try {
      aecConfigParsed = JSON.parse(aecConfigAnnotation)
    } catch (e) {
      const msg = `Invalid AEC config on namespace ${namespaceName} - Could not parse JSON: ${e}`
      log.error({ msg })
      return {
        namespace,
        error: msg,
      }
    }

    try {
      validateSchema(aecConfigParsed, aecConfigSchema())
    } catch (e) {
      const msg = `Invalid AEC config on namespace ${namespaceName}: ${e}`
      log.error({ msg })
      return {
        namespace,
        error: msg,
      }
    }

    if (!aecConfigParsed?.disabled && aecConfigParsed?.triggers?.length && aecConfigParsed.triggers.length > 0) {
      aecConfigured = true
    }
  }

  if (lastDeployedAnnotation) {
    try {
      lastDeployed = new Date(lastDeployedAnnotation)
    } catch (e) {
      const msg = `Invalid last-deployed annotation on namespace ${namespaceName} - Could not parse date: ${e}`
      log.error({ msg })
      return {
        namespace,
        aecConfigured,
        error: msg,
      }
    }
  }

  const now = new Date()

  const stringStatus: string[] = []

  if (aecConfigured) {
    if (aecConfigParsed?.disabled) {
      stringStatus.push("AEC configured but disabled")
    } else if (aecConfigParsed?.triggers.length === 0) {
      stringStatus.push("AEC enabled but no triggers configured")
    } else {
      stringStatus.push("AEC enabled")
    }
  } else {
    stringStatus.push("AEC not configured")
  }

  if (aecStatus === "paused") {
    stringStatus.push("Workloads paused")
  }

  if (lastDeployed) {
    // Log time since last deployed in HH:MM:SS format
    // TODO: Use date-fns or similar to format the time
    const timeSinceLastDeployed = now.getTime() - lastDeployed.getTime()
    const hours = Math.floor(timeSinceLastDeployed / 3600000)
    const minutes = Math.floor((timeSinceLastDeployed % 3600000) / 60000)
    const seconds = Math.floor((timeSinceLastDeployed % 60000) / 1000)
    stringStatus.push(`Last deployed ${hours}:${minutes}:${seconds} ago`)
  }

  log.info({ msg: `${stringStatus.join(" | ")}` })

  if (aecForceAnnotation) {
    log.info({ msg: `AEC force triggered: ${aecForceAnnotation}` })
    if (!aecConfigured) {
      const msg = `AEC force triggered but AEC not configured, skipping`
      log.info({ msg })
      return {
        namespace,
        aecConfigured,
        error: msg,
      }
    }
  }

  if (!aecConfigParsed) {
    // Already logged above
    return {
      namespace,
      aecConfigured: false,
      aecStatus,
    }
  }

  if (!lastDeployed) {
    const msg = `No last-deployed annotation, skipping`
    log.warn({ msg })
    return {
      namespace,
      aecConfigured,
      aecStatus,
      aecConfigParsed,
      error: msg,
    }
  }

  if (aecStatus === "in-progress") {
    const msg = `Cleanup already in progress, skipping`
    log.info({ msg })
    return {
      namespace,
      aecConfigured,
      inProgress: true,
      aecStatus,
      lastDeployed,
      aecConfigParsed,
      error: msg,
    }
  }

  // See which triggers are matched
  const matchedTriggers = matchAecTriggers({
    config: aecConfigParsed,
    lastDeployed,
    scheduleWindowStart: lastLoopStart,
    currentTime,
  })
  const lastMatchedTrigger = matchedTriggers[matchedTriggers.length - 1]

  // If no triggers are matched, skip
  if (matchedTriggers.length === 0) {
    const msg = `No triggers matched, nothing to do`
    log.info({ msg })
    return {
      namespace,
      aecConfigured,
      aecStatus,
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      error: msg,
    }
  } else if (matchedTriggers.length === 1) {
    log.info({ msg: `Matched trigger: ${describeTrigger(lastMatchedTrigger)}` })
  } else {
    log.info({
      msg: `Matched ${matchedTriggers.length} triggers. Last trigger matched: ${describeTrigger(lastMatchedTrigger)}`,
    })
  }

  // Pick last matched trigger
  const action = lastMatchedTrigger.action

  if (action === "pause") {
    if (aecStatus === "paused") {
      log.info({ msg: `Workloads already paused, nothing to do` })
      return {
        namespace,
        aecConfigured,
        aecStatus,
        lastDeployed,
        aecConfigParsed,
        matchedTriggers,
      }
    }

    log.info({ msg: `Pausing workloads...` })

    // Make aec-status "in-progress"
    if (!dryRun) {
      await api.core.patchNamespace({
        name: namespaceName,
        body: {
          metadata: {
            annotations: {
              [gardenAnnotationKey("aec-status")]: "in-progress",
            },
          },
        },
      })
    }

    if (!dryRun) {
      await pauseWorkloadsInNamespace({ log, api, namespaceName })
    }

    log.info({ msg: `Workloads paused` })

    if (!dryRun) {
      namespace = await api.core.patchNamespace({
        name: namespaceName,
        body: {
          metadata: {
            annotations: {
              // TODO: Make status more elaborate, include the trigger that matched and the time it was updated
              [gardenAnnotationKey("aec-status")]: "paused",
            },
          },
        },
      })
    }

    return {
      namespace,
      aecConfigured,
      aecStatus: "paused",
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      paused: true,
    }
  } else {
    log.info({ msg: `Cleaning up namespace` })

    if (!dryRun) {
      await api.core.deleteNamespace({ name: namespaceName })
    }

    // TODO: Monitor the namespace deletion and wait for it to complete (on a timeout, no need to block the loop)
    return {
      namespace,
      aecConfigured,
      aecStatus,
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      deleted: true,
    }
  }
}

export async function pauseWorkloadsInNamespace({
  log,
  api,
  namespaceName,
}: {
  log: Log
  api: KubeApi
  namespaceName: string
}) {
  const deployments = await api.apps.listNamespacedDeployment({ namespace: namespaceName })
  const statefulSets = await api.apps.listNamespacedStatefulSet({ namespace: namespaceName })
  const replicaSets = (await api.apps.listNamespacedReplicaSet({ namespace: namespaceName })).items.filter(
    // Filter out replica sets that are owned by other resources, e.g. by a StatefulSet or Deployment
    (r) => !r.metadata.ownerReferences || r.metadata.ownerReferences.length === 0
  )
  const pods = (await api.core.listNamespacedPod({ namespace: namespaceName })).items.filter(
    // Filter out pods that are owned by other resources, e.g. by a ReplicaSet or StatefulSet
    (p) => !p.metadata.ownerReferences || p.metadata.ownerReferences.length === 0
  )
  // TODO: Also remove daemonsets?
  // TODO: Filter on workloads that are deployed by Garden?

  // TODO: Do this in parallel and deduplicate some of the code
  log.info({
    msg: `Pausing ${deployments.items.length} Deployment(s): ${deployments.items
      .map((d) => d.metadata.name)
      .join(", ")}`,
  })
  await Promise.all(
    deployments.items.map(async (deployment) => {
      log.verbose({ msg: `Scaling down Deployment ${deployment.metadata.name}` })
      await api.apps.patchNamespacedDeployment({
        name: deployment.metadata.name,
        namespace: namespaceName,
        body: {
          metadata: {
            annotations: getAnnotationsForPausedWorkload(deployment),
          },
          spec: {
            replicas: 0,
          },
        },
      })
    })
  )

  log.info({
    msg: `Pausing ${statefulSets.items.length} StatefulSet(s): ${statefulSets.items
      .map((s) => s.metadata.name)
      .join(", ")}`,
  })
  await Promise.all(
    statefulSets.items.map(async (statefulSet) => {
      log.verbose({ msg: `Scaling down StatefulSet ${statefulSet.metadata.name}` })
      await api.apps.patchNamespacedStatefulSet({
        name: statefulSet.metadata.name,
        namespace: namespaceName,
        body: {
          metadata: {
            annotations: getAnnotationsForPausedWorkload(statefulSet),
          },
          spec: {
            replicas: 0,
          },
        },
      })
    })
  )

  log.info({
    msg: `Pausing ${replicaSets.length} ReplicaSets: ${replicaSets.map((r) => r.metadata.name).join(", ")}`,
  })
  await Promise.all(
    replicaSets.map(async (replicaSet) => {
      log.verbose({ msg: `Scaling down ReplicaSet ${replicaSet.metadata.name}` })
      await api.apps.patchNamespacedReplicaSet({
        name: replicaSet.metadata.name,
        namespace: namespaceName,
        body: {
          metadata: {
            annotations: getAnnotationsForPausedWorkload(replicaSet),
          },
          spec: {
            replicas: 0,
          },
        },
      })
    })
  )

  log.info({
    msg: `Removing ${pods.length} standalone Pod(s): ${pods.map((p) => p.metadata.name).join(", ")}`,
  })
  await Promise.all(
    pods.map(async (pod) => {
      log.verbose({ msg: `Removing pod ${pod.metadata.name}` })
      await api.core.deleteNamespacedPod({ name: pod.metadata.name, namespace: namespaceName })
    })
  )
}
