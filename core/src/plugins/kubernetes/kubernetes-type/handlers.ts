/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { cloneDeep, isEmpty, partition, uniq } from "lodash"
import { NamespaceStatus } from "../../../plugin/base"
import { ModuleActionHandlers } from "../../../plugin/plugin"
import { serviceStateToActionState, ServiceStatus } from "../../../types/service"
import { gardenAnnotationKey } from "../../../util/string"
import { KubeApi } from "../api"
import { KubernetesPluginContext } from "../config"
import { configureDevMode, startDevModeSyncs } from "../dev-mode"
import { apply, deleteObjectsBySelector, KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { streamK8sLogs } from "../logs"
import { getActionNamespace, getActionNamespaceStatus } from "../namespace"
import { getForwardablePorts, killPortForwards } from "../port-forward"
import { getK8sIngresses } from "../status/ingress"
import { compareDeployedResources, isConfiguredForLocalMode, waitForResources } from "../status/status"
import { BaseResource, KubernetesResource, KubernetesServerResource, SyncableResource } from "../types"
import { convertServiceResource, gardenNamespaceAnnotationValue, getManifests } from "./common"
import { configureKubernetesModule, KubernetesModule } from "./module-config"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"
import { ExecBuildConfig } from "../../exec/config"
import { KubernetesActionConfig, KubernetesDeployAction, KubernetesDeployActionConfig } from "./config"
import { DeployActionHandler } from "../../../plugin/action-types"
import { convertKubernetesDevModeSpec } from "../helm/handlers"
import { getTargetResource } from "../util"
import { LogEntry } from "../../../logger/log-entry"

export const kubernetesHandlers: Partial<ModuleActionHandlers<KubernetesModule>> = {
  configure: configureKubernetesModule,

  convert: async (params) => {
    const { module, services, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
    const actions: (ExecBuildConfig | KubernetesActionConfig)[] = []

    if (dummyBuild) {
      actions.push(dummyBuild)
    }

    const service = services[0] // There is always exactly one service in kubernetes modules
    const serviceResource = module.spec.serviceResource

    const deployAction: KubernetesDeployActionConfig = {
      kind: "deploy",
      type: "kubernetes",
      name: module.name,
      ...params.baseFields,

      build: dummyBuild?.name,
      dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

      include: module.spec.files,

      spec: {
        ...module.spec,

        devMode: convertKubernetesDevModeSpec(module, service, serviceResource),
      },
    }

    if (serviceResource?.containerModule) {
      const build = convertBuildDependency(serviceResource.containerModule)

      // TODO-G2: make this implicit
      deployAction.dependencies?.push(build)
    }

    actions.push(deployAction)

    for (const task of module.testConfigs) {
      const resource = convertServiceResource(module, task.spec.resource)

      if (!resource) {
        continue
      }

      actions.push({
        kind: "run",
        type: "kubernetes",
        name: module.name,
        ...params.baseFields,
        disabled: task.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(task.dependencies, dummyBuild),

        spec: {
          ...task.spec,
          resource,
        },
      })
    }

    for (const test of module.testConfigs) {
      const resource = convertServiceResource(module, test.spec.resource)

      if (!resource) {
        continue
      }

      actions.push({
        kind: "test",
        type: "kubernetes",
        name: module.name + "-" + test.name,
        ...params.baseFields,
        disabled: test.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(test.dependencies, dummyBuild),

        spec: {
          ...test.spec,
          resource,
        },
      })
    }

    return {
      group: {
        kind: "Group",
        name: module.name,
        actions,
        variables: module.variables,
        varfiles: module.varfile ? [module.varfile] : undefined,
      },
    }
  },
}

interface KubernetesStatusDetail {
  remoteResources: KubernetesServerResource[]
}

export type KubernetesServiceStatus = ServiceStatus<KubernetesStatusDetail>

export const getKubernetesDeployStatus: DeployActionHandler<"getStatus", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log, devMode, localMode } = params
  const spec = action.getSpec()

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
    skipCreate: true,
  })
  const namespace = namespaceStatus.namespaceName
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // FIXME: We're currently reading the manifests from the module source dir (instead of build dir)
  // because the build may not have been staged.
  // This means that manifests added via the `build.dependencies[].copy` field will not be included.
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace, readFromSrcDir: true })
  const prepareResult = await configureSpecialModesForManifests({
    ctx: k8sCtx,
    log,
    action,
    devMode,
    localMode,
    manifests,
  })
  const preparedManifests = prepareResult.manifests

  let { state, remoteResources, deployedWithDevMode, deployedWithLocalMode } = await compareDeployedResources(
    k8sCtx,
    api,
    namespace,
    preparedManifests,
    log
  )

  // Local mode has its own port-forwarding configuration
  const forwardablePorts = deployedWithLocalMode ? [] : getForwardablePorts(remoteResources, action)

  if (state === "ready") {
    // Local mode always takes precedence over dev mode
    if (localMode && spec.localMode) {
      const targetSpec = spec.localMode.target || spec.defaultTarget

      if (targetSpec) {
        const target = await getTargetResource({
          ctx: k8sCtx,
          log,
          provider: k8sCtx.provider,
          action,
          manifests: remoteResources,
          query: targetSpec,
        })

        if (!isConfiguredForLocalMode(target)) {
          state = "outdated"
        }
      }
    } else if (devMode && spec.devMode?.syncs) {
      // Need to start the dev-mode sync here, since the deployment handler won't be called with state=ready.
      await startDevModeSyncs({
        ctx: k8sCtx,
        log,
        action,
        actionDefaults: spec.devMode.defaults || {},
        defaultTarget: spec.defaultTarget,
        basePath: action.basePath(), // TODO-G2: double check if this holds up
        defaultNamespace: namespace,
        manifests: preparedManifests,
        syncs: spec.devMode.syncs,
      })
    }
  }

  return {
    state: serviceStateToActionState(state),
    detail: {
      forwardablePorts,
      state,
      version: state === "ready" ? action.versionString() : undefined,
      detail: { remoteResources },
      devMode: deployedWithDevMode,
      localMode: deployedWithLocalMode,
      namespaceStatuses: [namespaceStatus],
      ingresses: getK8sIngresses(remoteResources),
    },
    // TODO-G2
    outputs: {},
  }
}

export const kubernetesDeploy: DeployActionHandler<"deploy", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log, devMode, localMode } = params

  const spec = action.getSpec()

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })
  const namespace = namespaceStatus.namespaceName

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  // We separate out manifests for namespace resources, since we don't want to apply a prune selector
  // when applying them.
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    // Don't prune namespaces
    await apply({ log, ctx, api, provider, manifests: namespaceManifests })
    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: action.name,
      resources: namespaceManifests,
      log,
      timeoutSec: spec.timeout || KUBECTL_DEFAULT_TIMEOUT,
    })
  }

  let modifiedResources: SyncableResource[] = []
  let preparedManifests = manifests

  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  if (otherManifests.length > 0) {
    if ((devMode && spec.devMode) || (localMode && spec.localMode)) {
      const configured = await configureSpecialModesForManifests({
        ctx: k8sCtx,
        log,
        action,
        devMode,
        localMode,
        manifests,
      })
      preparedManifests = configured.manifests
      modifiedResources = configured.updated
    }

    await apply({ log, ctx, api, provider: k8sCtx.provider, manifests: preparedManifests, pruneLabels })
    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: action.name,
      resources: preparedManifests,
      log,
      timeoutSec: spec.timeout || KUBECTL_DEFAULT_TIMEOUT,
    })
  }

  const status = await getKubernetesDeployStatus(<any>params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, status.detail?.forwardablePorts || [], log)

  if (modifiedResources.length > 0) {
    // Local mode always takes precedence over dev mode
    if (localMode && spec.localMode) {
      await startServiceInLocalMode({
        ctx,
        spec: spec.localMode,
        // TODO-G2: Support multiple processes+targets.
        targetResource: modifiedResources[0],
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
        manifests: preparedManifests,
        syncs: spec.devMode.syncs,
      })
    }
  }

  const namespaceStatuses = [namespaceStatus]

  if (namespaceManifests.length > 0) {
    namespaceStatuses.push(
      ...namespaceManifests.map(
        (m) =>
          ({
            pluginName: provider.name,
            namespaceName: m.metadata.name,
            state: "ready",
          } as NamespaceStatus)
      )
    )
  }

  return {
    ...status,
    detail: {
      ...status.detail!,
      namespaceStatuses,
    },
  }
}

export const deleteKubernetesDeploy: DeployActionHandler<"delete", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  /**
   * We separate out manifests for namespace resources, since we need to delete each of them by name.
   *
   * Unlike other resources, Garden annotates namespace resources with their name - see `getManifests` for a discussion
   * of this.
   */
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    await Bluebird.map(namespaceManifests, (ns) => {
      const selector = `${gardenAnnotationKey("service")}=${gardenNamespaceAnnotationValue(ns.metadata.name)}`
      return deleteObjectsBySelector({
        log,
        ctx,
        provider,
        namespace,
        selector,
        objectTypes: ["Namespace"],
        includeUninitialized: false,
      })
    })
  }
  if (otherManifests.length > 0) {
    await deleteObjectsBySelector({
      log,
      ctx,
      provider,
      namespace,
      selector: `${gardenAnnotationKey("service")}=${action.name}`,
      objectTypes: uniq(manifests.map((m) => m.kind)),
      includeUninitialized: false,
    })
  }

  const status: KubernetesServiceStatus = { state: "missing", detail: { remoteResources: [] } }

  if (namespaceManifests.length > 0) {
    status.namespaceStatuses = namespaceManifests.map((m) => ({
      namespaceName: m.metadata.name,
      state: "missing",
      pluginName: provider.name,
    }))
  }

  return {
    state: "ready",
    detail: status,
    outputs: {},
  }
}

export const getKubernetesDeployLogs: DeployActionHandler<"getLogs", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  return streamK8sLogs({
    ...params,
    provider,
    actionName: action.name,
    defaultNamespace: namespace,
    resources: manifests,
  })
}

/**
 * Looks for a dev-mode or local-mode target in a list of manifests.
 * If found, the target is either configured for dev-mode/local-mode
 * or annotated with `dev-mode: false`, or `local-mode: false`.
 *
 * Returns the manifests with the original resource replaced by the modified spec.
 *
 * No-op if no target is found and neither dev-mode nor local-mode is enabled.
 */
async function configureSpecialModesForManifests({
  ctx,
  log,
  action,
  devMode,
  localMode,
  manifests,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  action: KubernetesDeployAction
  devMode: boolean
  localMode: boolean
  manifests: KubernetesResource<BaseResource>[]
}) {
  const spec = action.getSpec()

  // Local mode always takes precedence over dev mode
  if (localMode && spec.localMode && !isEmpty(spec.localMode)) {
    // TODO-G2: Support multiple local processes+targets
    const query = spec.localMode.target || spec.defaultTarget

    if (!query) {
      log.warn({
        section: action.key(),
        symbol: "warning",
        msg: "Neither `localMode.target` nor `defaultTarget` is configured. Cannot Deploy in local mode.",
      })
      return { updated: [], manifests }
    }

    const target = cloneDeep(
      await getTargetResource({
        ctx,
        log,
        provider: ctx.provider,
        action,
        manifests,
        query,
      })
    )

    // The "local-mode" annotation is set in `configureLocalMode`.
    await configureLocalMode({
      ctx,
      spec: spec.localMode,
      targetResource: target,
      action,
      log,
      containerName: spec.localMode.containerName,
    })

    // Replace the original resource with the modified spec
    const preparedManifests = manifests
      .filter((m) => !(m.kind === target!.kind && target?.metadata.name === m.metadata.name))
      .concat(<KubernetesResource<BaseResource>>target)

    return { updated: [target], manifests: preparedManifests }
  } else if (devMode && spec.devMode && !isEmpty(spec.devMode)) {
    // The "dev-mode" annotation is set in `configureDevMode`.
    return configureDevMode({
      ctx,
      log,
      provider: ctx.provider,
      action,
      defaultTarget: spec.defaultTarget,
      manifests,
      spec: spec.devMode,
    })
  } else {
    // Nothing to do, so we return the original manifests
    return { manifests, updated: [] }
  }
}
