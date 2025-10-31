/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { checkResourceStatuses, waitForResources } from "../status/status.js"
import { helm } from "./helm-cli.js"
import type { HelmGardenMetadataConfigMapData } from "./common.js"
import { filterManifests, getReleaseName, getValueArgs, prepareManifests, prepareTemplates } from "./common.js"
import {
  gardenCloudAECPauseAnnotation,
  getResourcesPausedByAEC,
  getReleaseStatus,
  getRenderedResources,
} from "./status.js"
import { apply, deleteResources } from "../kubectl.js"
import type { KubernetesPluginContext } from "../config.js"
import { getForwardablePorts, killPortForwards } from "../port-forward.js"
import { getActionNamespace, getActionNamespaceStatus, updateNamespaceAecAnnotations } from "../namespace.js"
import { configureSyncMode } from "../sync.js"
import { KubeApi } from "../api.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { HelmDeployAction, HelmDeployConfig } from "./config.js"
import { isEmpty } from "lodash-es"
import { getK8sIngresses } from "../status/ingress.js"
import { toGardenError } from "../../../exceptions.js"
import { getNamespacedResourceKey, isWorkload, upsertConfigMap } from "../util.js"
import type { KubernetesResource, KubernetesWorkload, SyncableResource } from "../types.js"
import { isTruthy, sleep } from "../../../util/util.js"
import { styles } from "../../../logger/styles.js"
import type { ActionLog } from "../../../logger/log-entry.js"
import type { ResolvedDeployAction } from "../../../actions/deploy.js"

type WrappedInstallError = { source: "helm" | "waitForResources"; error: unknown }

function isWrappedInstallError(error: unknown): error is WrappedInstallError {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    "source" in error &&
    (error.source === "helm" || error.source === "waitForResources")
  )
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return typeof error === "object" && error !== null && "message" in error
}

async function getUnhealthyResourceLogs({
  namespace,
  log,
  manifests,
  api,
}: {
  namespace: string
  log: ActionLog
  manifests: KubernetesResource[]
  api: KubeApi
}): Promise<string | null> {
  const unhealthyResources = (
    await checkResourceStatuses({ api, namespace, waitForJobs: false, manifests, log })
  ).filter((r) => r.state === "unhealthy")
  const logsArr = unhealthyResources.map((r) => r.logs).filter(isTruthy)

  if (logsArr.length === 0) {
    return null
  }

  return logsArr.join("\n\n")
}

export const helmDeploy: DeployActionHandler<"deploy", HelmDeployAction> = async (params) => {
  const { ctx, action, log, force } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const spec = action.getSpec()
  const attached = false

  const api = await KubeApi.factory(log, ctx, provider)

  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const namespace = namespaceStatus.namespaceName
  const preparedTemplates = await prepareTemplates({
    ctx: k8sCtx,
    action,
    log,
  })
  const { reference } = preparedTemplates
  const releaseName = getReleaseName(action)
  const releaseStatus = await getReleaseStatus({ ctx: k8sCtx, action, releaseName, log })

  const timeout = action.getConfig("timeout")
  const commonArgs = [
    "--wait",
    "--namespace",
    namespace,
    "--timeout",
    timeout.toString(10) + "s",
    ...(await getValueArgs({ action, valuesPath: preparedTemplates.valuesPath })),
  ]

  if (spec.atomic) {
    // This options means that the chart gets purged if it fails to install
    commonArgs.push("--atomic")
  }

  let helmArgs: string[]
  const shouldInstall = releaseStatus.state === "missing"
  if (shouldInstall) {
    helmArgs = ["install", releaseName, ...reference, ...commonArgs]
    if (force && !ctx.production) {
      helmArgs.push("--replace")
    }
  } else {
    helmArgs = ["upgrade", releaseName, ...reference, "--install", ...commonArgs]
  }

  const preparedManifests = await prepareManifests({
    ctx: k8sCtx,
    log,
    action,
    ...preparedTemplates,
  })
  const manifests = await filterManifests(preparedManifests)

  // We never fail fast with --atomic
  const failFast = spec.atomic === false && spec.waitForUnhealthyResources === false
  let wrappedInstallError: unknown | null = null
  // This is basically an internal field that's only used for testing. Couldn't think of a better approach -E
  let helmCommandSuccessful = false

  log.debug(() => `${shouldInstall ? "Installing" : "Upgrading"} Helm release ${releaseName}`)
  if (failFast) {
    // In this case we use Garden's resource monitoring and fail fast if one of the resources being installed is unhealthy.
    log.silly(() => `Will fail fast if Helm resources are unhealthy`)
    const result = await deployWithEarlyFailureDetection({
      ctx: k8sCtx,
      log,
      helmArgs,
      action,
      api,
      namespace,
      manifests,
    })
    helmCommandSuccessful = result.helmCommandSuccessful
    wrappedInstallError = result.wrappedInstallError
  } else {
    // In this case we don't monitor the resources and simply let the Helm command run until completion
    log.silly(() => `Will not fail fast if Helm resources are unhealthy but wait for Helm to complete`)
    try {
      try {
        await helm({ ctx: k8sCtx, namespace, log, args: [...helmArgs], emitLogEvents: true })
        helmCommandSuccessful = true
      } catch (error) {
        throw { source: "helm", error }
      }
    } catch (err) {
      wrappedInstallError = err
    }
  }

  if (wrappedInstallError) {
    if (!isWrappedInstallError(wrappedInstallError)) {
      throw wrappedInstallError
    }

    const error = wrappedInstallError.error

    // If it's a direct Helm error we try get the logs and events for the resources and add them to the error message
    // unless --atomic=true because in that case the events and logs won't be available after the roll back.
    // If it's an error from the resource monitoring it will already contain the logs and events.
    if (wrappedInstallError.source === "helm" && !spec.atomic && isErrorWithMessage(error)) {
      const logs = await getUnhealthyResourceLogs({
        namespace,
        log,
        manifests,
        api,
      })
      error.message += styles.primary(
        `\n\nFound unhealthy resources for release ${styles.accent(releaseName)}. Below are Kubernetes events and (if applicable) Pod logs from the unhealthy resources.\n\n`
      )
      error.message += logs
    }

    throw error
  }

  try {
    const pausedResources = await getResourcesPausedByAEC({ ctx: k8sCtx, action, namespace, releaseName, log })
    await Promise.all(
      pausedResources.map((resource) => {
        const { annotations } = resource.metadata
        if (annotations) {
          delete annotations[gardenCloudAECPauseAnnotation]
          return api.annotateResource({ log, resource, annotations })
        }
        return
      })
    )
  } catch (error) {
    const errorMsg = `Failed to remove Garden Cloud AEC annotations for deploy: ${action.name}.`
    log.warn(errorMsg)
    log.debug({ error: toGardenError(error) })
  }

  // Create or upsert configmap with garden metadata
  const gardenMetadata: HelmGardenMetadataConfigMapData = {
    actionName: action.name,
    projectName: ctx.projectName,
    version: action.versionString(log),
    mode: action.mode(),
  }

  await upsertConfigMap({
    api,
    namespace,
    key: `garden-helm-metadata-${action.name}`,
    labels: {},
    data: gardenMetadata,
  })

  // Configure sync mode and wait for resources if needed
  await configureSyncModeAndWait({
    ctx: k8sCtx,
    log,
    provider,
    action,
    api,
    namespace,
    manifests,
    timeout,
  })

  // Update the namespace AEC annotations
  await updateNamespaceAecAnnotations({ ctx: k8sCtx, api, namespace, status: "none" })
  const statuses = await checkResourceStatuses({ api, namespace, waitForJobs: false, manifests, log })
  const forwardablePorts = getForwardablePorts({ resources: manifests, parentAction: action })

  // Make sure port forwards work after redeployment
  killPortForwards(action, forwardablePorts || [], log)

  // Get ingresses of deployed resources
  const ingresses = getK8sIngresses(manifests)

  return {
    state: "ready",
    detail: {
      forwardablePorts,
      state: "ready",
      version: action.versionString(log),
      ingresses,
      detail: { remoteResources: statuses.map((s) => s.resource), helmCommandSuccessful },
    },
    attached,
    // TODO-0.13.1
    outputs: {},
  }
}

export const deleteHelmDeploy: DeployActionHandler<"delete", HelmDeployAction> = async (params) => {
  const { ctx, log, action } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const releaseName = getReleaseName(action)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const resources = await getRenderedResources({ ctx: k8sCtx, action, releaseName, log })

  await helm({ ctx: k8sCtx, log, namespace, args: ["uninstall", releaseName], emitLogEvents: true })
  try {
    // remove configmap with garden metadata
    const api = await KubeApi.factory(log, ctx, provider)
    await api.core.deleteNamespacedConfigMap({ namespace, name: `garden-helm-metadata-${action.name}` })
  } catch (error) {
    log.warn(`Failed to remove configmap with garden metadata for deploy: ${action.name}.`)
  }
  // Wait for resources to terminate
  await deleteResources({ log, ctx, provider, resources, namespace })

  log.success("Service deleted")

  return { state: "not-ready", outputs: {}, detail: { state: "missing", detail: { remoteResources: [] } } }
}

async function deployWithEarlyFailureDetection({
  ctx,
  log,
  helmArgs,
  action,
  api,
  namespace,
  manifests,
}: {
  ctx: KubernetesPluginContext
  log: ActionLog
  helmArgs: string[]
  action: ResolvedDeployAction<HelmDeployConfig>
  api: KubeApi
  namespace: string
  manifests: KubernetesResource[]
}): Promise<{ helmCommandSuccessful: boolean; wrappedInstallError: WrappedInstallError | null }> {
  const previouslyUnhealthyResourcesMap = Object.fromEntries(
    (
      await checkResourceStatuses({
        api,
        namespace,
        waitForJobs: false,
        manifests,
        log,
      })
    )
      .filter((r) => r.state === "unhealthy")
      .map((r) => [getNamespacedResourceKey(r.resource), r])
  )

  const runHelm = async () => {
    try {
      await helm({ ctx, namespace, log, args: [...helmArgs], emitLogEvents: true })
    } catch (error) {
      throw { source: "helm", error }
    }
  }

  const helmPromise = runHelm()

  const detectearlyFailure = async () => {
    const manifestsForUnhealthyWorkloads: KubernetesWorkload[] = manifests
      .filter((m) => !!previouslyUnhealthyResourcesMap[getNamespacedResourceKey(m)])
      .filter(isWorkload)
    if (manifestsForUnhealthyWorkloads.length > 0) {
      const maxLoops = 5
      let currentLoop = 0
      log.verbose(
        `Waiting for API updates to be committed for previously unhealthy workloads (attempt ${currentLoop + 1}/${maxLoops}): ${manifestsForUnhealthyWorkloads
          .map((r) => `${r.kind}/${r.metadata.name}`)
          .join(", ")}`
      )
      // For each previously unhealthy workload that is changed in the manifests being deployed by the Helm chart,
      // we wait until the observedGeneration of the workload resource being deployed is greater than the
      // observedGeneration of the previously unhealthy workload resource (with a timeout of 10 seconds—if the API
      // resources haven't been updated then, there's no point waiting longer, since that indicates a problem with
      // the infra, in which case we should let the Helm deploy proceed to finish/fail normally).
      while (currentLoop < maxLoops) {
        try {
          const updatedStatuses = await checkResourceStatuses({
            api,
            namespace,
            waitForJobs: false,
            manifests: manifestsForUnhealthyWorkloads,
            log,
          })
          const allResourcesUpdated = updatedStatuses.every((s) => {
            const key = getNamespacedResourceKey(s.resource)
            const currentGeneration = s.resource.metadata.generation
            const previouslyUnhealthyResourceStatus = previouslyUnhealthyResourcesMap[key]
            const previousGeneration = previouslyUnhealthyResourceStatus.resource.metadata.generation

            // If there's no previous generation, this is a new resource being deployed for the first time.
            // In this case, we consider it "updated" if it has a generation (meaning it's been created).
            if (!previousGeneration) {
              return !!currentGeneration
            }

            // Otherwise, check that the generation has incremented
            return currentGeneration && currentGeneration > previousGeneration
          })
          if (allResourcesUpdated) {
            log.verbose(`All previously unhealthy resources have been updated (but not necessarily rolled out yet)`)
            break
          }
          await sleep(2_000)
          currentLoop++
        } catch (error) {
          log.warn(`Error while checking statuses of previously unhealthy resources: ${toGardenError(error).message}`)
          // If there's an error here, we just proceed to waiting for resources.
          break
        }
      }
      if (currentLoop === maxLoops) {
        log.warn(
          `Previously unhealthy resources did not update within expected timeframe (${maxLoops * 2} seconds): ${manifestsForUnhealthyWorkloads
            .map((r) => `${r.kind}/${r.metadata.name}`)
            .join(
              ", "
            )}. Infrastructure may be in an unusual state. Skipping early failure detection and letting Helm complete normally.`
        )
        // This is an unexpected outcome (the API server should usually update the resources quickly), so we don't try
        // to fail early and just let helm try to finish on its own (and don't proceed to waitForResources below).
        return
      }
    }

    try {
      await waitForResources({
        namespace,
        ctx,
        provider: ctx.provider,
        waitForJobs: false, // should we also add a waitForJobs option to the HelmDeployAction?
        logContext: action.key(),
        resources: manifests,
        log,
        timeoutSec: action.getConfig("timeout"),
      })
    } catch (error) {
      if (!isWrappedInstallError(error)) {
        throw error
      }
      throw { source: "waitForResources", error }
    }
  }

  // Wait for either the first error or Helm completion
  try {
    await Promise.race([
      // Wait for helm to complete
      helmPromise,
      // If either throws, this will reject
      Promise.all([helmPromise, detectearlyFailure()]),
    ])
  } catch (error) {
    if (!isWrappedInstallError(error)) {
      throw error
    }
    return { helmCommandSuccessful: false, wrappedInstallError: error }
  }
  return { helmCommandSuccessful: true, wrappedInstallError: null }
}

/**
 * Configure sync mode for Helm deployment and wait for updated resources to be ready.
 * This is necessary because we need to modify the Deployment for sync mode after Helm has installed/upgraded the chart.
 */
async function configureSyncModeAndWait({
  ctx,
  log,
  provider,
  action,
  api,
  namespace,
  manifests,
  timeout,
}: {
  ctx: KubernetesPluginContext
  log: ActionLog
  provider: KubernetesPluginContext["provider"]
  action: ResolvedDeployAction<HelmDeployConfig>
  api: KubeApi
  namespace: string
  manifests: KubernetesResource[]
  timeout: number
}): Promise<void> {
  const spec = action.getSpec()
  const mode = action.mode()

  // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
  // installing/upgrading via Helm, we need to separately update the target here for sync-mode.
  let updatedManifests: SyncableResource[] = []
  if (mode === "sync" && spec.sync && !isEmpty(spec.sync)) {
    updatedManifests = (
      await configureSyncMode({
        ctx,
        log,
        provider,
        action,
        defaultTarget: spec.defaultTarget,
        manifests,
        spec: spec.sync,
      })
    ).updated
    await apply({ log, ctx, api, provider, manifests: updatedManifests, namespace })
  }

  // FIXME: we should get these resources from the cluster, and not use the manifests from the local `helm template`
  // command, because they may be legitimately inconsistent.
  if (updatedManifests.length) {
    await waitForResources({
      namespace,
      ctx,
      provider,
      waitForJobs: false, // should we also add a waitForJobs option to the HelmDeployAction?
      logContext: action.key(),
      resources: updatedManifests, // We only wait for manifests updated for local / sync mode.
      log,
      timeoutSec: timeout,
    })
  }
}
