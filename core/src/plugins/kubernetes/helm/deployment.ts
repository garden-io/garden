/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { waitForResources } from "../status/status"
import { helm } from "./helm-cli"
import { filterManifests, getReleaseName, getValueArgs, prepareManifests, prepareTemplates } from "./common"
import { gardenCloudAECPauseAnnotation, getPausedResources, getReleaseStatus, getRenderedResources } from "./status"
import { apply, deleteResources } from "../kubectl"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts, killPortForwards } from "../port-forward"
import { getActionNamespace, getActionNamespaceStatus } from "../namespace"
import { configureDevMode, startDevModeSyncs } from "../dev-mode"
import { KubeApi } from "../api"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"
import { isEmpty } from "lodash"
import { SyncableResource } from "../types"
import { getTargetResource } from "../util"

export const helmDeploy: DeployActionHandler<"deploy", HelmDeployAction> = async (params) => {
  const { ctx, action, log, force, devMode, localMode } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const spec = action.getSpec()

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
  const releaseStatus = await getReleaseStatus({ ctx: k8sCtx, action, releaseName, log, devMode, localMode })

  const commonArgs = [
    "--namespace",
    namespace,
    "--timeout",
    spec.timeout.toString(10) + "s",
    ...(await getValueArgs({ action, devMode, localMode, valuesPath: preparedTemplates.valuesPath })),
  ]

  if (spec.atomicInstall) {
    // Make sure chart gets purged if it fails to install
    commonArgs.push("--atomic")
  }

  if (releaseStatus.state === "missing") {
    log.silly(`Installing Helm release ${releaseName}`)
    const installArgs = ["install", releaseName, ...reference, ...commonArgs]
    if (force && !ctx.production) {
      installArgs.push("--replace")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...installArgs], emitLogEvents: true })
  } else {
    log.silly(`Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, ...reference, "--install", ...commonArgs]
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs], emitLogEvents: true })

    // If ctx.cloudApi is defined, the user is logged in and they might be trying to deploy to an environment
    // that could have been paused by by Garden Cloud's AEC functionality. We therefore make sure to clean up any
    // dangling annotations created by Garden Cloud.
    if (ctx.cloudApi) {
      try {
        const pausedResources = await getPausedResources({ ctx: k8sCtx, action, namespace, releaseName, log })
        await Bluebird.all(
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
        const errorMsg = `Failed to remove Garden Cloud AEC annotations for service: ${action.name}.`
        log.warn(errorMsg)
        log.debug(error)
      }
    }
  }

  let preparedManifests = await prepareManifests({
    ctx: k8sCtx,
    log,
    action,
    devMode,
    localMode,
    ...preparedTemplates,
  })
  const manifests = await filterManifests(preparedManifests)

  const localModeTargetSpec = spec.localMode?.target || spec.defaultTarget
  let localModeTarget: SyncableResource | undefined = undefined

  if (localMode && localModeTargetSpec) {
    localModeTarget = await getTargetResource({
      ctx,
      log,
      provider,
      action,
      manifests,
      query: localModeTargetSpec,
    })
  }

  // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
  // installing/upgrading via Helm, we need to separately update the target here for dev-mode/local-mode.
  // Local mode always takes precedence over dev mode.
  if (localMode && spec.localMode && !isEmpty(spec.localMode) && localModeTarget) {
    await configureLocalMode({
      ctx,
      spec: spec.localMode,
      targetResource: localModeTarget,
      action,
      log,
      containerName: spec.localMode.containerName,
    })
    await apply({ log, ctx, api, provider, manifests: [localModeTarget], namespace })
  } else if (devMode && spec.devMode && !isEmpty(spec.devMode)) {
    const configured = await configureDevMode({
      ctx,
      log,
      provider,
      action,
      defaultTarget: spec.defaultTarget,
      manifests,
      spec: spec.devMode,
    })
    await apply({ log, ctx, api, provider, manifests: configured.updated, namespace })
  }

  // FIXME: we should get these objects from the cluster, and not from the local `helm template` command, because
  // they may be legitimately inconsistent.
  const statuses = await waitForResources({
    namespace,
    ctx,
    provider,
    actionName: action.name,
    resources: manifests,
    log,
    timeoutSec: spec.timeout,
  })

  // Local mode has its own port-forwarding configuration
  const forwardablePorts = localMode && spec.localMode ? [] : getForwardablePorts(manifests, action)

  // Make sure port forwards work after redeployment
  killPortForwards(action, forwardablePorts || [], log)

  // Local mode always takes precedence over dev mode.
  if (localMode && spec.localMode && localModeTarget) {
    await startServiceInLocalMode({
      ctx,
      spec: spec.localMode,
      targetResource: localModeTarget,
      action,
      namespace,
      log,
      containerName: spec.localMode.containerName,
    })
  } else if (devMode && spec.devMode?.syncs?.length) {
    await startDevModeSyncs({
      ctx: k8sCtx,
      log,
      action,
      actionDefaults: spec.devMode.defaults || {},
      defaultTarget: spec.defaultTarget,
      basePath: action.basePath(), // TODO-G2: double check if this holds up
      defaultNamespace: namespace,
      manifests,
      syncs: spec.devMode.syncs,
    })
  }

  return {
    state: "ready",
    detail: {
      forwardablePorts,
      state: "ready",
      version: action.versionString(),
      detail: { remoteResources: statuses.map((s) => s.resource) },
      namespaceStatuses: [namespaceStatus],
    },
    // TODO-G2
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

  // Wait for resources to terminate
  await deleteResources({ log, ctx, provider, resources, namespace })

  log.setSuccess("Service deleted")

  return { state: "not-ready", outputs: {}, detail: { state: "missing", detail: { remoteResources: [] } } }
}
