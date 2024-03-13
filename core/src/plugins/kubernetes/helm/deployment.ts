/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { waitForResources } from "../status/status.js"
import { helm } from "./helm-cli.js"
import type { HelmGardenMetadataConfigMapData } from "./common.js"
import { filterManifests, getReleaseName, getValueArgs, prepareManifests, prepareTemplates } from "./common.js"
import { gardenCloudAECPauseAnnotation, getPausedResources, getReleaseStatus, getRenderedResources } from "./status.js"
import { apply, deleteResources } from "../kubectl.js"
import type { KubernetesPluginContext } from "../config.js"
import { getForwardablePorts, killPortForwards } from "../port-forward.js"
import { getActionNamespace, getActionNamespaceStatus } from "../namespace.js"
import { configureSyncMode } from "../sync.js"
import { KubeApi } from "../api.js"
import type { ConfiguredLocalMode } from "../local-mode.js"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { HelmDeployAction } from "./config.js"
import { isEmpty } from "lodash-es"
import { getK8sIngresses } from "../status/ingress.js"
import { toGardenError } from "../../../exceptions.js"
import { upsertConfigMap } from "../util.js"

export const helmDeploy: DeployActionHandler<"deploy", HelmDeployAction> = async (params) => {
  const { ctx, action, log, force } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const spec = action.getSpec()
  let attached = false

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
    "--namespace",
    namespace,
    "--timeout",
    timeout.toString(10) + "s",
    ...(await getValueArgs({ action, valuesPath: preparedTemplates.valuesPath })),
  ]

  if (spec.atomic) {
    // Make sure chart gets purged if it fails to install
    commonArgs.push("--atomic")
  }

  if (releaseStatus.state === "missing") {
    log.silly(() => `Installing Helm release ${releaseName}`)
    const installArgs = ["install", releaseName, ...reference, ...commonArgs]
    if (force && !ctx.production) {
      installArgs.push("--replace")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...installArgs], emitLogEvents: true })
  } else {
    log.silly(() => `Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, ...reference, "--install", ...commonArgs]
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs], emitLogEvents: true })

    // If ctx.cloudApi is defined, the user is logged in and they might be trying to deploy to an environment
    // that could have been paused by Garden Cloud's AEC functionality. We therefore make sure to clean up any
    // dangling annotations created by Garden Cloud.
    if (ctx.cloudApi) {
      try {
        const pausedResources = await getPausedResources({ ctx: k8sCtx, action, namespace, releaseName, log })
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
    }
  }

  //create or upsert configmap with garden metadata
  const gardenMetadata: HelmGardenMetadataConfigMapData = {
    actionName: action.name,
    projectName: ctx.projectName,
    version: action.versionString(),
    mode: action.mode(),
  }

  await upsertConfigMap({
    api,
    namespace,
    key: `garden-helm-metadata-${action.name}`,
    labels: {},
    data: gardenMetadata,
  })

  const preparedManifests = await prepareManifests({
    ctx: k8sCtx,
    log,
    action,
    ...preparedTemplates,
  })
  const manifests = await filterManifests(preparedManifests)

  const mode = action.mode()

  // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
  // installing/upgrading via Helm, we need to separately update the target here for sync-mode/local-mode.
  // Local mode always takes precedence over sync mode.
  let configuredLocalMode: ConfiguredLocalMode | undefined = undefined
  if (mode === "local" && spec.localMode && !isEmpty(spec.localMode)) {
    configuredLocalMode = await configureLocalMode({
      ctx,
      spec: spec.localMode,
      defaultTarget: spec.defaultTarget,
      manifests,
      action,
      log,
    })
    await apply({ log, ctx, api, provider, manifests: configuredLocalMode.updated, namespace })
  } else if (mode === "sync" && spec.sync && !isEmpty(spec.sync)) {
    const configured = await configureSyncMode({
      ctx,
      log,
      provider,
      action,
      defaultTarget: spec.defaultTarget,
      manifests,
      spec: spec.sync,
    })
    await apply({ log, ctx, api, provider, manifests: configured.updated, namespace })
  }

  // FIXME: we should get these objects from the cluster, and not from the local `helm template` command, because
  // they may be legitimately inconsistent.
  const statuses = await waitForResources({
    namespace,
    ctx,
    provider,
    actionName: action.key(),
    resources: manifests,
    log,
    timeoutSec: timeout,
  })

  const forwardablePorts = getForwardablePorts({ resources: manifests, parentAction: action, mode })

  // Make sure port forwards work after redeployment
  killPortForwards(action, forwardablePorts || [], log)

  // Local mode always takes precedence over sync mode.
  if (mode === "local" && spec.localMode && configuredLocalMode && configuredLocalMode.updated?.length) {
    await startServiceInLocalMode({
      ctx,
      spec: spec.localMode,
      targetResource: configuredLocalMode.updated[0],
      manifests,
      action,
      namespace,
      log,
    })
    attached = true
  }
  // Get ingresses of deployed resources
  const ingresses = getK8sIngresses(manifests, provider)

  return {
    state: "ready",
    detail: {
      forwardablePorts,
      state: "ready",
      version: action.versionString(),
      ingresses,
      detail: { remoteResources: statuses.map((s) => s.resource) },
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
