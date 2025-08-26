/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesConfig, KubernetesPluginContext } from "../config.js"
import type { PluginCommand, PluginCommandParams } from "../../../plugin/command.js"
import { dedent } from "../../../util/string.js"
import { gardenAnnotationKey, validateAnnotation } from "../../../util/annotations.js"
import { KubeApi } from "../api.js"
import minimist from "minimist"
import { CloudApiError, ParameterError } from "../../../exceptions.js"
import { sleep } from "../../../util/util.js"
import { styles } from "../../../logger/styles.js"
import type { Log } from "../../../logger/log-entry.js"
import type { AecAction, AecAgentInfo, AecStatus, AecTrigger, EnvironmentAecConfig } from "../../../config/aec.js"
import { aecConfigSchema, describeTrigger, matchAecTriggers } from "../../../config/aec.js"
import { validateSchema } from "../../../config/validation.js"
import { getAnnotationsForPausedWorkload } from "../aec.js"
import type { V1Namespace } from "@kubernetes/client-node"
import type { EventBus } from "../../../events/events.js"
import { createServer } from "http"
import { formatDistanceToNow } from "date-fns"

const defaultCleanupInterval = 60000
const defaultTtlSeconds = 60 * 60 * 24 // 24 hours
export const aecAgentHealthCheckPort = 8999

export const aecAgentCommand: PluginCommand = {
  name: "aec-agent",
  description: dedent`
    [INTERNAL]

    Starts the AEC agent service, meant to run inside a Kubernetes cluster Pod.
  `,
  title: `[INTERNAL] Start the AEC agent service`,
  resolveGraph: false,
  hidden: true,

  handler: async (params) => {
    const { log } = params
    log.info({ msg: "Starting AEC agent service" })
    try {
      const result = await handler(params)
      params.garden.events.emit("aecAgentStatus", {
        aecAgentInfo: {
          pluginName: params.ctx.provider.name,
          environmentType: params.ctx.environmentName,
          description: params.args["description"],
        },
        status: "stopped",
        statusDescription: "Exiting gracefully",
      })
      return result
    } catch (e) {
      // Catch unexpected errors and emit event to Cloud
      params.garden.events.emit("aecAgentStatus", {
        aecAgentInfo: {
          pluginName: params.ctx.provider.name,
          environmentType: params.ctx.environmentName,
          description: params.args["description"],
        },
        status: "error",
        statusDescription: String(e),
      })

      throw e
    }
  },
}

async function handler({ ctx, log, args, garden }: PluginCommandParams<KubernetesConfig>) {
  const result = {}
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const opts = minimist(args, {
    string: ["interval", "ttl", "description", "health-check-port"],
    boolean: ["dry-run"],
  })

  if (!opts["description"]) {
    throw new ParameterError({
      message: "--description is required",
    })
  }

  const aecAgentInfo: AecAgentInfo = {
    pluginName: provider.name,
    environmentType: ctx.environmentName,
    description: opts["description"],
  }

  log.info({ msg: `AEC agent info: ${JSON.stringify(aecAgentInfo)}` })

  const dryRun = !!opts["dry-run"]
  log.info({ msg: `Dry run: ${dryRun}` })

  for (const key of ["interval", "ttl", "health-check-port"]) {
    if (opts[key]) {
      try {
        opts[key] = parseInt(opts[key], 10) * 1000
      } catch (e) {
        log.error({ msg: `Invalid ${key}: ${opts[key]}` })
        return { result }
      }
    }
  }

  const healthCheckPort = opts["health-check-port"] ?? aecAgentHealthCheckPort
  if (healthCheckPort <= 0) {
    log.info({ msg: `Health check port is disabled` })
  }

  const interval = opts["interval"] ?? defaultCleanupInterval
  log.info({ msg: `Interval: ${interval}` })
  // Set to 0 to have the command exit after the first loop
  const ttl = opts["ttl"] ?? defaultTtlSeconds
  log.info({ msg: `TTL: ${ttl}` })

  const api = await KubeApi.factory(log, ctx, provider)
  log.info({ msg: `Kubernetes API initialized` })

  // TODO: Deduplicate this with the setup-aec command
  const cloudApi = garden.cloudApiV2

  if (!cloudApi) {
    if (garden.cloudApi) {
      log.error({ msg: `Using legacy Cloud API` })
      throw new CloudApiError({
        message:
          "You must be logged in to app.garden.io to use this command. Single-tenant Garden Enterprise is currently not supported.",
      })
    }

    log.error({ msg: `No Cloud API initialized` })
    throw new CloudApiError({
      message: "A valid Cloud API access token for app.garden.io is required to use this command.",
    })
  }

  log.info({ msg: `Connecting to Garden Cloud (${cloudApi.domain})...` })

  const organization = await cloudApi.getOrganization()

  log.info({ msg: `Organization: ${organization.name} (${organization.id})` })

  const account = await cloudApi.getCurrentAccount()

  // Note: This shouldn't happen
  if (!account) {
    throw new CloudApiError({
      message: "You must be logged in to Garden Cloud to use this command.",
    })
  }

  const startTime = new Date()
  let lastLoopStart = startTime

  garden.events.emit("aecAgentStatus", {
    aecAgentInfo,
    status: "running",
    statusDescription: "AEC agent service started",
  })

  // Start a simple HTTP server for health checks
  if (healthCheckPort > 0) {
    log.info({ msg: `Health check server port: ${aecAgentHealthCheckPort}` })
    const server = createServer((_req, res) => {
      res.end("OK")
    })
    server
      .listen(aecAgentHealthCheckPort, () => {
        log.info({ msg: "Health check server started" })
      })
      .on("error", (err) => {
        log.error({ msg: `Health check server error: ${err}` })
        throw err
      })
  }

  while (true) {
    const now = new Date()
    lastLoopStart = now

    const exit = await cleanupLoop({
      log,
      ctx,
      api,
      lastLoopStart,
      currentTime: now,
      dryRun,
      aecAgentInfo,
      events: garden.events,
    })
    const timeSinceStart = now.getTime() - startTime.getTime()
    const secondsSinceStart = timeSinceStart / 1000

    if (secondsSinceStart > ttl) {
      const msg = `AEC agent service stopping to recycle after ${secondsSinceStart} seconds`
      log.info({
        msg: styles.warning(msg),
      })
      // Note: A stopped status is emitted after returning
      garden.events.emit("aecAgentStatus", {
        aecAgentInfo,
        status: "running",
        statusDescription: msg,
      })
      break
    }

    if (exit) {
      log.info({ msg: "Exiting cleanup loop" })
      break
    }
    log.debug({ msg: `Sleeping for ${interval}ms` })
    await sleep(interval)
  }

  log.info({ msg: styles.warning("AEC agent service stopped") })

  return { result }
}

async function cleanupLoop({
  log,
  api,
  lastLoopStart,
  currentTime,
  dryRun,
  aecAgentInfo,
  events,
}: {
  log: Log
  ctx: KubernetesPluginContext
  api: KubeApi
  lastLoopStart: Date
  currentTime: Date
  dryRun?: boolean
  aecAgentInfo: AecAgentInfo
  events: EventBus
}) {
  log.info({ msg: "Checking namespaces..." })

  // Send heartbeat to Cloud
  events.emit("aecAgentStatus", {
    aecAgentInfo,
    status: "running",
    statusDescription: "Checking namespaces...",
  })

  const allNamespaces = await api.core.listNamespace()

  await Promise.all(
    allNamespaces.items.map(async (ns) => {
      const namespaceName = ns.metadata?.name || "<unknown>"
      const nsLog = log.createLog({ origin: namespaceName })
      const environmentType = ns.metadata?.annotations?.[gardenAnnotationKey("environment-type")]
      const environmentName = ns.metadata?.annotations?.[gardenAnnotationKey("environment-name")]

      if (!environmentType || !environmentName) {
        const msg = `Missing environment type and/or name annotation, skipping`
        nsLog.warn({ msg })
        events.emit("aecAgentEnvironmentUpdate", {
          aecAgentInfo,
          environmentType: environmentType || "<missing>",
          environmentName: environmentName || "<missing>",
          statusDescription: msg,
          inProgress: false,
          error: true,
          success: false,
        })
        return
      }

      try {
        const result = await checkAndCleanupNamespace({
          log: nsLog,
          api,
          namespace: ns,
          lastLoopStart,
          currentTime,
          dryRun,
          aecAgentInfo,
          events,
          environmentType,
          environmentName,
        })

        // Skip sending events if the namespace is not configured for AEC
        if (result.aecConfigured) {
          events.emit("aecAgentEnvironmentUpdate", {
            aecAgentInfo,
            environmentType,
            environmentName,
            statusDescription: result.status,
            lastDeployed: result.lastDeployed?.toISOString(),
            matchedTriggers: result.matchedTriggers,
            actionTriggered: result.actionTriggered,
            inProgress: result.inProgress ?? false,
            error: result.error ?? false,
            success: result.success ?? false,
          })
        }
      } catch (e) {
        const msg = `Unexpected error: ${e}`
        nsLog.error({ msg })
        events.emit("aecAgentEnvironmentUpdate", {
          aecAgentInfo,
          environmentType,
          environmentName,
          statusDescription: msg,
          inProgress: false,
          error: true,
          success: false,
        })
      }
    })
  )

  return false
}

interface CheckAndCleanupResult {
  namespace: V1Namespace
  status: string
  aecConfigured?: boolean
  aecStatus?: AecStatus
  lastDeployed?: Date
  aecConfigParsed?: EnvironmentAecConfig
  matchedTriggers?: AecTrigger[]
  actionTriggered?: AecAction
  success?: boolean
  error?: boolean
  inProgress?: boolean
}

export async function checkAndCleanupNamespace({
  log,
  api,
  namespace,
  lastLoopStart,
  currentTime,
  dryRun,
  aecAgentInfo,
  events,
  environmentType,
  environmentName,
}: {
  log: Log
  api: KubeApi
  namespace: V1Namespace
  lastLoopStart: Date
  currentTime: Date
  dryRun?: boolean
  aecAgentInfo: AecAgentInfo
  events: EventBus
  environmentType: string
  environmentName: string
}): Promise<CheckAndCleanupResult> {
  const namespaceName = namespace.metadata?.name

  if (!namespaceName) {
    // Should never happen, but just in case
    const msg = `Namespace has no name, skipping`
    log.warn({ msg })
    return {
      namespace,
      status: msg,
    }
  }

  const annotations = namespace.metadata?.annotations || {}

  const aecStatusAnnotation = annotations[gardenAnnotationKey("aec-status")]
  const aecConfigAnnotation = annotations[gardenAnnotationKey("aec-config")]
  const aecForceAnnotation = annotations[gardenAnnotationKey("aec-force")]
  const lastDeployedAnnotation = annotations[gardenAnnotationKey("last-deployed")]
  const aecInProgressAnnotation = annotations[gardenAnnotationKey("aec-in-progress")]

  let aecStatus: AecStatus = "none"
  let lastDeployed: Date | null = null
  let aecConfigParsed: EnvironmentAecConfig | null = null
  let aecInProgress: Date | null = null

  if (aecStatusAnnotation) {
    const result = validateAnnotation("aec-status", aecStatusAnnotation)

    if (result.error) {
      const msg = `Invalid AEC status annotation: ${result.error}`
      log.error({ msg })
      return {
        namespace,
        status: msg,
        error: true,
      }
    }

    aecStatus = result.data
  }

  if (aecConfigAnnotation) {
    try {
      aecConfigParsed = JSON.parse(aecConfigAnnotation)
    } catch (e) {
      const msg = `Invalid AEC config - Could not parse JSON: ${e}`
      log.error({ msg })
      return {
        namespace,
        status: msg,
        error: true,
      }
    }

    try {
      aecConfigParsed = validateSchema(aecConfigParsed, aecConfigSchema())
    } catch (e) {
      const msg = `Invalid AEC config: ${e}`
      log.error({ msg })
      return {
        namespace,
        status: msg,
        error: true,
      }
    }
  }

  if (lastDeployedAnnotation) {
    const result = validateAnnotation("last-deployed", lastDeployedAnnotation)

    if (result.error) {
      const msg = `Invalid last-deployed annotation: ${result.error}`
      log.error({ msg })
      return {
        namespace,
        status: msg,
        error: true,
      }
    }

    lastDeployed = new Date(result.data)
  }

  if (aecInProgressAnnotation) {
    const result = validateAnnotation("aec-in-progress", aecInProgressAnnotation)

    if (result.error) {
      const msg = `Invalid AEC in-progress annotation: ${result.error}`
      log.error({ msg })
      return {
        namespace,
        status: msg,
        error: true,
      }
    }

    aecInProgress = new Date(result.data)
  }

  const stringStatus: string[] = []
  const status = () => stringStatus.join(" | ")

  if (aecConfigParsed) {
    if (aecConfigParsed.disabled) {
      stringStatus.push("AEC configured but disabled")
    } else if (aecConfigParsed.triggers.length === 0) {
      stringStatus.push("AEC enabled but no triggers configured")
      return {
        namespace,
        aecConfigured: true,
        status: status(),
        error: true,
      }
    } else {
      stringStatus.push("AEC enabled")
    }
  } else {
    stringStatus.push("AEC not configured")
  }

  if (aecStatus === "paused") {
    stringStatus.push("Workloads paused")
  }

  stringStatus.push(`Status: ${aecStatus}`)

  if (lastDeployed) {
    // Log time since last deployed
    stringStatus.push(`Last deployed ${formatDistanceToNow(lastDeployed)} ago`)
  } else {
    stringStatus.push("No last-deployed annotation")
  }

  log.info({ msg: status() })

  if (aecForceAnnotation === "true") {
    log.info({ msg: `AEC force triggered: ${aecForceAnnotation}` })
    if (!aecConfigParsed) {
      const msg = `AEC force triggered but AEC not configured, skipping`
      log.info({ msg })
      return {
        namespace,
        aecConfigured: false,
        status: msg,
        error: true,
      }
    }
  }

  if (!aecConfigParsed) {
    // Already logged above
    return {
      namespace,
      aecConfigured: false,
      aecStatus,
      status: status(),
    }
  }

  if (aecConfigParsed && aecConfigParsed.disabled) {
    // Already logged above
    return {
      namespace,
      aecConfigured: true,
      aecStatus,
      status: status(),
    }
  }

  if (!lastDeployed) {
    const msg = `No last-deployed annotation, skipping`
    log.warn({ msg })
    return {
      namespace,
      aecConfigured: true,
      aecStatus,
      aecConfigParsed,
      status: status(),
    }
  }

  if (aecInProgress) {
    const msg = `Cleanup already in progress, skipping`
    log.info({ msg })
    return {
      namespace,
      aecConfigured: true,
      inProgress: true,
      aecStatus,
      lastDeployed,
      aecConfigParsed,
      status: status(),
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
    stringStatus.push(msg)
    log.info({ msg })
    return {
      namespace,
      aecConfigured: true,
      aecStatus,
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      status: status(),
    }
  } else if (matchedTriggers.length === 1) {
    const msg = `Matched trigger: ${describeTrigger(lastMatchedTrigger)}`
    stringStatus.push(msg)
    log.info({ msg })
  } else {
    const msg = `Matched ${matchedTriggers.length} triggers. Last trigger matched: ${describeTrigger(lastMatchedTrigger)}`
    stringStatus.push(msg)
    log.info({ msg })
  }

  // Pick last matched trigger
  const action = lastMatchedTrigger.action

  if (action === "pause") {
    if (aecStatus === "paused") {
      log.info({ msg: `Workloads already paused, nothing to do` })
      return {
        namespace,
        aecConfigured: true,
        aecStatus,
        lastDeployed,
        aecConfigParsed,
        matchedTriggers,
        status: status(),
      }
    }

    log.info({ msg: `Pausing workloads...` })

    if (!dryRun) {
      events.emit("aecAgentEnvironmentUpdate", {
        aecAgentInfo,
        environmentType,
        environmentName,
        lastDeployed: lastDeployed?.toISOString(),
        matchedTriggers,
        actionTriggered: "pause",
        statusDescription: "Pausing workloads...",
        inProgress: true,
        error: false,
      })

      // Make aec-status "in-progress" on namespace
      namespace = await markNamespaceAsInProgress({ api, namespaceName })

      await pauseWorkloadsInNamespace({ log, api, namespaceName })

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

    const msg = `Workloads paused`
    log.info({ msg })
    stringStatus.push(msg)

    return {
      namespace,
      aecConfigured: true,
      aecStatus: "paused",
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      actionTriggered: "pause",
      status: status(),
    }
  } else {
    log.info({ msg: `Cleaning up namespace` })

    if (!dryRun) {
      events.emit("aecAgentEnvironmentUpdate", {
        aecAgentInfo,
        environmentType,
        environmentName,
        actionTriggered: "cleanup",
        statusDescription: "Cleaning up namespace...",
        inProgress: true,
        error: false,
      })
      // Make aec-status "in-progress" on namespace before deleting, to avoid confusion in following loops, because deleting a namespace can take a while
      namespace = await markNamespaceAsInProgress({ api, namespaceName })
      await api.core.deleteNamespace({ name: namespaceName })
    }

    stringStatus.push("Namespace deleted")

    // TODO: Monitor the namespace deletion and wait for it to complete (on a timeout, no need to block the loop)
    return {
      namespace,
      aecConfigured: true,
      aecStatus: "cleaned-up",
      lastDeployed,
      aecConfigParsed,
      matchedTriggers,
      actionTriggered: "cleanup",
      status: status(),
    }
  }
}

async function markNamespaceAsInProgress({ api, namespaceName }: { api: KubeApi; namespaceName: string }) {
  return await api.core.patchNamespace({
    name: namespaceName,
    body: {
      metadata: {
        annotations: {
          [gardenAnnotationKey("aec-in-progress")]: new Date().toISOString(),
        },
      },
    },
  })
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
  if (deployments.items.length > 0) {
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
  }

  if (statefulSets.items.length > 0) {
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
  }

  if (replicaSets.length > 0) {
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
  }

  if (pods.length > 0) {
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
}
