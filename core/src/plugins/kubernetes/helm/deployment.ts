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
import type { HelmDeployAction } from "./config.js"
import { isEmpty } from "lodash-es"
import { getK8sIngresses } from "../status/ingress.js"
import { toGardenError } from "../../../exceptions.js"
import { upsertConfigMap } from "../util.js"
import type { KubernetesResource, SyncableResource } from "../types.js"
import { isTruthy } from "../../../util/util.js"
import { styles } from "../../../logger/styles.js"
import type { ActionLog } from "../../../logger/log-entry.js"

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
  const helmPromise = helm({ ctx: k8sCtx, namespace, log, args: [...helmArgs], emitLogEvents: true })
    .then(() => {
      helmCommandSuccessful = true
    })
    .catch((error) => {
      throw { source: "helm", error }
    })

  log.debug(() => `${shouldInstall ? "Installing" : "Upgrading"} Helm release ${releaseName}`)
  if (failFast) {
    // In this case we use Garden's resource monitoring and fail fast if one of the resources being installed is unhealthy.
    log.silly(() => `Will fail fast if Helm resources are unhealthy`)
    const waitForResourcesPromise = waitForResources({
      namespace,
      ctx: k8sCtx,
      provider: k8sCtx.provider,
      waitForJobs: false, // should we also add a waitForJobs option to the HelmDeployAction?
      logContext: action.key(),
      resources: manifests,
      log,
      timeoutSec: action.getConfig("timeout"),
    }).catch((error) => {
      throw { source: "waitForResources", error }
    })

    // Wait for either the first error or Helm completion
    try {
      await Promise.race([
        // Wait for helm to complete
        helmPromise,
        // If either throws, this will reject
        Promise.all([helmPromise, waitForResourcesPromise]),
      ])
    } catch (err) {
      wrappedInstallError = err
    }
  } else {
    // In this case we don't monitor the resources and simply let the Helm command run until completion
    log.silly(() => `Will not fail fast if Helm resources are unhealthy but wait for Helm to complete`)
    try {
      await helmPromise
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

  //create or upsert configmap with garden metadata
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

  // Update the namespace AEC annotations
  await updateNamespaceAecAnnotations({ ctx: k8sCtx, api, namespace, status: "none" })

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

  log.info(styles.success("Service deleted"))

  return { state: "not-ready", outputs: {}, detail: { state: "missing", detail: { remoteResources: [] } } }
}
